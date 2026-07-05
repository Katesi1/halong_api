import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  KYC_SUBMISSION_STATUS,
  PAYMENT_STATUS,
  PAYMENT_KIND,
  PAYMENT_METHOD,
  PAYMENT_PROVIDER,
  KYC_STATUS,
  SUBSCRIPTION_STATUS,
  NOTIFICATION_TYPE,
  AUDIT_ACTION,
  AUDIT_TARGET_TYPE,
  ROLE,
} from '../../common/constants';
import { UpdateReceivingBankDto } from './dto/update-receiving-bank.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import type { Messages } from '../../i18n';
import {
  buildVietQrPayload,
  sanitizeTransferContent,
} from './helpers/vietqr.helper';
import {
  parseBankWebhookPayload,
  extractSessionIdFromDescription,
} from './helpers/bank-webhook.helper';
import { generateInvoiceNumber } from './helpers/invoice.helper';
import {
  computeFullCycleTotal,
  computeUpgradeProrate,
  extendPeriod,
  isDowngrade,
  isUpgrade,
  pickBaseDate,
  planSubtotal,
  type BillingKind,
  type Cycle,
  type PriceBreakdown,
} from './helpers/billing.helper';

// QR code chỉ hợp lệ 15 phút (FE hiển thị countdown bằng `qrExpiresAt`).
// Session vẫn sống đến 24h để webhook/admin có thời gian đối soát sau khi user chuyển khoản.
const QR_EXPIRY_MINUTES = 15;
const SESSION_EXPIRY_MINUTES_BANK = 24 * 60;
const BANK_AMOUNT_TOLERANCE_VND = 1000;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
  ) {}

  // Singleton row id cho STK nhận tiền mua gói (payment_bank_account).
  private static readonly RECEIVING_BANK_ID = 'default';

  /** STK nhận tiền mua gói lấy từ ENV (fallback khi ADMIN chưa cấu hình DB). */
  private getBankConfigEnv() {
    return {
      bankName: this.configService.get<string>('BANK_NAME', 'Vietcombank'),
      accountNumber: this.configService.get<string>(
        'BANK_ACCOUNT_NUMBER',
        '0011004567890',
      ),
      accountName: this.configService.get<string>(
        'BANK_ACCOUNT_NAME',
        'CONG TY HALONG24H',
      ),
      bankBin: this.configService.get<string>('BANK_BIN', '970436'),
    };
  }

  /**
   * STK nhận tiền mua gói (subscription) — nguồn chân lý = DB (bảng payment_bank_account).
   * ADMIN chưa cấu hình → fallback về ENV BANK_* (giữ nguyên hành vi cũ).
   * `source` cho biết đang dùng giá trị DB hay ENV (FE admin hiển thị badge).
   */
  private async getReceivingBank(): Promise<{
    bankBin: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    source: 'db' | 'env';
    updatedAt: Date | null;
  }> {
    const row = await this.prisma.paymentBankAccount.findUnique({
      where: { id: PaymentService.RECEIVING_BANK_ID },
    });
    if (row) {
      return {
        bankBin: row.bankBin,
        bankName: row.bankName ?? '',
        accountNumber: row.bankAccountNumber,
        accountName: row.bankAccountName,
        source: 'db',
        updatedAt: row.updatedAt,
      };
    }
    const env = this.getBankConfigEnv();
    return { ...env, source: 'env', updatedAt: null };
  }

  /** ADMIN xem STK nhận tiền mua gói hiện hành (DB nếu có, ngược lại ENV). */
  async adminGetReceivingBank(msg: Messages) {
    const bank = await this.getReceivingBank();
    return {
      message: msg.payment.receivingBankGetSuccess,
      data: {
        bankBin: bank.bankBin,
        bankName: bank.bankName || null,
        bankAccountNumber: bank.accountNumber,
        bankAccountName: bank.accountName,
        source: bank.source, // 'db' = admin đã cấu hình | 'env' = đang dùng fallback
        updatedAt: bank.updatedAt,
      },
    };
  }

  /** ADMIN cập nhật STK nhận tiền mua gói → ghi bảng singleton + audit log. */
  async adminUpdateReceivingBank(
    adminId: string,
    dto: UpdateReceivingBankDto,
    msg: Messages,
  ) {
    const data = {
      bankBin: dto.bankBin,
      bankName: dto.bankName?.trim() || null,
      bankAccountNumber: dto.bankAccountNumber,
      bankAccountName: dto.bankAccountName.trim(),
      updatedById: adminId,
    };
    const row = await this.prisma.paymentBankAccount.upsert({
      where: { id: PaymentService.RECEIVING_BANK_ID },
      create: { id: PaymentService.RECEIVING_BANK_ID, ...data },
      update: data,
    });

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.PAYMENT_RECEIVING_BANK_UPDATE,
      targetType: AUDIT_TARGET_TYPE.SUBSCRIPTION,
      targetId: PaymentService.RECEIVING_BANK_ID,
      targetLabel: `${row.bankBin}/${row.bankAccountNumber}`,
      metadata: {
        bankBin: row.bankBin,
        bankName: row.bankName,
        bankAccountNumber: row.bankAccountNumber,
        bankAccountName: row.bankAccountName,
      },
    });

    return {
      message: msg.payment.receivingBankUpdateSuccess,
      data: {
        bankBin: row.bankBin,
        bankName: row.bankName,
        bankAccountNumber: row.bankAccountNumber,
        bankAccountName: row.bankAccountName,
        source: 'db' as const,
        updatedAt: row.updatedAt,
      },
    };
  }

  // ─── Plan label / amount helpers ─────────────────────────────────────────
  private formatPlanLabel(planName: string, cycle: string): string {
    return `${planName} · ${cycle === 'yearly' ? 'Năm' : 'Tháng'}`;
  }

  private computeExpectedTotal(
    plan: {
      pricePerRoom: number;
      minCharge: number;
      yearlyDiscountPct: number;
      vatPct: number;
    },
    cycle: string,
    rooms: number,
    priceOverride?: number | null,
  ): number {
    return computeFullCycleTotal(
      { id: '', ...plan },
      cycle as Cycle,
      rooms,
      priceOverride,
    ).total;
  }

  /**
   * Quote API — FE gọi để biết kind + breakdown trước khi mở màn thanh toán.
   * Hỗ trợ subscription (KYC lần đầu), renew (trùng plan+cycle), upgrade, downgrade.
   * KHÔNG tạo session — chỉ tính toán read-only.
   */
  async quote(
    user: { id: string },
    dto: { planId: string; cycle: string; rooms?: number },
    msg: Messages,
  ) {
    const plan = await this.prisma.billingPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.active) {
      throw new NotFoundException(msg.payment.planNotFound);
    }
    const cycle = dto.cycle as Cycle;

    const callerUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        subscriptionStatus: true,
        subscriptionPlanId: true,
        subscriptionCycle: true,
        subscriptionPriceOverride: true,
        currentPeriodEnd: true,
      },
    });
    if (callerUser?.subscriptionStatus === SUBSCRIPTION_STATUS.FROZEN) {
      throw new ConflictException(msg.payment.subscriptionFrozen);
    }

    // Identify current subscription for upgrade/downgrade context
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: {
          in: [
            SUBSCRIPTION_STATUS.ACTIVE,
            SUBSCRIPTION_STATUS.PAST_DUE,
            SUBSCRIPTION_STATUS.TRIAL,
          ],
        },
      },
      orderBy: { endsAt: 'desc' },
      include: { plan: true },
    });

    const hasActive = !!sub && !!sub.plan;
    const rooms = dto.rooms ?? sub?.rooms ?? plan.maxRooms ?? 1;
    if (plan.maxRooms && rooms > plan.maxRooms) {
      throw new BadRequestException(msg.billing.roomCountExceedsPlan);
    }

    let kind: BillingKind = 'subscription';
    let breakdown: PriceBreakdown;
    let effectiveAt: Date | null = null;
    let currentPlanId: string | null = null;
    let pendingPlanId: string | null = null;

    if (!hasActive) {
      // First-time subscription
      kind = 'subscription';
      breakdown = computeFullCycleTotal(
        plan,
        cycle,
        rooms,
        callerUser?.subscriptionPriceOverride,
      );
    } else if (sub.planId === dto.planId && sub.cycle === cycle) {
      // Same plan + cycle → renew (stack)
      kind = 'renew';
      currentPlanId = sub.planId;
      breakdown = computeFullCycleTotal(
        sub.plan,
        cycle,
        sub.rooms,
        callerUser?.subscriptionPriceOverride,
      );
    } else if (isUpgrade(sub.planId, dto.planId)) {
      kind = 'upgrade';
      currentPlanId = sub.planId;
      breakdown = computeUpgradeProrate(
        plan,
        cycle,
        rooms,
        callerUser?.subscriptionPriceOverride,
        sub.plan,
        sub.cycle as Cycle,
        sub.rooms,
        callerUser?.subscriptionPriceOverride,
        callerUser?.currentPeriodEnd ?? sub.endsAt,
      );
    } else if (isDowngrade(sub.planId, dto.planId)) {
      kind = 'downgrade';
      currentPlanId = sub.planId;
      pendingPlanId = dto.planId;
      effectiveAt = callerUser?.currentPeriodEnd ?? sub.endsAt;
      breakdown = {
        listPrice: planSubtotal(
          plan,
          cycle,
          rooms,
          callerUser?.subscriptionPriceOverride,
        ),
        creditApplied: 0,
        vat: 0,
        total: 0,
        periodExtension: null,
      };
    } else {
      // Different cycle, same tier → treat as renew with new cycle (no prorate)
      kind = 'renew';
      currentPlanId = sub.planId;
      breakdown = computeFullCycleTotal(
        plan,
        cycle,
        rooms,
        callerUser?.subscriptionPriceOverride,
      );
    }

    return {
      message: msg.payment.quoteSuccess,
      data: {
        kind,
        planId: dto.planId,
        cycle,
        rooms,
        totalAmount: breakdown.total,
        breakdown: {
          listPrice: breakdown.listPrice,
          creditApplied: breakdown.creditApplied,
          vat: breakdown.vat,
          remainingDays: breakdown.remainingDays ?? null,
          totalDays: breakdown.totalDays ?? null,
          currentPlanId,
          periodExtension: breakdown.periodExtension ?? null,
        },
        ...(kind === 'downgrade' ? { effectiveAt, pendingPlanId } : {}),
      },
    };
  }

  // ─── Build session payment artefacts (bankInfo + VietQR) ─────────────────
  // Hiện chỉ hỗ trợ Bank Transfer + VietQR. Các method khác đã bị loại khỏi v2.
  private async buildSessionArtefacts(
    sessionId: string,
    method: string,
    totalAmount: number,
    _orderInfo: string,
    _ipAddr: string,
  ): Promise<{
    qrCode: string | null;
    bankInfo: any;
    redirectUrl: string | null;
    payUrl: string | null;
    expiresAt: Date;
    qrExpiresAt: Date;
  }> {
    if (method !== PAYMENT_METHOD.BANK_TRANSFER) {
      throw new BadRequestException(
        `Phương thức thanh toán không được hỗ trợ: ${method}`,
      );
    }

    const bank = await this.getReceivingBank();
    const content = sanitizeTransferContent(`HALONG24H ${sessionId}`);
    const vietQrPayload = buildVietQrPayload({
      bankBin: bank.bankBin,
      accountNumber: bank.accountNumber,
      amount: totalAmount,
      content,
    });
    const bankInfo = {
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      bankBin: bank.bankBin,
      content,
      vietQrPayload,
    };

    const now = Date.now();
    return {
      qrCode: vietQrPayload,
      bankInfo,
      redirectUrl: null,
      payUrl: null,
      expiresAt: new Date(now + SESSION_EXPIRY_MINUTES_BANK * 60_000),
      qrExpiresAt: new Date(now + QR_EXPIRY_MINUTES * 60_000),
    };
  }

  private toSessionResponse(session: {
    id: string;
    method: string;
    totalAmount: number;
    qrCode: string | null;
    bankInfo: any;
    redirectUrl: string | null;
    payUrl: string | null;
    expiresAt: Date;
    qrExpiresAt?: Date;
  }) {
    const qrExpiresAt =
      session.qrExpiresAt ??
      new Date(
        Math.min(
          session.expiresAt.getTime(),
          Date.now() + QR_EXPIRY_MINUTES * 60_000,
        ),
      );
    return {
      sessionId: session.id,
      method: session.method,
      totalAmount: session.totalAmount,
      qrCode: session.qrCode,
      bankInfo: session.bankInfo,
      redirectUrl: session.redirectUrl,
      payUrl: session.payUrl,
      expiresAt: session.expiresAt,
      qrExpiresAt,
      reconcileWindowHours: SESSION_EXPIRY_MINUTES_BANK / 60,
    };
  }

  // ─── Initiate ────────────────────────────────────────────────────────────
  // Branches:
  //   • Đã có subscription active/past_due/trial cùng plan+cycle → renew (stack 1 kỳ)
  //   • Đã có subscription với tier cao hơn của tier mới → downgrade (409 deferred)
  //   • Đã có subscription với tier thấp hơn → upgrade (prorate)
  //   • Chưa có subscription → first-time subscription (cần KYC submission)
  async initiate(
    user: { id: string },
    dto: {
      planId: string;
      cycle: string;
      method: string;
      rooms: number;
      totalAmount: number;
    },
    ipAddr: string,
    msg: Messages,
  ) {
    const plan = await this.prisma.billingPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.active) {
      throw new NotFoundException(msg.payment.planNotFound);
    }
    if (plan.maxRooms && dto.rooms > plan.maxRooms) {
      throw new BadRequestException(msg.billing.roomCountExceedsPlan);
    }

    const callerUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        kycStatus: true,
        subscriptionPriceOverride: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
      },
    });
    if (callerUser?.subscriptionStatus === SUBSCRIPTION_STATUS.FROZEN) {
      throw new ConflictException(msg.payment.subscriptionFrozen);
    }

    await this.ensureNoPendingSession(user.id, msg);

    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: {
          in: [
            SUBSCRIPTION_STATUS.ACTIVE,
            SUBSCRIPTION_STATUS.PAST_DUE,
            SUBSCRIPTION_STATUS.TRIAL,
          ],
        },
      },
      orderBy: { endsAt: 'desc' },
      include: { plan: true },
    });

    const cycle = dto.cycle as Cycle;
    const cycleChanged = sub ? sub.cycle !== cycle : false;
    const priceOverride = callerUser?.subscriptionPriceOverride ?? null;

    // ─── Downgrade → deferred, không charge ───────────────────────────────
    if (sub && sub.plan && isDowngrade(sub.planId, dto.planId)) {
      const effectiveAt = callerUser?.currentPeriodEnd ?? sub.endsAt;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          pendingPlanId: dto.planId,
          pendingCycle: cycle,
          pendingEffectiveAt: effectiveAt,
        },
      });
      throw new ConflictException({
        code: 'downgradeScheduled',
        message: msg.payment.downgradeScheduled,
        effectiveAt,
        pendingPlanId: dto.planId,
      });
    }

    // ─── Upgrade → prorate, KIND=upgrade ──────────────────────────────────
    if (sub && sub.plan && isUpgrade(sub.planId, dto.planId)) {
      const breakdown = computeUpgradeProrate(
        plan,
        cycle,
        dto.rooms,
        priceOverride,
        sub.plan,
        sub.cycle as Cycle,
        sub.rooms,
        priceOverride,
        callerUser?.currentPeriodEnd ?? sub.endsAt,
      );
      // Bỏ validate `clientAmount` cho upgrade: FE cũ gửi full giá gói mới
      // (chưa biết prorate). BE là source of truth — `totalAmount` trong response
      // session sẽ là số đã prorate. FE đọc lại từ response thay vì tự tính.
      return this.createBillingSession({
        user,
        plan,
        cycle,
        rooms: dto.rooms,
        method: dto.method,
        ipAddr,
        kind: PAYMENT_KIND.UPGRADE,
        breakdown,
        // clientAmount intentionally omitted for upgrade
        orderVerb: 'Nang cap',
        successMsg: msg.payment.initiateSuccess,
        msg,
      });
    }

    // ─── Same plan+cycle (or same tier, different cycle) → renew stack ────
    if (sub && sub.plan) {
      // Same tier (đã loại upgrade/downgrade) → coi là renew.
      // Cycle change handled by stacking with new cycle from baseDate.
      const breakdown = computeFullCycleTotal(
        plan,
        cycle,
        cycleChanged ? dto.rooms : sub.rooms,
        priceOverride,
      );
      return this.createBillingSession({
        user,
        plan,
        cycle,
        rooms: cycleChanged ? dto.rooms : sub.rooms,
        method: dto.method,
        ipAddr,
        kind: PAYMENT_KIND.RENEW,
        breakdown,
        clientAmount: dto.totalAmount,
        orderVerb: 'Gia han',
        successMsg: msg.payment.renewSuccess,
        msg,
      });
    }

    // ─── First-time subscription (KYC approved, payment after admin review) ─
    if (callerUser?.kycStatus !== KYC_STATUS.APPROVED) {
      throw new ForbiddenException(msg.payment.kycNotApproved);
    }

    const submission = await this.prisma.kycSubmission.findFirst({
      where: {
        userId: user.id,
        status: {
          in: [
            KYC_SUBMISSION_STATUS.APPROVED,
            KYC_SUBMISSION_STATUS.PAYMENT_PENDING,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!submission) {
      throw new NotFoundException(msg.kyc.submissionNotFound);
    }

    const existingPaid = await this.prisma.paymentSession.findFirst({
      where: { submissionId: submission.id, status: PAYMENT_STATUS.PAID },
    });
    if (existingPaid) {
      throw new ConflictException(msg.payment.alreadyPaid);
    }

    const breakdown = computeFullCycleTotal(
      plan,
      cycle,
      dto.rooms,
      priceOverride,
    );
    const tolerance = breakdown.total * 0.01;
    if (Math.abs(dto.totalAmount - breakdown.total) > tolerance) {
      throw new BadRequestException(msg.payment.amountMismatch);
    }

    await this.prisma.paymentSession.updateMany({
      where: { submissionId: submission.id, status: PAYMENT_STATUS.PENDING },
      data: { status: PAYMENT_STATUS.EXPIRED },
    });

    const planLabel = this.formatPlanLabel(plan.name, dto.cycle);
    const sessionId = crypto.randomUUID();
    const orderInfo = `Thanh toan ${plan.name} ${dto.cycle === 'yearly' ? 'nam' : 'thang'}`;
    const artefacts = await this.buildSessionArtefacts(
      sessionId,
      dto.method,
      breakdown.total,
      orderInfo,
      ipAddr,
    );

    const session = await this.prisma.paymentSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        submissionId: submission.id,
        kind: PAYMENT_KIND.SUBSCRIPTION,
        planId: dto.planId,
        planLabel,
        cycle: dto.cycle,
        rooms: dto.rooms,
        totalAmount: breakdown.total,
        method: dto.method,
        qrCode: artefacts.qrCode,
        bankInfo: artefacts.bankInfo,
        redirectUrl: artefacts.redirectUrl,
        payUrl: artefacts.payUrl,
        expiresAt: artefacts.expiresAt,
        breakdown: this.serializeBreakdown(breakdown),
      },
    });

    await this.prisma.kycSubmission.update({
      where: { id: submission.id },
      data: {
        status: KYC_SUBMISSION_STATUS.PAYMENT_PENDING,
        expectedRooms: dto.rooms,
      },
    });

    return {
      message: msg.payment.initiateSuccess,
      data: {
        ...this.toSessionResponse(session),
        kind: PAYMENT_KIND.SUBSCRIPTION,
        planId: dto.planId,
        cycle: dto.cycle,
        breakdown: this.serializeBreakdown(breakdown),
      },
    };
  }

  /**
   * Chặn user tạo session mới khi đang có session `pending` (chờ admin duyệt
   * hoặc đối soát ngân hàng). 24h sau cron `expirePendingSessions` sẽ tự
   * chuyển `pending → expired`, lúc đó user mới được tạo session khác.
   */
  private async ensureNoPendingSession(
    userId: string,
    msg: Messages,
  ): Promise<void> {
    const pending = await this.prisma.paymentSession.findFirst({
      where: { userId, status: PAYMENT_STATUS.PENDING },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        kind: true,
        totalAmount: true,
        planId: true,
        planLabel: true,
        cycle: true,
        method: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    if (!pending) return;
    throw new ConflictException({
      code: 'paymentPending',
      message: msg.payment.paymentPending,
      pendingSession: {
        sessionId: pending.id,
        kind: pending.kind,
        totalAmount: pending.totalAmount,
        planId: pending.planId,
        planLabel: pending.planLabel,
        cycle: pending.cycle,
        method: pending.method,
        createdAt: pending.createdAt,
        expiresAt: pending.expiresAt,
      },
    });
  }

  /** Shared helper to create a renew/upgrade payment session and return FE shape. */
  private async createBillingSession(opts: {
    user: { id: string };
    plan: { id: string; name: string };
    cycle: Cycle;
    rooms: number;
    method: string;
    ipAddr: string;
    kind: string;
    breakdown: PriceBreakdown;
    clientAmount?: number;
    orderVerb: string;
    successMsg: string;
    msg: Messages;
  }) {
    const {
      user,
      plan,
      cycle,
      rooms,
      method,
      ipAddr,
      kind,
      breakdown,
      clientAmount,
      orderVerb,
      successMsg,
      msg,
    } = opts;

    // Validate amount if FE provided one (legacy contract).
    if (clientAmount !== undefined && clientAmount !== null) {
      const tolerance = Math.max(breakdown.total * 0.01, 1);
      if (Math.abs(clientAmount - breakdown.total) > tolerance) {
        throw new BadRequestException(msg.payment.amountMismatch);
      }
    }

    // Expire previous pending sessions of same kind for this user
    await this.prisma.paymentSession.updateMany({
      where: {
        userId: user.id,
        kind,
        status: PAYMENT_STATUS.PENDING,
      },
      data: { status: PAYMENT_STATUS.EXPIRED },
    });

    const planLabel = this.formatPlanLabel(plan.name, cycle);
    const sessionId = crypto.randomUUID();
    const orderInfo = `${orderVerb} ${plan.name} ${cycle === 'yearly' ? 'nam' : 'thang'}`;
    const artefacts = await this.buildSessionArtefacts(
      sessionId,
      method,
      breakdown.total,
      orderInfo,
      ipAddr,
    );

    const session = await this.prisma.paymentSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        submissionId: null,
        kind,
        planId: plan.id,
        planLabel,
        cycle,
        rooms,
        totalAmount: breakdown.total,
        method,
        qrCode: artefacts.qrCode,
        bankInfo: artefacts.bankInfo,
        redirectUrl: artefacts.redirectUrl,
        payUrl: artefacts.payUrl,
        expiresAt: artefacts.expiresAt,
        breakdown: this.serializeBreakdown(breakdown),
      },
    });

    return {
      message: successMsg,
      data: {
        ...this.toSessionResponse(session),
        kind,
        planId: plan.id,
        cycle,
        breakdown: this.serializeBreakdown(breakdown),
      },
    };
  }

  private serializeBreakdown(b: PriceBreakdown): Record<string, any> {
    return {
      listPrice: b.listPrice,
      creditApplied: b.creditApplied,
      vat: b.vat,
      remainingDays: b.remainingDays ?? null,
      totalDays: b.totalDays ?? null,
      periodExtension: b.periodExtension ?? null,
    };
  }

  // ─── Renew an existing subscription ──────────────────────────────────────
  async renew(
    user: { id: string },
    method: string,
    ipAddr: string,
    msg: Messages,
  ) {
    const callerUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionStatus: true, subscriptionPriceOverride: true },
    });
    if (callerUser?.subscriptionStatus === SUBSCRIPTION_STATUS.FROZEN) {
      throw new ConflictException(msg.payment.subscriptionFrozen);
    }

    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: {
          in: [
            SUBSCRIPTION_STATUS.ACTIVE,
            SUBSCRIPTION_STATUS.PAST_DUE,
            SUBSCRIPTION_STATUS.TRIAL,
          ],
        },
      },
      orderBy: { endsAt: 'desc' },
      include: { plan: true },
    });
    if (!sub || !sub.plan) {
      throw new ConflictException(msg.payment.noActiveSubscription);
    }

    const breakdown = computeFullCycleTotal(
      sub.plan,
      sub.cycle as Cycle,
      sub.rooms,
      callerUser?.subscriptionPriceOverride,
    );

    return this.createBillingSession({
      user,
      plan: sub.plan,
      cycle: sub.cycle as Cycle,
      rooms: sub.rooms,
      method,
      ipAddr,
      kind: PAYMENT_KIND.RENEW,
      breakdown,
      orderVerb: 'Gia han',
      successMsg: msg.payment.renewSuccess,
      msg,
    });
  }

  // ─── Get session status (poll) ───────────────────────────────────────────
  async getStatus(user: { id: string }, sessionId: string, msg: Messages) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true },
    });
    if (!session || session.userId !== user.id) {
      throw new NotFoundException(msg.payment.sessionNotFound);
    }
    return {
      message: msg.payment.statusSuccess,
      data: { status: session.status },
    };
  }

  // ─── Get active (pending) session for current user ──────────────────────
  async getActiveSession(user: { id: string }, msg: Messages) {
    const session = await this.prisma.paymentSession.findFirst({
      where: { userId: user.id, status: PAYMENT_STATUS.PENDING },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        method: true,
        qrCode: true,
        bankInfo: true,
        redirectUrl: true,
        payUrl: true,
        expiresAt: true,
        createdAt: true,
        planId: true,
        planLabel: true,
        cycle: true,
        rooms: true,
      },
    });

    if (!session) {
      return { message: msg.payment.activeSuccess, data: null };
    }

    const qrExpiresAt = new Date(
      Math.min(
        session.expiresAt.getTime(),
        session.createdAt.getTime() + QR_EXPIRY_MINUTES * 60_000,
      ),
    );
    return {
      message: msg.payment.activeSuccess,
      data: {
        sessionId: session.id,
        status: session.status,
        totalAmount: session.totalAmount,
        method: session.method,
        qrCode: session.qrCode,
        bankInfo: session.bankInfo,
        redirectUrl: session.redirectUrl,
        payUrl: session.payUrl,
        expiresAt: session.expiresAt,
        qrExpiresAt,
        reconcileWindowHours: SESSION_EXPIRY_MINUTES_BANK / 60,
        createdAt: session.createdAt,
        planId: session.planId,
        planLabel: session.planLabel,
        cycle: session.cycle,
        rooms: session.rooms,
      },
    };
  }

  // ─── Cancel a pending session (user-initiated) ───────────────────────────
  async cancelSession(user: { id: string }, sessionId: string, msg: Messages) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, status: true, submissionId: true },
    });
    if (!session || session.userId !== user.id) {
      throw new NotFoundException(msg.payment.sessionNotFound);
    }
    if (session.status !== PAYMENT_STATUS.PENDING) {
      throw new ConflictException(msg.payment.cannotCancel);
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.paymentSession.update({
        where: { id: session.id },
        data: { status: PAYMENT_STATUS.FAILED, expiresAt: now },
      }),
      ...(session.submissionId
        ? [
            this.prisma.kycSubmission.updateMany({
              where: {
                id: session.submissionId,
                status: KYC_SUBMISSION_STATUS.PAYMENT_PENDING,
              },
              data: { status: KYC_SUBMISSION_STATUS.APPROVED },
            }),
          ]
        : []),
    ]);

    return {
      message: msg.payment.cancelSuccess,
      data: { sessionId: session.id, status: PAYMENT_STATUS.FAILED },
    };
  }

  // ─── History (cursor pagination, newest first) ───────────────────────────
  async getHistory(
    user: { id: string },
    limit = 50,
    cursor: string | undefined,
    msg: Messages,
  ) {
    const items = await this.prisma.paymentSession.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        kind: true,
        planLabel: true,
        cycle: true,
        totalAmount: true,
        method: true,
        status: true,
        createdAt: true,
        settledAt: true,
        paidAt: true,
        referenceCode: true,
        invoiceNumber: true,
      },
    });

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return {
      message: msg.payment.historySuccess,
      data: page.map((p) => ({
        id: p.id,
        kind: p.kind,
        planLabel: p.planLabel,
        cycle: p.cycle,
        amount: p.totalAmount,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
        settledAt: p.settledAt ?? p.paidAt,
        referenceCode: p.referenceCode,
        invoiceNumber: p.invoiceNumber,
      })),
      meta: { nextCursor, limit },
    };
  }

  // ─── Refund ──────────────────────────────────────────────────────────────
  async refund(user: { id: string }, sessionId: string, msg: Messages) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
      include: {
        submission: { select: { id: true, userId: true, status: true } },
      },
    });
    if (!session || session.userId !== user.id) {
      throw new NotFoundException(msg.payment.sessionNotFound);
    }
    if (session.status === PAYMENT_STATUS.REFUNDED) {
      throw new ConflictException(msg.payment.alreadyRefunded);
    }
    if (session.status !== PAYMENT_STATUS.PAID) {
      throw new BadRequestException(msg.payment.cannotRefund);
    }

    // Only original subscription payments tied to a submission can be refunded
    // through this endpoint (renew refunds need ops review).
    if (session.kind !== PAYMENT_KIND.SUBSCRIPTION || !session.submission) {
      throw new BadRequestException(msg.payment.cannotRefund);
    }
    const allowed = [
      KYC_SUBMISSION_STATUS.REJECTED,
      KYC_SUBMISSION_STATUS.AWAITING_APPROVAL,
      KYC_SUBMISSION_STATUS.APPROVED,
    ];
    if (!allowed.includes(session.submission.status as any)) {
      throw new BadRequestException(msg.payment.cannotRefund);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentSession.update({
        where: { id: sessionId },
        data: {
          status: PAYMENT_STATUS.REFUNDED,
          refundedAt: now,
          refundedAmount: session.totalAmount,
        },
      });
      // Audit row: a synthetic refund record
      await tx.paymentSession.create({
        data: {
          userId: session.userId,
          submissionId: session.submissionId,
          kind: PAYMENT_KIND.REFUND,
          planId: session.planId,
          planLabel: session.planLabel,
          cycle: session.cycle,
          rooms: session.rooms,
          totalAmount: session.totalAmount,
          method: session.method,
          status: PAYMENT_STATUS.REFUNDED,
          referenceCode: session.referenceCode,
          refundOfId: session.id,
          settledAt: now,
          paidAt: now,
          expiresAt: now,
        },
      });
      await tx.kycSubmission.update({
        where: { id: session.submission!.id },
        data: { status: KYC_SUBMISSION_STATUS.REFUNDED },
      });
      await tx.user.update({
        where: { id: user.id },
        data: {
          kycStatus: KYC_STATUS.REJECTED,
          subscriptionStatus: SUBSCRIPTION_STATUS.CANCELLED,
        },
      });
    });

    return {
      message: msg.payment.refundSuccess,
      data: { refunded: true, amount: session.totalAmount, refundedAt: now },
    };
  }

  // ─── Bank webhook (Casso / Sepay auto-detect) ────────────────────────────
  async handleBankWebhook(
    payload: Record<string, any>,
    headerSecret: string | undefined,
  ): Promise<{ success: boolean; message?: string }> {
    const expectedSecret = this.configService.get<string>(
      'BANK_WEBHOOK_SECRET',
    );
    if (!expectedSecret) {
      // Bắt buộc cấu hình — nếu thiếu, từ chối toàn bộ webhook thay vì
      // im lặng cho qua (kẻ tấn công có thể bơm thanh toán giả).
      this.logger.error(
        'BANK_WEBHOOK_SECRET chưa được cấu hình — từ chối webhook',
      );
      throw new ForbiddenException('Webhook authentication is not configured');
    }
    if (headerSecret !== expectedSecret) {
      this.logger.warn('Bank webhook secret mismatch');
      throw new ForbiddenException('Invalid webhook secret');
    }

    const txn = parseBankWebhookPayload(payload);
    if (!txn) {
      this.logger.warn('Bank webhook payload not recognized', payload);
      return { success: true, message: 'ignored: unrecognized payload' };
    }

    const sessionId = extractSessionIdFromDescription(txn.description);
    if (!sessionId) {
      this.logger.warn(
        `Bank webhook: cannot extract session id from "${txn.description}"`,
      );
      return { success: true, message: 'ignored: no session ref' };
    }

    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      this.logger.warn(`Bank webhook: session ${sessionId} not found`);
      return { success: true, message: 'ignored: session not found' };
    }

    if (session.status === PAYMENT_STATUS.PAID) {
      return { success: true, message: 'already paid' };
    }
    if (session.status !== PAYMENT_STATUS.PENDING) {
      return { success: true, message: `ignored: status=${session.status}` };
    }

    if (
      Math.abs(txn.amount - session.totalAmount) > BANK_AMOUNT_TOLERANCE_VND
    ) {
      this.logger.warn(
        `Bank webhook: amount mismatch sess=${session.totalAmount} txn=${txn.amount}`,
      );
      return { success: true, message: 'ignored: amount mismatch' };
    }

    await this.markSessionPaid(session.id, {
      provider: txn.provider,
      providerTxnId: txn.externalId,
      referenceCode: txn.referenceCode ?? txn.externalId,
      providerPayload: payload,
    });
    return { success: true };
  }

  // ─── Mark a session paid + cascade KYC / subscription updates ────────────
  private async markSessionPaid(
    sessionId: string,
    info: {
      provider: string;
      providerTxnId?: string;
      referenceCode?: string;
      providerPayload?: any;
    },
  ): Promise<void> {
    const now = new Date();
    const invoiceNumber = await generateInvoiceNumber(this.prisma, now);

    // Atomic guard: chỉ chuyển PENDING→PAID, ngăn 2 webhook concurrent cùng kích hoạt
    // cascade KYC / subscription dẫn tới double-payment.
    const claim = await this.prisma.paymentSession.updateMany({
      where: { id: sessionId, status: PAYMENT_STATUS.PENDING },
      data: {
        status: PAYMENT_STATUS.PAID,
        paidAt: now,
        settledAt: now,
        provider: info.provider,
        providerTxnId: info.providerTxnId ?? null,
        referenceCode: info.referenceCode ?? null,
        invoiceNumber,
        ...(info.providerPayload
          ? { providerPayload: info.providerPayload }
          : {}),
      },
    });

    if (claim.count === 0) {
      // Đã được xử lý bởi webhook trước → idempotent return.
      return;
    }

    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return;

    if (session.kind === PAYMENT_KIND.SUBSCRIPTION && session.submissionId) {
      const [submission, userRow] = await Promise.all([
        this.prisma.kycSubmission.findUnique({
          where: { id: session.submissionId },
          select: {
            id: true,
            trialEndsAt: true,
            chargeStartsAt: true,
            expectedRooms: true,
          },
        }),
        this.prisma.user.findUnique({
          where: { id: session.userId },
          select: { kycStatus: true },
        }),
      ]);

      if (userRow?.kycStatus === KYC_STATUS.APPROVED && submission) {
        await this.activateSubscriptionAfterPayment(session, submission);
        void this.notifications
          .notifyUser(
            session.userId,
            'Thanh toán thành công',
            `${session.planLabel ?? 'Gói'} đã được kích hoạt`,
            NOTIFICATION_TYPE.PAYMENT,
            session.id,
            'payment',
            { pushType: 'payment_succeeded', deepLink: '/dashboard' },
          )
          .catch(() => undefined);
      } else {
        // Legacy: payment before KYC admin review
        await this.prisma.$transaction([
          this.prisma.kycSubmission.update({
            where: { id: session.submissionId },
            data: { status: KYC_SUBMISSION_STATUS.AWAITING_APPROVAL },
          }),
          this.prisma.user.update({
            where: { id: session.userId },
            data: { kycStatus: KYC_STATUS.PENDING },
          }),
        ]);
        void this.notifications
          .notifyUser(
            session.userId,
            'Thanh toán thành công',
            `${session.planLabel ?? 'Gói'} đã thanh toán, hồ sơ KYC đang chờ duyệt`,
            NOTIFICATION_TYPE.PAYMENT,
            session.id,
            'payment',
            { pushType: 'payment_succeeded', deepLink: '/my-bookings' },
          )
          .catch(() => undefined);
      }
    } else if (session.kind === PAYMENT_KIND.RENEW) {
      await this.extendSubscription(session);
      void this.notifications
        .notifyUser(
          session.userId,
          'Gia hạn thành công',
          `${session.planLabel ?? 'Gói'} đã được gia hạn`,
          NOTIFICATION_TYPE.PAYMENT,
          session.id,
          'payment',
          { pushType: 'payment_succeeded', deepLink: '/my-bookings' },
        )
        .catch(() => undefined);
    } else if (session.kind === PAYMENT_KIND.UPGRADE) {
      await this.applyUpgrade(session);
      void this.notifications
        .notifyUser(
          session.userId,
          'Nâng cấp thành công',
          `${session.planLabel ?? 'Gói'} đã được nâng cấp`,
          NOTIFICATION_TYPE.PAYMENT,
          session.id,
          'payment',
          { pushType: 'payment_succeeded', deepLink: '/my-bookings' },
        )
        .catch(() => undefined);
    }

    void this.auditLog
      .log({
        actorId: session.userId,
        actorRole: 1, // OWNER
        action: 'payment.session_mark_paid',
        targetType: 'subscription',
        targetId: session.userId,
        targetLabel: `Session ${session.id}`,
        metadata: {
          kind: session.kind,
          amount: session.totalAmount,
          planId: session.planId,
          cycle: session.cycle,
        },
      })
      .catch(() => undefined);
  }

  /**
   * First subscription payment after KYC admin approval (Option A flow).
   * Uses trialEndsAt/chargeStartsAt set during admin KYC approve.
   */
  private async activateSubscriptionAfterPayment(
    session: {
      userId: string;
      submissionId: string | null;
      planId: string;
      cycle: string;
      rooms: number;
    },
    submission: {
      id: string;
      trialEndsAt: Date | null;
      chargeStartsAt: Date | null;
      expectedRooms: number | null;
    },
  ): Promise<void> {
    const now = new Date();
    const cycle = session.cycle as Cycle;
    const trialEndsAt =
      submission.trialEndsAt ??
      submission.chargeStartsAt ??
      extendPeriod(now, cycle);
    // Paid period = trial + 1 billing cycle.
    const paidEndsAt = extendPeriod(trialEndsAt, cycle);

    await this.prisma.$transaction(async (tx) => {
      await tx.kycSubmission.update({
        where: { id: submission.id },
        data: { status: KYC_SUBMISSION_STATUS.APPROVED },
      });

      const existing = await tx.subscription.findFirst({
        where: { userId: session.userId, planId: session.planId },
      });
      if (!existing) {
        await tx.subscription.create({
          data: {
            userId: session.userId,
            planId: session.planId,
            cycle: session.cycle,
            rooms: session.rooms ?? submission.expectedRooms ?? 1,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            startsAt: now,
            endsAt: paidEndsAt,
          },
        });
      } else {
        await tx.subscription.update({
          where: { id: existing.id },
          data: {
            cycle: session.cycle,
            rooms: session.rooms ?? submission.expectedRooms ?? 1,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            endsAt: paidEndsAt,
          },
        });
      }

      await tx.user.update({
        where: { id: session.userId },
        data: {
          subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
          subscriptionPlanId: session.planId,
          subscriptionCycle: session.cycle,
          trialEndsAt,
          nextChargeAt: paidEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: paidEndsAt,
        },
      });
    });
  }

  /** Extend the user's subscription endsAt by one cycle from max(now, currentPeriodEnd). */
  private async extendSubscription(session: {
    userId: string;
    planId: string;
    cycle: string;
    rooms: number;
  }): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: session.userId,
        status: {
          in: [
            SUBSCRIPTION_STATUS.ACTIVE,
            SUBSCRIPTION_STATUS.PAST_DUE,
            SUBSCRIPTION_STATUS.TRIAL,
          ],
        },
      },
      orderBy: { endsAt: 'desc' },
    });
    if (!sub) return;

    const now = new Date();
    const baseDate = pickBaseDate(sub.endsAt, now);
    const nextEnd = extendPeriod(baseDate, session.cycle as Cycle);
    const wasFuture = sub.endsAt.getTime() > now.getTime();

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        endsAt: nextEnd,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        cycle: session.cycle,
        rooms: session.rooms,
      },
    });
    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
        subscriptionPlanId: session.planId,
        subscriptionCycle: session.cycle,
        nextChargeAt: nextEnd,
        currentPeriodEnd: nextEnd,
        ...(wasFuture ? {} : { currentPeriodStart: now, trialEndsAt: null }),
      },
    });
  }

  /**
   * Apply upgrade: keep currentPeriodEnd, switch plan/cycle/rooms immediately.
   */
  private async applyUpgrade(session: {
    userId: string;
    planId: string;
    cycle: string;
    rooms: number;
  }): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: session.userId,
        status: {
          in: [
            SUBSCRIPTION_STATUS.ACTIVE,
            SUBSCRIPTION_STATUS.PAST_DUE,
            SUBSCRIPTION_STATUS.TRIAL,
          ],
        },
      },
      orderBy: { endsAt: 'desc' },
    });
    if (!sub) return;

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        planId: session.planId,
        rooms: session.rooms,
        // Cycle change deferred to next period
        // endsAt unchanged → keep currentPeriodEnd
        status: SUBSCRIPTION_STATUS.ACTIVE,
      },
    });
    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
        subscriptionPlanId: session.planId,
      },
    });
  }

  /** Manually confirm payment (admin use, e.g. legacy bank reconcile). */
  async confirmPayment(sessionId: string) {
    await this.markSessionPaid(sessionId, {
      provider: PAYMENT_PROVIDER.MANUAL_BANK,
    });
  }

  /**
   * Admin list payment sessions để đối soát thủ công.
   * Filter theo status + date range + search (planLabel / sessionId).
   */
  async adminListSessions(
    filters: {
      status?: string;
      userId?: string;
      from?: string;
      to?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    msg: Messages,
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.userId) where.userId = filters.userId;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    if (filters.search) {
      const q = filters.search;
      const matchingUserIds = await this.prisma.user
        .findMany({
          where: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          },
          select: { id: true },
        })
        .then((rows) => rows.map((r) => r.id));

      where.OR = [
        { id: { contains: q } },
        { planLabel: { contains: q, mode: 'insensitive' } },
        { referenceCode: { contains: q } },
        ...(matchingUserIds.length > 0
          ? [{ userId: { in: matchingUserIds } }]
          : []),
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.paymentSession.count({ where }),
      this.prisma.paymentSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          kind: true,
          planId: true,
          planLabel: true,
          cycle: true,
          rooms: true,
          totalAmount: true,
          method: true,
          status: true,
          provider: true,
          providerTxnId: true,
          referenceCode: true,
          invoiceNumber: true,
          bankInfo: true,
          paidAt: true,
          refundedAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    // Hydrate user info
    const userIds = Array.from(new Set(items.map((s) => s.userId)));
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true, phone: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      message: msg.payment.adminListSuccess,
      data: {
        items: items.map((s) => {
          const ckContent =
            (s.bankInfo as { content?: string } | null)?.content ??
            `HALONG24H ${s.id}`;
          return {
            ...s,
            ckContent,
            reference: s.referenceCode,
            user: userMap.get(s.userId) ?? null,
          };
        }),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin xác nhận đã nhận tiền cho 1 session pending (manual reconcile).
   * - Cho phép mark cả session đã expired (vì tiền có thể vào sau hạn)
   * - Idempotent với markSessionPaid existing logic
   */
  async adminMarkSessionPaid(
    adminId: string,
    sessionId: string,
    reference: string | undefined,
    msg: Messages,
  ) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException(msg.payment.sessionNotFound);

    if (session.status === PAYMENT_STATUS.PAID) {
      throw new ConflictException(msg.payment.alreadyPaid);
    }
    if (session.status === PAYMENT_STATUS.REFUNDED) {
      throw new BadRequestException(msg.payment.cannotMarkRefunded);
    }

    // Reset về PENDING nếu đã expired để markSessionPaid claim được
    if (
      session.status === PAYMENT_STATUS.EXPIRED ||
      session.status === PAYMENT_STATUS.FAILED
    ) {
      await this.prisma.paymentSession.update({
        where: { id: sessionId },
        data: { status: PAYMENT_STATUS.PENDING },
      });
    }

    await this.markSessionPaid(sessionId, {
      provider: PAYMENT_PROVIDER.MANUAL,
      providerTxnId: reference,
      referenceCode: reference,
      providerPayload: {
        markedBy: adminId,
        markedAt: new Date().toISOString(),
      },
    });

    this.logger.log(
      `Manual mark-paid session=${sessionId} by admin=${adminId}${reference ? ` ref="${reference}"` : ''}`,
    );

    const updated = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
    });

    void this.auditLog.log({
      actorId: adminId,
      actorRole: 0, // ROLE.ADMIN
      action: 'payment.session_mark_paid',
      targetType: 'subscription',
      targetId: session.userId,
      targetLabel: `Session ${sessionId}`,
      metadata: {
        sessionId,
        amount: session.totalAmount,
        planLabel: session.planLabel,
        reference: reference ?? null,
      },
    });

    return {
      message: msg.payment.adminMarkPaidSuccess,
      data: updated,
    };
  }

  // ─── Cron: expire pending sessions every 5 minutes ───────────────────────
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePendingSessions() {
    const now = new Date();
    const expiring = await this.prisma.paymentSession.findMany({
      where: { status: PAYMENT_STATUS.PENDING, expiresAt: { lt: now } },
      select: { id: true, submissionId: true },
    });
    if (expiring.length === 0) return;

    const ids = expiring.map((s) => s.id);
    const submissionIds = Array.from(
      new Set(
        expiring.map((s) => s.submissionId).filter((v): v is string => !!v),
      ),
    );

    await this.prisma.$transaction([
      this.prisma.paymentSession.updateMany({
        where: { id: { in: ids } },
        data: { status: PAYMENT_STATUS.EXPIRED },
      }),
      // Revert KYC submission về approved để user có thể initiate phiên mới
      ...(submissionIds.length > 0
        ? [
            this.prisma.kycSubmission.updateMany({
              where: {
                id: { in: submissionIds },
                status: KYC_SUBMISSION_STATUS.PAYMENT_PENDING,
              },
              data: { status: KYC_SUBMISSION_STATUS.APPROVED },
            }),
          ]
        : []),
    ]);

    this.logger.log(
      `Expired ${ids.length} pending payment session(s); reverted ${submissionIds.length} KYC submission(s)`,
    );
  }

  // ─── Cron: trial → past_due transition (every hour) ──────────────────────
  @Cron(CronExpression.EVERY_HOUR)
  async processTrialExpiry() {
    const now = new Date();
    const expiredTrials = await this.prisma.user.findMany({
      where: {
        subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
        trialEndsAt: { lt: now },
      },
      select: { id: true },
    });
    if (expiredTrials.length === 0) return;

    // Trial hết hạn KHÔNG được tự auto-active — phải thanh toán mới mở ACTIVE.
    // Đẩy về PAST_DUE để bắt buộc user thanh toán.
    const result = await this.prisma.user.updateMany({
      where: {
        id: { in: expiredTrials.map((u) => u.id) },
        subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
        trialEndsAt: { lt: now },
      },
      data: {
        subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE,
        nextChargeAt: now,
      },
    });
    this.logger.log(`Trial expired → PAST_DUE: ${result.count} user(s)`);
  }
}
