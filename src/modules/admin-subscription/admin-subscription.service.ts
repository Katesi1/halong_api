import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  ROLE,
  SUBSCRIPTION_STATUS,
  NOTIFICATION_TYPE,
  PAYMENT_PROVIDER,
  AUDIT_ACTION,
  AUDIT_TARGET_TYPE,
} from '../../common/constants';
import type { Messages } from '../../i18n';
import { computeFullCycleTotal, Cycle } from '../payment/helpers/billing.helper';

@Injectable()
export class AdminSubscriptionService {
  private readonly logger = new Logger(AdminSubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
  ) {}

  /** Get current subscription snapshot for a user (admin view) */
  async getSubscription(userId: string, msg: Messages) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        subscriptionStatus: true,
        subscriptionPlanId: true,
        subscriptionCycle: true,
        subscriptionProvider: true,
        subscriptionPriceOverride: true,
        subscriptionFrozenAt: true,
        subscriptionFrozenReason: true,
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
        customPrice: true,
        paidAmount: true,
        provider: true,
        note: true,
        frozenAt: true,
        frozenReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: msg.adminSubscription.getSuccess,
      data: { user, subscription },
    };
  }

  /** List subscriptions across the platform (admin overview) */
  async list(
    filters: {
      status?: string;
      plan?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    msg: Messages,
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: ROLE.OWNER,
      deletedAt: null,
    };
    if (filters.status) where.subscriptionStatus = filters.status;
    if (filters.plan) where.subscriptionPlanId = filters.plan;
    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          subscriptionStatus: true,
          subscriptionPlanId: true,
          subscriptionCycle: true,
          subscriptionProvider: true,
          subscriptionPriceOverride: true,
          subscriptionFrozenAt: true,
          subscriptionFrozenReason: true,
          trialEndsAt: true,
          nextChargeAt: true,
        },
      }),
    ]);

    // Enrich items with rooms (from latest subscription) + amount (computed)
    // FE no longer needs to derive these client-side.
    const userIds = users.map((u) => u.id);
    const planIds = Array.from(
      new Set(users.map((u) => u.subscriptionPlanId).filter((p): p is string => !!p)),
    );

    const [latestSubs, plans] = await Promise.all([
      userIds.length
        ? this.prisma.subscription.findMany({
            where: { userId: { in: userIds } },
            orderBy: { createdAt: 'desc' },
            select: { userId: true, rooms: true, planId: true, cycle: true },
          })
        : Promise.resolve([] as Array<{ userId: string; rooms: number; planId: string; cycle: string }>),
      planIds.length
        ? this.prisma.billingPlan.findMany({
            where: { id: { in: planIds } },
            select: {
              id: true,
              pricePerRoom: true,
              minCharge: true,
              yearlyDiscountPct: true,
              vatPct: true,
              maxRooms: true,
            },
          })
        : Promise.resolve([] as Array<{ id: string; pricePerRoom: number; minCharge: number; yearlyDiscountPct: number; vatPct: number; maxRooms: number | null }>),
    ]);

    const roomsByUser = new Map<string, number>();
    for (const s of latestSubs) {
      if (!roomsByUser.has(s.userId)) roomsByUser.set(s.userId, s.rooms);
    }
    const planById = new Map(plans.map((p) => [p.id, p]));

    const enriched = users.map((u) => {
      const plan = u.subscriptionPlanId ? planById.get(u.subscriptionPlanId) : undefined;
      const rooms = roomsByUser.get(u.id) ?? plan?.maxRooms ?? 1;
      const cycle = (u.subscriptionCycle ?? 'monthly') as Cycle;
      let amount: number | null = null;
      if (plan) {
        amount = computeFullCycleTotal(
          plan,
          cycle,
          rooms,
          u.subscriptionPriceOverride,
        ).total;
      } else if (u.subscriptionPriceOverride !== null && u.subscriptionPriceOverride !== undefined) {
        amount = u.subscriptionPriceOverride;
      }
      return { ...u, rooms, amount };
    });

    return {
      message: msg.adminSubscription.listSuccess,
      data: {
        items: enriched,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Count subscriptions in past_due status (sidebar badge) */
  async countOverdue(msg: Messages) {
    const count = await this.prisma.user.count({
      where: {
        role: ROLE.OWNER,
        deletedAt: null,
        subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE,
      },
    });
    return { message: msg.adminSubscription.countSuccess, data: { count } };
  }

  /** Sum of paidAmount on Subscription rows updated in [from, to] */
  async sumPaid(from: string | undefined, to: string | undefined, msg: Messages) {
    const where: Prisma.SubscriptionWhereInput = {
      paidAmount: { gt: 0 },
    };
    if (from || to) {
      where.updatedAt = {};
      if (from) (where.updatedAt as { gte?: Date }).gte = new Date(from);
      if (to) (where.updatedAt as { lte?: Date }).lte = new Date(to);
    }
    const agg = await this.prisma.subscription.aggregate({
      where,
      _sum: { paidAmount: true },
      _count: { _all: true },
    });
    return {
      message: msg.adminSubscription.sumPaidSuccess,
      data: {
        totalPaid: agg._sum.paidAmount ?? 0,
        count: agg._count._all,
        from: from ?? null,
        to: to ?? null,
      },
    };
  }

  /** Set or clear custom price override for a user */
  async setPrice(
    adminId: string,
    userId: string,
    priceOverride: number | null,
    reason: string | undefined,
    msg: Messages,
  ) {
    if (priceOverride !== null && (!Number.isInteger(priceOverride) || priceOverride < 0)) {
      throw new BadRequestException(msg.adminSubscription.priceInvalid);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, subscriptionPriceOverride: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    if (user.role !== ROLE.OWNER) {
      throw new BadRequestException(msg.adminSubscription.onlyOwner);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { subscriptionPriceOverride: priceOverride },
    });

    this.logger.log(
      `Price override ${priceOverride === null ? 'cleared' : `= ${priceOverride}`} for user=${userId} by admin=${adminId}${reason ? ` reason="${reason}"` : ''}`,
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.SUBSCRIPTION_SET_PRICE,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      metadata: { priceOverride, reason: reason ?? null },
    });

    const title =
      priceOverride === null
        ? msg.adminSubscription.notifyPriceClearedTitle
        : msg.adminSubscription.notifyPriceSetTitle;
    const body =
      priceOverride === null
        ? msg.adminSubscription.notifyPriceClearedBody
        : msg.adminSubscription.notifyPriceSetBody(priceOverride);

    await this.notifications.notifyUser(
      userId,
      title,
      body,
      NOTIFICATION_TYPE.SYSTEM,
      undefined,
      'subscription',
      { pushType: 'subscription_price_changed', deepLink: '/dashboard/billing' },
    );

    return {
      message: msg.adminSubscription.priceSetSuccess,
      data: { userId, priceOverride },
    };
  }

  /**
   * Manually record a payment (offline/bank transfer). Extends subscription period
   * and flips status to active.
   */
  async markPaid(
    adminId: string,
    userId: string,
    dto: {
      amount: number;
      days?: number;
      planId?: string;
      cycle?: 'monthly' | 'yearly';
      rooms?: number;
      reference?: string;
      note?: string;
    },
    msg: Messages,
  ) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException(msg.adminSubscription.markPaidAmountRequired);
    }

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
        nextChargeAt: true,
      },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    if (!user.isActive) throw new BadRequestException(msg.adminSubscription.userInactive);
    if (user.role !== ROLE.OWNER) {
      throw new BadRequestException(msg.adminSubscription.onlyOwner);
    }

    const existingSub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const planId = dto.planId ?? user.subscriptionPlanId ?? existingSub?.planId;
    if (!planId) throw new BadRequestException(msg.adminSubscription.planRequired);
    const plan = await this.prisma.billingPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new BadRequestException(msg.adminSubscription.planNotFound);

    const cycle = dto.cycle ?? user.subscriptionCycle ?? existingSub?.cycle ?? 'monthly';
    const rooms = dto.rooms ?? existingSub?.rooms ?? 1;
    const days = dto.days ?? (cycle === 'yearly' ? 365 : 30);

    const now = new Date();
    const currentExpiry =
      existingSub && existingSub.endsAt > now ? existingSub.endsAt : now;
    const newEndsAt = new Date(currentExpiry);
    newEndsAt.setDate(newEndsAt.getDate() + days);

    // Idempotency: nếu trong 10s vừa rồi đã có 1 ACTIVE subscription row được tạo
    // bởi mark-paid (cùng startsAt gần currentExpiry) → throw để chặn double-submit
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    const recentDuplicate = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        provider: PAYMENT_PROVIDER.MANUAL,
        createdAt: { gte: tenSecondsAgo },
      },
    });
    if (recentDuplicate) {
      throw new ConflictException(msg.adminSubscription.markPaidDuplicate);
    }

    // Lưu trial info trước khi clear (audit/restore reference)
    const previousTrialEndsAt = user.trialEndsAt;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
          subscriptionPlanId: planId,
          subscriptionCycle: cycle,
          subscriptionProvider: PAYMENT_PROVIDER.MANUAL,
          trialEndsAt: null,
          nextChargeAt: newEndsAt,
          subscriptionFrozenAt: null,
          subscriptionFrozenReason: null,
        },
      });

      await tx.subscription.create({
        data: {
          userId,
          planId,
          cycle,
          rooms,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          startsAt: currentExpiry,
          endsAt: newEndsAt,
          customPrice: dto.amount,
          paidAmount: dto.amount,
          provider: PAYMENT_PROVIDER.MANUAL,
          note: dto.note ?? dto.reference ?? null,
        },
      });
    });

    this.logger.log(
      `Manual mark-paid: user=${userId} amount=${dto.amount} days=${days} planId=${planId} by admin=${adminId}${dto.reference ? ` ref="${dto.reference}"` : ''}`,
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.SUBSCRIPTION_MARK_PAID,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      metadata: {
        amount: dto.amount,
        planId,
        cycle,
        rooms,
        days,
        reference: dto.reference ?? null,
        note: dto.note ?? null,
        previousTrialEndsAt: previousTrialEndsAt?.toISOString() ?? null,
      },
    });

    await this.notifications.notifyUser(
      userId,
      msg.adminSubscription.notifyMarkPaidTitle,
      msg.adminSubscription.notifyMarkPaidBody(dto.amount, newEndsAt),
      NOTIFICATION_TYPE.SYSTEM,
      undefined,
      'subscription',
      { pushType: 'subscription_paid', deepLink: '/dashboard/billing' },
    );

    return {
      message: msg.adminSubscription.markPaidSuccess,
      data: {
        userId,
        amount: dto.amount,
        planId,
        cycle,
        rooms,
        startsAt: currentExpiry,
        endsAt: newEndsAt,
      },
    };
  }

  /** Freeze a subscription (block host access without cancelling). */
  async freeze(adminId: string, userId: string, reason: string, msg: Messages) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException(msg.adminSubscription.freezeReasonRequired);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, subscriptionStatus: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    if (user.role !== ROLE.OWNER) {
      throw new BadRequestException(msg.adminSubscription.onlyOwner);
    }
    if (user.subscriptionStatus === SUBSCRIPTION_STATUS.FROZEN) {
      throw new ConflictException(msg.adminSubscription.alreadyFrozen);
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: SUBSCRIPTION_STATUS.FROZEN,
          subscriptionFrozenAt: now,
          subscriptionFrozenReason: reason.trim(),
        },
      });
      await tx.subscription.updateMany({
        where: {
          userId,
          status: { in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIAL, SUBSCRIPTION_STATUS.PAST_DUE] },
        },
        data: {
          status: SUBSCRIPTION_STATUS.FROZEN,
          frozenAt: now,
          frozenReason: reason.trim(),
        },
      });
    });

    this.logger.log(
      `Subscription frozen: user=${userId} reason="${reason}" by admin=${adminId}`,
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.SUBSCRIPTION_FREEZE,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      metadata: { reason: reason.trim() },
    });

    await this.notifications.notifyUser(
      userId,
      msg.adminSubscription.notifyFrozenTitle,
      msg.adminSubscription.notifyFrozenBody(reason.trim()),
      NOTIFICATION_TYPE.SYSTEM,
      undefined,
      'subscription',
      { pushType: 'subscription_frozen', deepLink: '/dashboard/billing' },
    );

    return {
      message: msg.adminSubscription.freezeSuccess,
      data: { userId, frozenAt: now, reason: reason.trim() },
    };
  }

  /** Unfreeze: restore subscription to the most recent non-frozen status (active by default). */
  async unfreeze(adminId: string, userId: string, msg: Messages) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, subscriptionStatus: true, trialEndsAt: true, nextChargeAt: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    if (user.subscriptionStatus !== SUBSCRIPTION_STATUS.FROZEN) {
      throw new BadRequestException(msg.adminSubscription.notFrozen);
    }

    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Restore policy:
    //   1. Nếu trialEndsAt còn hiệu lực → TRIAL (user đang trial bị freeze)
    //   2. Nếu endsAt subscription > now → ACTIVE
    //   3. Else → PAST_DUE
    const now = new Date();
    let newStatus: string;
    if (user.trialEndsAt && user.trialEndsAt > now) {
      newStatus = SUBSCRIPTION_STATUS.TRIAL;
    } else if (sub && sub.endsAt > now) {
      newStatus = SUBSCRIPTION_STATUS.ACTIVE;
    } else {
      newStatus = SUBSCRIPTION_STATUS.PAST_DUE;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: newStatus,
          subscriptionFrozenAt: null,
          subscriptionFrozenReason: null,
        },
      });
      await tx.subscription.updateMany({
        where: { userId, status: SUBSCRIPTION_STATUS.FROZEN },
        data: { status: newStatus, frozenAt: null, frozenReason: null },
      });
    });

    this.logger.log(
      `Subscription unfrozen: user=${userId} newStatus=${newStatus} by admin=${adminId}`,
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.SUBSCRIPTION_UNFREEZE,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      metadata: { newStatus },
    });

    await this.notifications.notifyUser(
      userId,
      msg.adminSubscription.notifyUnfrozenTitle,
      msg.adminSubscription.notifyUnfrozenBody,
      NOTIFICATION_TYPE.SYSTEM,
      undefined,
      'subscription',
      { pushType: 'subscription_unfrozen', deepLink: '/dashboard/billing' },
    );

    return {
      message: msg.adminSubscription.unfreezeSuccess,
      data: { userId, status: newStatus },
    };
  }

  /** Owner-facing self view of own subscription. */
  async getMine(userId: string, msg: Messages) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        subscriptionStatus: true,
        subscriptionPlanId: true,
        subscriptionCycle: true,
        subscriptionProvider: true,
        subscriptionPriceOverride: true,
        subscriptionFrozenAt: true,
        subscriptionFrozenReason: true,
        trialEndsAt: true,
        nextChargeAt: true,
      },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    const sub = await this.prisma.subscription.findFirst({
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
        customPrice: true,
        provider: true,
      },
    });

    return {
      message: msg.adminSubscription.selfSuccess,
      data: { user, subscription: sub },
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
    if (user.subscriptionStatus === SUBSCRIPTION_STATUS.FROZEN) {
      throw new ConflictException(msg.adminSubscription.cannotGrantTrialFrozen);
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

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.SUBSCRIPTION_TRIAL_GRANT,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      metadata: { days, planId, cycle, rooms, isExtension, reason: reason ?? null },
    });

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

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.SUBSCRIPTION_TRIAL_REVOKE,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      metadata: { reason: reason ?? null },
    });

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
