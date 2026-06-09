import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  KYC_SUBMISSION_STATUS,
  KYC_STATUS,
  SUBSCRIPTION_STATUS,
  KYC_STATUS_API_MAP,
  KYC_ADMIN_FILTER,
  KYC_ADMIN_PENDING_STATUSES,
  KYC_ADMIN_APPROVED_STATUSES,
  KYC_ADMIN_REJECTED_STATUSES,
  kycSubmissionToAdminFilter,
  NOTIFICATION_TYPE,
  ROLE,
  AUDIT_ACTION,
  AUDIT_TARGET_TYPE,
} from '../../common/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { extendPeriod, type Cycle } from '../payment/helpers/billing.helper';
import type { Messages } from '../../i18n';

@Injectable()
export class AdminKycService {
  private readonly logger = new Logger(AdminKycService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
  ) {}

  /** Submissions admin can approve/reject. */
  private static readonly REVIEWABLE_STATUSES = KYC_ADMIN_PENDING_STATUSES;

  /** Resolve tab filter — hỗ trợ legacy query `status` string. */
  resolveFilter(filter?: number, legacyStatus?: string): number {
    if (filter !== undefined && filter !== null) {
      return filter;
    }
    if (legacyStatus === KYC_SUBMISSION_STATUS.APPROVED) {
      return KYC_ADMIN_FILTER.APPROVED;
    }
    if (legacyStatus === KYC_SUBMISSION_STATUS.REJECTED) {
      return KYC_ADMIN_FILTER.REJECTED;
    }
    if (
      legacyStatus === KYC_SUBMISSION_STATUS.AWAITING_APPROVAL ||
      legacyStatus === KYC_SUBMISSION_STATUS.KYC_SUBMITTED
    ) {
      return KYC_ADMIN_FILTER.PENDING;
    }
    return KYC_ADMIN_FILTER.PENDING;
  }

  private buildWhereFromFilter(filter: number): Record<string, unknown> {
    switch (filter) {
      case KYC_ADMIN_FILTER.ALL:
        return { status: { not: KYC_SUBMISSION_STATUS.DRAFT } };
      case KYC_ADMIN_FILTER.PENDING:
        return { status: { in: [...KYC_ADMIN_PENDING_STATUSES] } };
      case KYC_ADMIN_FILTER.APPROVED:
        return { status: { in: [...KYC_ADMIN_APPROVED_STATUSES] } };
      case KYC_ADMIN_FILTER.REJECTED:
        return { status: { in: [...KYC_ADMIN_REJECTED_STATUSES] } };
      default:
        return { status: { in: [...KYC_ADMIN_PENDING_STATUSES] } };
    }
  }

  /** Count submissions awaiting approval (sidebar badge) */
  async countPending(msg: Messages) {
    const count = await this.prisma.kycSubmission.count({
      where: this.buildWhereFromFilter(KYC_ADMIN_FILTER.PENDING),
    });
    return { message: msg.adminKyc.countPendingSuccess, data: { count } };
  }

