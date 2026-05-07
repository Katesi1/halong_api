import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  KYC_SUBMISSION_STATUS,
  PAYMENT_STATUS,
  KYC_STATUS,
  SUBSCRIPTION_STATUS,
} from '../../common/constants';
import type { Messages } from '../../i18n';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /** Initiate a payment session */
  async initiate(
    user: { id: string },
    dto: {
      planId: string;
      cycle: string;
      method: string;
      rooms: number;
      totalAmount: number;
    },
    msg: Messages,
  ) {
    // Find user's latest submission
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

    // Check if already paid
    const existingPaid = await this.prisma.paymentSession.findFirst({
      where: {
        submissionId: submission.id,
        status: PAYMENT_STATUS.PAID,
      },
    });
    if (existingPaid) {
      throw new ConflictException(msg.payment.alreadyPaid);
    }

    // Verify plan exists
    const plan = await this.prisma.billingPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan || !plan.active) {
      throw new BadRequestException(msg.payment.invalidPlan);
    }

    // Verify room count within plan limit
    if (plan.maxRooms && dto.rooms > plan.maxRooms) {
      throw new BadRequestException(msg.billing.roomCountExceedsPlan);
    }

    // Verify amount calculation
    const months = dto.cycle === 'yearly' ? 12 : 1;
    const discount = dto.cycle === 'yearly' ? plan.yearlyDiscountPct / 100 : 0;
    const baseAmount = Math.max(plan.pricePerRoom * dto.rooms, plan.minCharge) * months;
    const discountedAmount = Math.round(baseAmount * (1 - discount));
    const expectedTotal = Math.round(discountedAmount * (1 + plan.vatPct / 100));

    // Allow 1% tolerance for rounding differences
    const tolerance = expectedTotal * 0.01;
    if (Math.abs(dto.totalAmount - expectedTotal) > tolerance) {
      throw new BadRequestException(msg.payment.amountMismatch);
    }

    // Expire any existing pending sessions for this submission
    await this.prisma.paymentSession.updateMany({
      where: {
        submissionId: submission.id,
        status: PAYMENT_STATUS.PENDING,
      },
      data: { status: PAYMENT_STATUS.EXPIRED },
    });

    // Create payment session
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 min expiry

    let qrCode: string | null = null;
    let bankInfo: any = null;
    let redirectUrl: string | null = null;

    // Generate payment data based on method
    if (dto.method === 'bank_transfer') {
      bankInfo = {
        bankName: this.configService.get('BANK_NAME', 'Vietcombank'),
        accountNumber: this.configService.get('BANK_ACCOUNT_NUMBER', '0011004567890'),
        accountName: this.configService.get('BANK_ACCOUNT_NAME', 'CONG TY HALONG24H'),
        content: `KYC${submission.id.substring(0, 8).toUpperCase()}`,
      };
    }
    // TODO: Integrate VNPay QR and card payment methods

    const session = await this.prisma.paymentSession.create({
      data: {
        submissionId: submission.id,
        planId: dto.planId,
        cycle: dto.cycle,
        rooms: dto.rooms,
        totalAmount: dto.totalAmount,
        method: dto.method,
        qrCode,
        bankInfo,
        redirectUrl,
        expiresAt,
      },
    });

    // Update submission status to payment_pending
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
        sessionId: session.id,
        method: session.method,
        totalAmount: session.totalAmount,
        qrCode: session.qrCode,
        bankInfo: session.bankInfo,
        redirectUrl: session.redirectUrl,
        expiresAt: session.expiresAt,
      },
    };
  }

  /** Get payment status */
  async getStatus(
    user: { id: string },
    sessionId: string,
    msg: Messages,
  ) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
      include: {
        submission: { select: { userId: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(msg.payment.sessionNotFound);
    }
    if (session.submission.userId !== user.id) {
      throw new NotFoundException(msg.payment.sessionNotFound);
    }

    return {
      message: msg.payment.statusSuccess,
      data: { status: session.status },
    };
  }

  /** Request refund */
  async refund(
    user: { id: string },
    sessionId: string,
    msg: Messages,
  ) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
      include: {
        submission: { select: { id: true, userId: true, status: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(msg.payment.sessionNotFound);
    }
    if (session.submission.userId !== user.id) {
      throw new NotFoundException(msg.payment.sessionNotFound);
    }
    if (session.status === PAYMENT_STATUS.REFUNDED) {
      throw new ConflictException(msg.payment.alreadyRefunded);
    }
    if (session.status !== PAYMENT_STATUS.PAID) {
      throw new BadRequestException(msg.payment.cannotRefund);
    }

    const allowedStatuses = [
      KYC_SUBMISSION_STATUS.REJECTED,
      KYC_SUBMISSION_STATUS.AWAITING_APPROVAL,
    ];
    if (!allowedStatuses.includes(session.submission.status as any)) {
      throw new BadRequestException(msg.payment.cannotRefund);
    }

    // TODO: Call VNPay refund API for vnpay_qr/card methods
    // For bank_transfer, create manual refund task

    const now = new Date();
    await this.prisma.paymentSession.update({
      where: { id: sessionId },
      data: {
        status: PAYMENT_STATUS.REFUNDED,
        refundedAt: now,
        refundedAmount: session.totalAmount,
      },
    });

    await this.prisma.kycSubmission.update({
      where: { id: session.submission.id },
      data: { status: KYC_SUBMISSION_STATUS.REFUNDED },
    });

    // Update user status
    await this.prisma.user.updateMany({
      where: { id: user.id },
      data: {
        kycStatus: KYC_STATUS.REJECTED,
        subscriptionStatus: 'cancelled',
      },
    });

    return {
      message: msg.payment.refundSuccess,
      data: {
        refunded: true,
        amount: session.totalAmount,
        refundedAt: now,
      },
    };
  }

  /** Handle VNPay webhook/IPN */
  async handleVnpayWebhook(payload: Record<string, string>) {
    // TODO: Verify VNPay signature using vnp_HashSecret
    const txnRef = payload['vnp_TxnRef'];
    const responseCode = payload['vnp_ResponseCode'];
    const transactionNo = payload['vnp_TransactionNo'];

    if (!txnRef) {
      return { RspCode: '99', Message: 'Invalid request' };
    }

    const session = await this.prisma.paymentSession.findUnique({
      where: { id: txnRef },
    });

    if (!session) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    // Idempotent check
    if (session.status === PAYMENT_STATUS.PAID) {
      return { RspCode: '00', Message: 'Confirm Success' };
    }

    if (session.status !== PAYMENT_STATUS.PENDING) {
      return { RspCode: '02', Message: 'Order already processed' };
    }

    if (responseCode === '00') {
      // Payment success
      const now = new Date();
      await this.prisma.paymentSession.update({
        where: { id: session.id },
        data: {
          status: PAYMENT_STATUS.PAID,
          paidAt: now,
          providerTxnId: transactionNo,
          providerPayload: payload as any,
          provider: 'vnpay',
        },
      });

      // Auto-transition submission to awaiting_approval
      await this.prisma.kycSubmission.update({
        where: { id: session.submissionId },
        data: { status: KYC_SUBMISSION_STATUS.AWAITING_APPROVAL },
      });

      // Update user kyc status
      const submission = await this.prisma.kycSubmission.findUnique({
        where: { id: session.submissionId },
        select: { userId: true },
      });
      if (submission) {
        await this.prisma.user.update({
          where: { id: submission.userId },
          data: { kycStatus: KYC_STATUS.PENDING },
        });
      }

      return { RspCode: '00', Message: 'Confirm Success' };
    }

    // Payment failed
    await this.prisma.paymentSession.update({
      where: { id: session.id },
      data: {
        status: PAYMENT_STATUS.FAILED,
        providerTxnId: transactionNo,
        providerPayload: payload as any,
        provider: 'vnpay',
      },
    });

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  /** Manually confirm payment (admin use) */
  async confirmPayment(sessionId: string) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.status !== PAYMENT_STATUS.PENDING) {
      return;
    }

    const now = new Date();
    await this.prisma.paymentSession.update({
      where: { id: session.id },
      data: {
        status: PAYMENT_STATUS.PAID,
        paidAt: now,
        provider: 'manual_bank',
      },
    });

    await this.prisma.kycSubmission.update({
      where: { id: session.submissionId },
      data: { status: KYC_SUBMISSION_STATUS.AWAITING_APPROVAL },
    });

    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: session.submissionId },
      select: { userId: true },
    });
    if (submission) {
      await this.prisma.user.update({
        where: { id: submission.userId },
        data: { kycStatus: KYC_STATUS.PENDING },
      });
    }
  }

  /** Cron: expire pending payment sessions every 5 minutes */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePendingSessions() {
    const now = new Date();
    const result = await this.prisma.paymentSession.updateMany({
      where: {
        status: PAYMENT_STATUS.PENDING,
        expiresAt: { lt: now },
      },
      data: { status: PAYMENT_STATUS.EXPIRED },
    });
    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} pending payment session(s)`);
    }
  }

  /** Cron: transition trial users to active when trial ends (every hour) */
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

    for (const user of expiredTrials) {
      // TODO: Auto-charge subscription via VNPay
      // For now, mark as active (assuming payment will be handled manually)
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
          nextChargeAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // +30 days
        },
      });
      this.logger.log(`User ${user.id} trial ended, moved to active`);
    }
  }
}
