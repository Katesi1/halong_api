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
} from '../../common/constants';
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

  private getBankConfig() {
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

  // ─── Plan label / amount helpers ─────────────────────────────────────────
  private formatPlanLabel(planName: string, cycle: string): string {
    return `${planName} · ${cycle === 'yearly' ? 'Năm' : 'Tháng'}`;
  }

  private computeExpectedTotal(
    plan: { pricePerRoom: number; minCharge: number; yearlyDiscountPct: number; vatPct: number },
    cycle: string,
    rooms: number,
    priceOverride?: number | null,
  ): number {
    // Admin-set override: absolute price per cycle, VAT/discount đã tính bởi admin.
    // priceOverride = 0 ⇒ free (vẫn cần đi qua flow để có session record).
    if (priceOverride !== null && priceOverride !== undefined) {
      return priceOverride;
    }
    const months = cycle === 'yearly' ? 12 : 1;
    const discount = cycle === 'yearly' ? plan.yearlyDiscountPct / 100 : 0;
    const baseAmount = Math.max(plan.pricePerRoom * rooms, plan.minCharge) * months;
    const discounted = Math.round(baseAmount * (1 - discount));
    return Math.round(discounted * (1 + plan.vatPct / 100));
  }

  // ─── Build session payment artefacts (bankInfo + VietQR) ─────────────────
  // Hiện chỉ hỗ trợ Bank Transfer + VietQR. Các method khác đã bị loại khỏi v2.
  private buildSessionArtefacts(
    sessionId: string,
    method: string,
    totalAmount: number,
    _orderInfo: string,
    _ipAddr: string,
  ): {
    qrCode: string | null;
    bankInfo: any;
    redirectUrl: string | null;
    payUrl: string | null;
    expiresAt: Date;
    qrExpiresAt: Date;
  } {
    if (method !== PAYMENT_METHOD.BANK_TRANSFER) {
      throw new BadRequestException(`Phương thức thanh toán không được hỗ trợ: ${method}`);
    }

    const bank = this.getBankConfig();
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

  // ─── Initiate (subscription, first-time KYC payment) ─────────────────────
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
    const submission = await this.prisma.kycSubmission.findFirst({
      where: {
        userId: user.id,
        status: {
          in: [
            KYC_SUBMISSION_STATUS.KYC_SUBMITTED,
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

    const plan = await this.prisma.billingPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.active) {
      throw new BadRequestException(msg.payment.invalidPlan);
    }
    if (plan.maxRooms && dto.rooms > plan.maxRooms) {
      throw new BadRequestException(msg.billing.roomCountExceedsPlan);
    }

    const callerUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionPriceOverride: true },
    });
    const expectedTotal = this.computeExpectedTotal(
      plan,
      dto.cycle,
      dto.rooms,
      callerUser?.subscriptionPriceOverride,
    );
    const tolerance = expectedTotal * 0.01;
    if (Math.abs(dto.totalAmount - expectedTotal) > tolerance) {
      throw new BadRequestException(msg.payment.amountMismatch);
    }

    // Expire old pending sessions on this submission
    await this.prisma.paymentSession.updateMany({
      where: { submissionId: submission.id, status: PAYMENT_STATUS.PENDING },
      data: { status: PAYMENT_STATUS.EXPIRED },
    });

    const planLabel = this.formatPlanLabel(plan.name, dto.cycle);
    const sessionId = crypto.randomUUID();
    const orderInfo = `Thanh toan ${plan.name} ${dto.cycle === 'yearly' ? 'nam' : 'thang'}`;
    const artefacts = this.buildSessionArtefacts(
      sessionId,
      dto.method,
      dto.totalAmount,
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
        totalAmount: dto.totalAmount,
        method: dto.method,
        qrCode: artefacts.qrCode,
        bankInfo: artefacts.bankInfo,
        redirectUrl: artefacts.redirectUrl,
        payUrl: artefacts.payUrl,
        expiresAt: artefacts.expiresAt,
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
      data: this.toSessionResponse(session),
    };
  }

  // ─── Renew an existing subscription ──────────────────────────────────────
  async renew(
    user: { id: string },
    method: string,
    ipAddr: string,
    msg: Messages,
  ) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE] },
      },
      orderBy: { endsAt: 'desc' },
      include: { plan: true },
    });
    if (!sub || !sub.plan) {
      throw new BadRequestException(msg.payment.noActiveSubscription);
    }

    const callerUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionPriceOverride: true },
    });
    const totalAmount = this.computeExpectedTotal(
      sub.plan,
      sub.cycle,
      sub.rooms,
      callerUser?.subscriptionPriceOverride,
    );

    // Expire the user's existing pending renew sessions
    await this.prisma.paymentSession.updateMany({
      where: {
        userId: user.id,
        kind: PAYMENT_KIND.RENEW,
        status: PAYMENT_STATUS.PENDING,
      },
      data: { status: PAYMENT_STATUS.EXPIRED },
    });

    const planLabel = this.formatPlanLabel(sub.plan.name, sub.cycle);
    const sessionId = crypto.randomUUID();
    const orderInfo = `Gia han ${sub.plan.name} ${sub.cycle === 'yearly' ? 'nam' : 'thang'}`;
    const artefacts = this.buildSessionArtefacts(
      sessionId,
      method,
      totalAmount,
      orderInfo,
      ipAddr,
    );

    const session = await this.prisma.paymentSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        submissionId: null,
        kind: PAYMENT_KIND.RENEW,
        planId: sub.planId,
        planLabel,
        cycle: sub.cycle,
        rooms: sub.rooms,
        totalAmount,
        method,
        qrCode: artefacts.qrCode,
        bankInfo: artefacts.bankInfo,
        redirectUrl: artefacts.redirectUrl,
        payUrl: artefacts.payUrl,
        expiresAt: artefacts.expiresAt,
      },
    });

    return {
      message: msg.payment.renewSuccess,
      data: this.toSessionResponse(session),
    };
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
              data: { status: KYC_SUBMISSION_STATUS.KYC_SUBMITTED },
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
    const expectedSecret = this.configService.get<string>('BANK_WEBHOOK_SECRET');
    if (!expectedSecret) {
      // Bắt buộc cấu hình — nếu thiếu, từ chối toàn bộ webhook thay vì
      // im lặng cho qua (kẻ tấn công có thể bơm thanh toán giả).
      this.logger.error('BANK_WEBHOOK_SECRET chưa được cấu hình — từ chối webhook');
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

    if (Math.abs(txn.amount - session.totalAmount) > BANK_AMOUNT_TOLERANCE_VND) {
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
        ...(info.providerPayload ? { providerPayload: info.providerPayload } : {}),
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
      void this.notifications.notifyUser(
        session.userId,
        'Thanh toán thành công',
        `${session.planLabel ?? 'Gói'} đã thanh toán, hồ sơ KYC đang chờ duyệt`,
        NOTIFICATION_TYPE.PAYMENT,
        session.id,
        'payment',
        { pushType: 'payment_succeeded', deepLink: '/my-bookings' },
      ).catch(() => undefined);
    } else if (session.kind === PAYMENT_KIND.RENEW) {
      await this.extendSubscription(session);
      void this.notifications.notifyUser(
        session.userId,
        'Gia hạn thành công',
        `${session.planLabel ?? 'Gói'} đã được gia hạn`,
        NOTIFICATION_TYPE.PAYMENT,
        session.id,
        'payment',
        { pushType: 'payment_succeeded', deepLink: '/my-bookings' },
      ).catch(() => undefined);
    }
  }

  /** Extend the user's subscription endsAt by one cycle (from current endsAt or now). */
  private async extendSubscription(session: {
    userId: string;
    planId: string;
    cycle: string;
    rooms: number;
  }): Promise<void> {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId: session.userId,
        status: { in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PAST_DUE] },
      },
      orderBy: { endsAt: 'desc' },
    });
    if (!sub) return;

    const base = sub.endsAt > new Date() ? sub.endsAt : new Date();
    const next = new Date(base);
    if (session.cycle === 'yearly') {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      next.setMonth(next.getMonth() + 1);
    }

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { endsAt: next, status: SUBSCRIPTION_STATUS.ACTIVE },
    });
    await this.prisma.user.update({
      where: { id: session.userId },
      data: {
        subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
        nextChargeAt: next,
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
      where.OR = [
        { id: { contains: filters.search } },
        { planLabel: { contains: filters.search, mode: 'insensitive' } },
        { referenceCode: { contains: filters.search } },
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
          id: true, userId: true, kind: true, planId: true, planLabel: true,
          cycle: true, rooms: true, totalAmount: true, method: true,
          status: true, provider: true, providerTxnId: true, referenceCode: true,
          invoiceNumber: true, paidAt: true, refundedAt: true,
          expiresAt: true, createdAt: true,
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
        items: items.map((s) => ({ ...s, user: userMap.get(s.userId) ?? null })),
        total, page, limit,
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
    if (session.status === PAYMENT_STATUS.EXPIRED || session.status === PAYMENT_STATUS.FAILED) {
      await this.prisma.paymentSession.update({
        where: { id: sessionId },
        data: { status: PAYMENT_STATUS.PENDING },
      });
    }

    await this.markSessionPaid(sessionId, {
      provider: PAYMENT_PROVIDER.MANUAL,
      providerTxnId: reference,
      referenceCode: reference,
      providerPayload: { markedBy: adminId, markedAt: new Date().toISOString() },
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
      new Set(expiring.map((s) => s.submissionId).filter((v): v is string => !!v)),
    );

    await this.prisma.$transaction([
      this.prisma.paymentSession.updateMany({
        where: { id: { in: ids } },
        data: { status: PAYMENT_STATUS.EXPIRED },
      }),
      // Revert KYC submission về kyc_submitted để user có thể initiate phiên mới
      ...(submissionIds.length > 0
        ? [
            this.prisma.kycSubmission.updateMany({
              where: {
                id: { in: submissionIds },
                status: KYC_SUBMISSION_STATUS.PAYMENT_PENDING,
              },
              data: { status: KYC_SUBMISSION_STATUS.KYC_SUBMITTED },
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