  /** Admin KYC list — một endpoint, filter tab 0–3 */
  async getQueue(
    page: number,
    pageSize: number,
    filter: number,
    msg: Messages,
  ) {
    const where = this.buildWhereFromFilter(filter);

    const [items, total, pendingCount] = await Promise.all([
      this.prisma.kycSubmission.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
          uploads: {
            select: {
              type: true,
              imageUrl: true,
              ocrResult: true,
              ocrConfidence: true,
              faceMatchScore: true,
            },
          },
          payments: {
            where: { status: 'paid' },
            select: {
              planId: true,
              totalAmount: true,
              cycle: true,
              rooms: true,
              paidAt: true,
            },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.kycSubmission.count({ where }),
      this.prisma.kycSubmission.count({
        where: this.buildWhereFromFilter(KYC_ADMIN_FILTER.PENDING),
      }),
    ]);

    return {
      message: msg.adminKyc.queueSuccess,
      data: {
        filter,
        pendingCount,
        items: items.map((item) => ({
          id: item.id,
          status: KYC_STATUS_API_MAP[item.status] || item.status,
          statusFilter: kycSubmissionToAdminFilter(item.status),
          user: item.user,
          submittedAt: item.updatedAt,
          uploads: this.formatUploads(item.uploads),
          expectedRooms: item.expectedRooms,
          plan: item.payments[0]?.planId || null,
          totalPaid: item.payments[0]?.totalAmount || 0,
          createdAt: item.createdAt,
        })),
        total,
        page,
        pageSize,
      },
    };
  }

  /** Approve KYC submission */
  async approve(
    adminId: string,
    submissionId: string,
    trialDays: number,
    msg: Messages,
  ) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: submissionId },
      include: {
        payments: {
          where: { status: 'paid' },
          select: { planId: true, cycle: true },
          take: 1,
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(msg.kyc.submissionNotFound);
    }
    if (
      !AdminKycService.REVIEWABLE_STATUSES.includes(
        submission.status as (typeof KYC_ADMIN_PENDING_STATUSES)[number],
      )
    ) {
      throw new BadRequestException(msg.adminKyc.invalidStatus);
    }

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: KYC_SUBMISSION_STATUS.APPROVED,
        approvedAt: now,
        approvedById: adminId,
        trialEndsAt,
        chargeStartsAt: trialEndsAt,
      },
    });

    const payment = submission.payments[0];
    const userData: {
      kycStatus: string;
      kycSubmissionId: string;
      subscriptionStatus?: string;
      subscriptionPlanId?: string | null;
      subscriptionCycle?: string | null;
      trialEndsAt?: Date;
      nextChargeAt?: Date;
    } = {
      kycStatus: KYC_STATUS.APPROVED,
      kycSubmissionId: submissionId,
    };

    // Paid period = trial window + 1 billing cycle (user pre-paid; nextCharge after trial+cycle).
    const paidEndsAt = payment
      ? extendPeriod(trialEndsAt, payment.cycle as Cycle)
      : trialEndsAt;

    if (payment) {
      userData.subscriptionStatus = SUBSCRIPTION_STATUS.TRIAL;
      userData.subscriptionPlanId = payment.planId;
      userData.subscriptionCycle = payment.cycle;
      userData.trialEndsAt = trialEndsAt;
      userData.nextChargeAt = paidEndsAt;
    }

    await this.prisma.user.update({
      where: { id: submission.userId },
      data: userData,
    });

    if (payment) {
      const existing = await this.prisma.subscription.findFirst({
        where: { userId: submission.userId, planId: payment.planId },
      });
      if (!existing) {
        await this.prisma.subscription.create({
          data: {
            userId: submission.userId,
            planId: payment.planId,
            cycle: payment.cycle,
            rooms: submission.expectedRooms,
            status: SUBSCRIPTION_STATUS.ACTIVE,
            startsAt: now,
            endsAt: paidEndsAt,
          },
        });
      }
    }

    await this.notifications.notifyUser(
      submission.userId,
      'KYC duyệt thành công',
      payment
        ? 'Hồ sơ xác minh của bạn đã được duyệt. Bạn có thể bắt đầu quản lý cơ sở.'
        : 'Hồ sơ xác minh của bạn đã được duyệt. Bạn có thể mua gói dịch vụ.',
      NOTIFICATION_TYPE.SYSTEM,
      submissionId,
      'kyc',
      { pushType: 'kyc_approved', deepLink: '/dashboard' },
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.KYC_APPROVE,
      targetType: AUDIT_TARGET_TYPE.KYC,
      targetId: submissionId,
      metadata: { trialDays, trialEndsAt },
    });

    return {
      message: msg.adminKyc.approveSuccess,
      data: {
        submissionId,
        status: 'approved',
        statusFilter: KYC_ADMIN_FILTER.APPROVED,
        approvedAt: now,
        trialEndsAt,
      },
    };
  }

  /** Reject KYC submission */
  async reject(
    adminId: string,
    submissionId: string,
    reason: string,
    items: string[],
    msg: Messages,
  ) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(msg.kyc.submissionNotFound);
    }
    if (
      !AdminKycService.REVIEWABLE_STATUSES.includes(
        submission.status as (typeof KYC_ADMIN_PENDING_STATUSES)[number],
      )
    ) {
      throw new BadRequestException(msg.adminKyc.invalidStatus);
    }

    await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: KYC_SUBMISSION_STATUS.REJECTED,
        rejectReason: reason,
        rejectedItems: items,
      },
    });

    await this.prisma.user.update({
      where: { id: submission.userId },
      data: { kycStatus: KYC_STATUS.REJECTED },
    });

    await this.notifications.notifyUser(
      submission.userId,
      'KYC bị từ chối',
      reason || 'Hồ sơ xác minh bị từ chối. Vui lòng kiểm tra và gửi lại.',
      NOTIFICATION_TYPE.SYSTEM,
      submissionId,
      'kyc',
      { pushType: 'kyc_rejected', deepLink: '/verify/rejected' },
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.KYC_REJECT,
      targetType: AUDIT_TARGET_TYPE.KYC,
      targetId: submissionId,
      metadata: { reason, rejectedItems: items },
    });

    return {
      message: msg.adminKyc.rejectSuccess,
      data: {
        submissionId,
        status: 'rejected',
        statusFilter: KYC_ADMIN_FILTER.REJECTED,
        reason,
        rejectedItems: items,
      },
    };
  }

  private formatUploads(
    uploads: Array<{
      type: string;
      imageUrl: string;
      ocrResult: any;
      ocrConfidence: number | null;
      faceMatchScore: number | null;
    }>,
  ) {
    const result: Record<string, any> = {};
    for (const u of uploads) {
      const key =
        u.type === 'cccd_front'
          ? 'cccdFront'
          : u.type === 'cccd_back'
            ? 'cccdBack'
            : 'selfie';
      result[key] = {
        imageUrl: u.imageUrl,
        ocrResult: u.ocrResult,
        confidence: u.ocrConfidence,
        faceMatchScore: u.faceMatchScore,
      };
    }
    return result;
  }
}
