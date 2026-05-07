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
} from '../../common/constants';
import type { Messages } from '../../i18n';

@Injectable()
export class AdminKycService {
  private readonly logger = new Logger(AdminKycService.name);

  constructor(private prisma: PrismaService) {}

  /** Get KYC approval queue */
  async getQueue(
    page: number,
    pageSize: number,
    status: string | undefined,
    msg: Messages,
  ) {
    const where: any = {};
    if (status) {
      where.status = status;
    } else {
      where.status = KYC_SUBMISSION_STATUS.AWAITING_APPROVAL;
    }

    const [items, total] = await Promise.all([
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
        orderBy: { updatedAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.kycSubmission.count({ where }),
    ]);

    return {
      message: msg.adminKyc.queueSuccess,
      data: {
        items: items.map((item) => ({
          id: item.id,
          status: KYC_STATUS_API_MAP[item.status] || item.status,
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
    if (submission.status !== KYC_SUBMISSION_STATUS.AWAITING_APPROVAL) {
      throw new BadRequestException(msg.adminKyc.invalidStatus);
    }

    const now = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    // Update submission
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

    // Update user
    const payment = submission.payments[0];
    await this.prisma.user.update({
      where: { id: submission.userId },
      data: {
        kycStatus: KYC_STATUS.APPROVED,
        kycSubmissionId: submissionId,
        subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
        subscriptionPlanId: payment?.planId || null,
        subscriptionCycle: payment?.cycle || null,
        trialEndsAt,
        nextChargeAt: trialEndsAt,
      },
    });

    // TODO: Send FCM push notification to user

    return {
      message: msg.adminKyc.approveSuccess,
      data: {
        submissionId,
        status: 'approved',
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
    if (submission.status !== KYC_SUBMISSION_STATUS.AWAITING_APPROVAL) {
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

    // TODO: Send FCM push notification to user

    return {
      message: msg.adminKyc.rejectSuccess,
      data: {
        submissionId,
        status: 'rejected',
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
