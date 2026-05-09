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
} from '../../common/constants';
import type { Messages } from '../../i18n';
import {
  buildVnpayPayUrl,
  verifyVnpaySignature,
  type VnpayConfig,
} from './helpers/vnpay.helper';
import {
  buildVietQrPayload,
  sanitizeTransferContent,
} from './helpers/vietqr.helper';
import {
  parseBankWebhookPayload,
  extractSessionIdFromDescription,
} from './helpers/bank-webhook.helper';
import { generateInvoiceNumber } from './helpers/invoice.helper';

const SESSION_EXPIRY_MINUTES_VNPAY = 15;
const SESSION_EXPIRY_MINUTES_BANK = 24 * 60; // 24h
const BANK_AMOUNT_TOLERANCE_VND = 1000;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  // ─── VNPay config ────────────────────────────────────────────────────────
  private getVnpayConfig(): VnpayConfig {
    return {
      tmnCode: this.configService.get<string>('VNPAY_TMN_CODE', 'PLACEHOLDER'),
      hashSecret: this.configService.get<string>(
        'VNPAY_HASH_SECRET',
        'PLACEHOLDER_SECRET',
      ),
      apiUrl: this.configService.get<string>(
        'VNPAY_API_URL',
        'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      ),
      returnUrl: this.configService.get<string>(
        'VNPAY_RETURN_URL',
        'https://halong24h.com/payments/vnpay/return',
      ),
      ipnUrl: this.configService.get<string>('VNPAY_IPN_URL'),
    };
  }

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
  ): number {
    const months = cycle === 'yearly' ? 12 : 1;
    const discount = cycle === 'yearly' ? plan.yearlyDiscountPct / 100 : 0;
    const baseAmount = Math.max(plan.pricePerRoom * rooms, plan.minCharge) * months;
    const discounted = Math.round(baseAmount * (1 - discount));
    return Math.round(discounted * (1 + plan.vatPct / 100));
  }

  // ─── Build session payment artefacts (qrCode / payUrl / bankInfo) ────────
  private buildSessionArtefacts(
    sessionId: string,
    method: string,
    totalAmount: number,
    orderInfo: string,
    ipAddr: string,
  ): {
    qrCode: string | null;
    bankInfo: any;
    redirectUrl: string | null;
    payUrl: string | null;
    expiresAt: Date;
  } {
    let qrCode: string | null = null;
    let bankInfo: any = null;
    let redirectUrl: string | null = null;
    let payUrl: string | null = null;
    let expiresAt: Date;

    if (method === PAYMENT_METHOD.VNPAY_QR) {
      const cfg = this.getVnpayConfig();
      const built = buildVnpayPayUrl(cfg, {
        sessionId,
        amount: totalAmount,
        orderInfo,
        ipAddr,
        expireMinutes: SESSION_EXPIRY_MINUTES_VNPAY,
        locale: 'vn',
      });
      payUrl = built.payUrl;
      // Without a server-to-server VNPay createQR call we cannot return a true
      // EMV string; clients will fall back to opening payUrl in a banking app.
      qrCode = null;
      expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES_VNPAY * 60_000);
    } else if (method === PAYMENT_METHOD.BANK_TRANSFER) {
      const bank = this.getBankConfig();
      const content = sanitizeTransferContent(`HALONG24H ${sessionId}`);
      const vietQrPayload = buildVietQrPayload({
        bankBin: bank.bankBin,
        accountNumber: bank.accountNumber,
        amount: totalAmount,
        content,
      });
      bankInfo = {
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        accountName: bank.accountName,
        bankBin: bank.bankBin,
        content,
        vietQrPayload,
      };
      qrCode = vietQrPayload;
      expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES_BANK * 60_000);
    } else {
      // card or other (locked at UI for now)
      expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES_VNPAY * 60_000);
    }

    return { qrCode, bankInfo, redirectUrl, payUrl, expiresAt };
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
  }) {
    return {
      sessionId: session.id,
      method: session.method,
      totalAmount: session.totalAmount,
      qrCode: session.qrCode,
      bankInfo: session.bankInfo,
      redirectUrl: session.redirectUrl,
      payUrl: session.payUrl,
      expiresAt: session.expiresAt,
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

    const expectedTotal = this.computeExpectedTotal(plan, dto.cycle, dto.rooms);
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

    const totalAmount = this.computeExpectedTotal(sub.plan, sub.cycle, sub.rooms);

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

  // ─── VNPay IPN webhook ───────────────────────────────────────────────────
  async handleVnpayWebhook(payload: Record<string, string>) {
    const cfg = this.getVnpayConfig();

    if (!verifyVnpaySignature(payload, cfg.hashSecret)) {
      this.logger.warn('VNPay IPN signature verification failed');
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const txnRef = payload.vnp_TxnRef;
    const responseCode = payload.vnp_ResponseCode;
    const transactionNo = payload.vnp_TransactionNo;
    const amount = payload.vnp_Amount ? Number(payload.vnp_Amount) : null;

    if (!txnRef) {
      return { RspCode: '99', Message: 'Invalid request' };
    }

    const session = await this.prisma.paymentSession.findUnique({
      where: { id: txnRef },
    });
    if (!session) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    // VNPay multiplies amount by 100
    if (amount !== null && amount !== session.totalAmount * 100) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    if (session.status === PAYMENT_STATUS.PAID) {
      return { RspCode: '00', Message: 'Confirm Success' };
    }
    if (session.status !== PAYMENT_STATUS.PENDING) {
      return { RspCode: '02', Message: 'Order already processed' };
    }

    if (responseCode === '00') {
      await this.markSessionPaid(session.id, {
        provider: PAYMENT_PROVIDER.VNPAY,
        providerTxnId: transactionNo,
        referenceCode: transactionNo,
        providerPayload: payload,
      });
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    await this.prisma.paymentSession.update({
      where: { id: session.id },
      data: {
        status: PAYMENT_STATUS.FAILED,
        provider: PAYMENT_PROVIDER.VNPAY,
        providerTxnId: transactionNo,
        providerPayload: payload as any,
      },
    });
    return { RspCode: '00', Message: 'Confirm Success' };
  }

  // ─── Bank webhook (Casso / Sepay auto-detect) ────────────────────────────
  async handleBankWebhook(
    payload: Record<string, any>,
    headerSecret: string | undefined,
  ): Promise<{ success: boolean; message?: string }> {
    const expectedSecret = this.configService.get<string>('BANK_WEBHOOK_SECRET');
    if (expectedSecret && headerSecret !== expectedSecret) {
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
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session || session.status !== PAYMENT_STATUS.PENDING) return;

    const now = new Date();
    const invoiceNumber = await generateInvoiceNumber(this.prisma, now);

    await this.prisma.paymentSession.update({
      where: { id: sessionId },
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

    if (session.kind === PAYMENT_KIND.SUBSCRIPTION && session.submissionId) {
      await this.prisma.kycSubmission.update({
        where: { id: session.submissionId },
        data: { status: KYC_SUBMISSION_STATUS.AWAITING_APPROVAL },
      });
      await this.prisma.user.update({
        where: { id: session.userId },
        data: { kycStatus: KYC_STATUS.PENDING },
      });
    } else if (session.kind === PAYMENT_KIND.RENEW) {
      await this.extendSubscription(session);
      await this.prisma.notification.create({
        data: {
          userId: session.userId,
          title: 'Gia hạn thành công',
          subtitle: `${session.planLabel ?? ''} đã được gia hạn`,
          type: 1, // PAYMENT
          targetId: session.id,
          targetType: 'payment',
        },
      });
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

  // ─── Cron: expire pending sessions every 5 minutes ───────────────────────
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePendingSessions() {
    const now = new Date();
    const result = await this.prisma.paymentSession.updateMany({
      where: { status: PAYMENT_STATUS.PENDING, expiresAt: { lt: now } },
      data: { status: PAYMENT_STATUS.EXPIRED },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} pending payment session(s)`);
    }
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
    for (const u of expiredTrials) {
      await this.prisma.user.update({
        where: { id: u.id },
        data: {
          subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
          nextChargeAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      this.logger.log(`User ${u.id} trial ended, moved to active`);
    }
  }
}
