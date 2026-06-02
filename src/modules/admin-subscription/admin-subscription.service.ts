import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ROLE,
  SUBSCRIPTION_STATUS,
  NOTIFICATION_TYPE,
} from '../../common/constants';
import type { Messages } from '../../i18n';

@Injectable()
export class AdminSubscriptionService {
  private readonly logger = new Logger(AdminSubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Get current subscription snapshot for a user (admin view) */
  async getSubscription(userId: string, msg: Messages) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        subscriptionStatus: true,
        subscriptionPlanId: true,
        subscriptionCycle: true,
        trialEndsAt: true,
        nextChargeAt: true,
      },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    const subscription = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        planId: true,
        cycle: true,
        rooms: true,
        status: true,
        startsAt: true,
        endsAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: msg.adminSubscription.getSuccess,
      data: { user, subscription },
    };
  }

  /**
   * Grant a new trial or extend an existing trial.
   * - If user has an active trial → extend from current trialEndsAt
   * - If trial expired or none → start from now
   * - Reject if user is on active paid subscription
   */
  async grantTrial(
    adminId: string,
    userId: string,
    days: number,
    planIdInput: string | undefined,
    cycleInput: 'monthly' | 'yearly' | undefined,
    roomsInput: number | undefined,
    reason: string | undefined,
    msg: Messages,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        subscriptionStatus: true,
        subscriptionPlanId: true,
        subscriptionCycle: true,
        trialEndsAt: true,
      },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    if (!user.isActive) throw new BadRequestException(msg.adminSubscription.userInactive);
    if (user.role !== ROLE.OWNER) {
      throw new BadRequestException(msg.adminSubscription.onlyOwner);
    }
    if (user.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE) {
      throw new ConflictException(msg.adminSubscription.alreadyActive);
    }

    const now = new Date();
    const existingSub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const planId = planIdInput ?? user.subscriptionPlanId ?? existingSub?.planId;
    if (!planId) throw new BadRequestException(msg.adminSubscription.planRequired);

    const plan = await this.prisma.billingPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new BadRequestException(msg.adminSubscription.planNotFound);

    const cycle = cycleInput ?? user.subscriptionCycle ?? existingSub?.cycle ?? 'monthly';
    const rooms = roomsInput ?? existingSub?.rooms ?? 1;

    // Determine base date for extension: keep remaining trial time if still valid
    const currentTrialEnd = user.trialEndsAt;
    const baseDate =
      user.subscriptionStatus === SUBSCRIPTION_STATUS.TRIAL &&
      currentTrialEnd &&
      currentTrialEnd > now
        ? currentTrialEnd
        : now;
    const newTrialEndsAt = new Date(baseDate);
    newTrialEndsAt.setDate(newTrialEndsAt.getDate() + days);

    const isExtension =
      user.subscriptionStatus === SUBSCRIPTION_STATUS.TRIAL &&
      currentTrialEnd != null &&
      currentTrialEnd > now;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
          subscriptionPlanId: planId,
          subscriptionCycle: cycle,
          trialEndsAt: newTrialEndsAt,
          nextChargeAt: newTrialEndsAt,
        },
      });

      const reusable =
        existingSub &&
        (existingSub.status === SUBSCRIPTION_STATUS.TRIAL ||
          existingSub.status === SUBSCRIPTION_STATUS.CANCELLED) &&
        existingSub.planId === planId;

      if (reusable) {
        await tx.subscription.update({
          where: { id: existingSub.id },
          data: {
            cycle,
            rooms,
            status: SUBSCRIPTION_STATUS.TRIAL,
            endsAt: newTrialEndsAt,
            cancelledAt: null,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            userId,
            planId,
            cycle,
            rooms,
            status: SUBSCRIPTION_STATUS.TRIAL,
            startsAt: now,
            endsAt: newTrialEndsAt,
          },
        });
      }
    });

    this.logger.log(
      `Trial ${isExtension ? 'extended' : 'granted'}: user=${userId} days=${days} planId=${planId} by admin=${adminId}${reason ? ` reason="${reason}"` : ''}`,
    );

    const title = isExtension
      ? msg.adminSubscription.notifyExtendedTitle
      : msg.adminSubscription.notifyGrantedTitle;
    const body = isExtension
      ? msg.adminSubscription.notifyExtendedBody(days, newTrialEndsAt)
      : msg.adminSubscription.notifyGrantedBody(days, newTrialEndsAt);

    await this.notifications.notifyUser(
      userId,
      title,
      body,
      NOTIFICATION_TYPE.SYSTEM,
      undefined,
      'subscription',
      { pushType: 'trial_granted', deepLink: '/dashboard/billing' },
    );

    return {
      message: isExtension
        ? msg.adminSubscription.extendSuccess
        : msg.adminSubscription.grantSuccess,
      data: {
        userId,
        action: isExtension ? 'extended' : 'granted',
        days,
        planId,
        cycle,
        rooms,
        trialEndsAt: newTrialEndsAt,
      },
    };
  }

  /** Revoke an existing trial — sets user back to 'none' and cancels subscription row */
  async revokeTrial(
    adminId: string,
    userId: string,
    reason: string | undefined,
    msg: Messages,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    if (user.subscriptionStatus !== SUBSCRIPTION_STATUS.TRIAL) {
      throw new BadRequestException(msg.adminSubscription.notInTrial);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: SUBSCRIPTION_STATUS.NONE,
          subscriptionPlanId: null,
          subscriptionCycle: null,
          trialEndsAt: null,
          nextChargeAt: null,
        },
      });
      await tx.subscription.updateMany({
        where: { userId, status: SUBSCRIPTION_STATUS.TRIAL },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: now },
      });
    });

    this.logger.log(
      `Trial revoked: user=${userId} by admin=${adminId}${reason ? ` reason="${reason}"` : ''}`,
    );

    await this.notifications.notifyUser(
      userId,
      msg.adminSubscription.notifyRevokedTitle,
      msg.adminSubscription.notifyRevokedBody,
      NOTIFICATION_TYPE.SYSTEM,
      undefined,
      'subscription',
      { pushType: 'trial_revoked', deepLink: '/dashboard/billing' },
    );

    return {
      message: msg.adminSubscription.revokeSuccess,
      data: { userId, action: 'revoked', revokedAt: now },
    };
  }
}
