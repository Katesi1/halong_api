import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Messages } from '../../i18n';
import { ROLE, AUDIT_ACTION, AUDIT_TARGET_TYPE, USER_SCOPE } from '../../common/constants';
import * as bcrypt from 'bcryptjs';

const NOTIFICATION_TYPE_SYSTEM = 2;

// Fields non-admin users can update on their own profile
// (bank* để OWNER tự cấu hình thông tin nhận tiền chuyển khoản từ khách)
const SELF_EDITABLE_FIELDS = [
  'name', 'phone', 'email', 'gender', 'dateOfBirth',
  'bankBin', 'bankName', 'bankAccountNumber', 'bankAccountName',
];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notifications: NotificationsService,
    private email: EmailService,
  ) {}

  async findAll(
    msg: Messages,
    role?: number,
    withStats?: boolean,
    q?: string,
    scope?: string,
  ) {
    // scope chỉ có ý nghĩa với SALE. Truyền cho non-SALE → match 0.
    // 'all' (hoặc không truyền) → không filter.
    let scopeWhere: Record<string, unknown> = {};
    if (scope && scope !== 'all') {
      if (scope !== USER_SCOPE.OWNER && scope !== USER_SCOPE.SYSTEM) {
        throw new BadRequestException(msg.systemSale.scopeInvalid);
      }
      scopeWhere = { scope, role: ROLE.SALE };
    }

    const select: any = {
      id: true, name: true, phone: true, email: true, avatar: true,
      role: true, ownerId: true, scope: true, isActive: true, gender: true, dateOfBirth: true,
      kycBypass: true, kycStatus: true,
      subscriptionStatus: true, subscriptionPlanId: true, subscriptionCycle: true,
      bannedAt: true, bannedReason: true,
      createdAt: true, updatedAt: true,
    };
    if (withStats) {
      // Khi withStats=true: include _count cho property, saleBookings, customerBookings
      // FE map sang propertyCount + bookingCount theo role
      select._count = {
        select: {
          properties: { where: { deletedAt: null } },
          saleBookings: true,
          customerBookings: true,
        },
      };
    }

    const keyword = q?.trim().slice(0, 100);
    const searchClause = keyword
      ? {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' as const } },
            { phone: { contains: keyword } },
            { email: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(role !== undefined ? { role } : {}),
        ...searchClause,
        ...scopeWhere,
      },
      select,
      orderBy: { createdAt: 'desc' },
    });

    // Map _count thành field phẳng cho FE + bổ sung disputeCount + lastActiveAt
    let disputeCountMap = new Map<string, number>();
    let lastActiveMap = new Map<string, Date>();
    if (withStats && users.length) {
      const userIds = users.map((u: any) => u.id);
      const [disputeAgg, deviceAgg] = await Promise.all([
        this.prisma.dispute.groupBy({
          by: ['ownerId'],
          where: { ownerId: { in: userIds } },
          _count: { _all: true },
        }),
        // lastActiveAt = max(UserDevice.lastActiveAt) — phản ánh activity gần nhất qua mobile/FCM.
        this.prisma.userDevice.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _max: { lastActiveAt: true },
        }),
      ]);
      // Cộng thêm disputes mà user là customer.
      const customerDisputeAgg = await this.prisma.dispute.groupBy({
        by: ['customerId'],
        where: { customerId: { in: userIds } },
        _count: { _all: true },
      });
      for (const row of disputeAgg) {
        disputeCountMap.set(row.ownerId, row._count._all);
      }
      for (const row of customerDisputeAgg) {
        if (!row.customerId) continue;
        disputeCountMap.set(
          row.customerId,
          (disputeCountMap.get(row.customerId) ?? 0) + row._count._all,
        );
      }
      for (const row of deviceAgg) {
        if (row._max.lastActiveAt) lastActiveMap.set(row.userId, row._max.lastActiveAt);
      }
    }

    const data = withStats
      ? users.map((u: any) => ({
          ...u,
          stats: {
            propertyCount: u._count?.properties ?? 0,
            bookingCount: (u._count?.saleBookings ?? 0) + (u._count?.customerBookings ?? 0),
            disputeCount: disputeCountMap.get(u.id) ?? 0,
          },
          lastActiveAt: lastActiveMap.get(u.id) ?? null,
          _count: undefined,
        }))
      : users;

    return { message: msg.users.listSuccess, data };
  }

  async findOne(id: string, currentUser: { id: string; role: number }, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, ownerId: true, scope: true, isActive: true, gender: true, dateOfBirth: true,
        kycBypass: true, kycStatus: true, createdAt: true,
        bankBin: true, bankName: true, bankAccountNumber: true, bankAccountName: true,
        properties: {
          select: { id: true, name: true, code: true },
          where: { isActive: true, deletedAt: null },
        },
        staffMembers: {
          select: { id: true, name: true, phone: true, role: true, isActive: true },
          where: { deletedAt: null },
        },
      },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    // OWNER can only view their own SALE staff
    if (currentUser.role === ROLE.OWNER && user.ownerId !== currentUser.id) {
      throw new ForbiddenException(msg.common.forbidden);
    }

    return { message: msg.users.getSuccess, data: user };
  }

  async create(dto: CreateUserDto, currentUser: { id: string; role: number } | undefined, msg: Messages) {
    dto.email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException(msg.users.emailDuplicate);

    // scope chỉ có nghĩa với SALE — các role khác buộc về 'owner' (default) để không lưu rác.
    let scope = USER_SCOPE.OWNER as string;
    if (dto.role === ROLE.SALE) {
      if (dto.scope && dto.scope !== USER_SCOPE.OWNER && dto.scope !== USER_SCOPE.SYSTEM) {
        throw new BadRequestException(msg.systemSale.scopeInvalid);
      }
      scope = dto.scope ?? USER_SCOPE.OWNER;
      // Chỉ ADMIN được tạo SALE hệ thống (system SALE quá quyền lực, system SALE không tự tạo nhau).
      if (scope === USER_SCOPE.SYSTEM && currentUser?.role !== ROLE.ADMIN) {
        throw new ForbiddenException(msg.systemSale.onlyAdminCreate);
      }
    } else if (dto.scope && dto.scope !== USER_SCOPE.OWNER) {
      // Truyền scope=system cho non-SALE → sai bản chất.
      throw new BadRequestException(msg.systemSale.scopeInvalid);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const { scope: _ignore, ...rest } = dto;

    const user = await this.prisma.user.create({
      data: { ...rest, password: hashedPassword, scope },
      select: {
        id: true, name: true, phone: true, email: true, role: true, ownerId: true, scope: true,
        gender: true, dateOfBirth: true, createdAt: true,
      },
    });

    return { message: msg.users.createSuccess, data: user };
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUser: { id: string; role: number },
    msg: Messages,
  ) {
    // Non-admin can only edit themselves
    if (currentUser.role !== ROLE.ADMIN && currentUser.id !== id) {
      throw new ForbiddenException(msg.common.forbidden);
    }

    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException(msg.users.notFound);

    // Non-admin: strip privileged fields (role, isActive, password)
    let filteredDto = dto;
    if (currentUser.role !== ROLE.ADMIN) {
      filteredDto = {} as UpdateUserDto;
      for (const field of SELF_EDITABLE_FIELDS) {
        if ((dto as any)[field] !== undefined) {
          (filteredDto as any)[field] = (dto as any)[field];
        }
      }
    }

    if (filteredDto.phone && filteredDto.phone !== user.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: filteredDto.phone } });
      if (existing) throw new ConflictException(msg.users.phoneDuplicate);
    }

    const { password, dateOfBirth, ...rest } = filteredDto;
    const data: any = {
      ...rest,
      ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
    };

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, name: true, phone: true, email: true, role: true, ownerId: true,
        isActive: true, gender: true, dateOfBirth: true, updatedAt: true,
        bankBin: true, bankName: true, bankAccountNumber: true, bankAccountName: true,
      },
    });

    return { message: msg.users.updateSuccess, data: updated };
  }

  async remove(id: string, currentUserId: string, msg: Messages) {
    if (id === currentUserId) {
      throw new BadRequestException(msg.users.cannotDeleteSelf);
    }
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException(msg.users.notFound);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    void this.auditLog.log({
      actorId: currentUserId,
      actorRole: ROLE.ADMIN,
      action: 'user.delete',
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: id,
      targetLabel: user.email,
    });

    return { message: msg.users.disableSuccess, data: null };
  }

  /**
   * Self-delete account (Apple/Google Store + GDPR compliance).
   * - Soft-delete user (`deletedAt = now`)
   * - Rename email/phone để giải phóng unique constraint → user có thể re-register ngay
   * - Revoke refresh token + xoá tất cả device tokens
   * - Lưu lý do (optional)
   */
  async selfDelete(userId: string, reason: string | undefined, msg: Messages) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException(msg.users.notFound);

    // NĐ 13: tạo deletion request grace 30 ngày, không xoá ngay
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.accountDeletionRequest.create({
        data: {
          userId,
          status: 'pending',
          reason: reason ?? null,
          requestedAt: now,
          scheduledDeleteAt: scheduledAt,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletionScheduledAt: scheduledAt,
          // Logout mọi phiên ngay (cả app mobile + web)
          refreshToken: null,
          refreshTokenMobile: null,
          refreshTokenWeb: null,
        },
      }),
      this.prisma.userDevice.deleteMany({ where: { userId } }),
    ]);

    this.logger.log(`Self-delete request user=${userId} scheduledDeleteAt=${scheduledAt.toISOString()}${reason ? ` reason="${reason.slice(0, 200)}"` : ''}`);

    // In-app notification + email (best-effort, không vỡ flow nếu fail)
    const dateStr = scheduledAt.toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    try {
      await this.notifications.create({
        userId,
        title: msg.users.selfDeleteNotifTitle,
        subtitle: msg.users.selfDeleteNotifSubtitle(dateStr),
        type: NOTIFICATION_TYPE_SYSTEM,
        targetType: 'account_deletion',
      });
    } catch (err) {
      this.logger.warn(`selfDelete notification failed for user=${userId}: ${(err as Error).message}`);
    }
    if (user.email && !user.email.startsWith('deleted-')) {
      this.email
        .sendAccountDeletionScheduled({ to: user.email, name: user.name, scheduledDeleteAt: scheduledAt })
        .catch((err) => this.logger.warn(`selfDelete email failed for user=${userId}: ${err.message}`));
    }

    return {
      message: msg.users.selfDeleteSuccess,
      data: {
        scheduledDeleteAt: scheduledAt.toISOString(),
        graceDays: 30,
        canRestoreUntil: scheduledAt.toISOString(),
      },
    };
  }

  /**
   * Trạng thái yêu cầu xoá tài khoản đang chờ — FE check để show banner khôi phục.
   */
  async getDeletionStatus(userId: string, msg: Messages) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletionScheduledAt: true },
    });
    if (!u?.deletionScheduledAt) {
      return {
        message: msg.users.deletionStatusSuccess,
        data: { pending: false, scheduledDeleteAt: null, daysRemaining: 0 },
      };
    }
    const msLeft = u.deletionScheduledAt.getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return {
      message: msg.users.deletionStatusSuccess,
      data: {
        pending: true,
        scheduledDeleteAt: u.deletionScheduledAt.toISOString(),
        daysRemaining,
      },
    };
  }

  /**
   * Huỷ yêu cầu xoá đang pending — gọi từ:
   *  - AuthService sau khi login/google/apple/refresh thành công (reason='user_login')
   *  - POST /users/me/restore (reason='user_cancel')
   * Tạo in-app notification + email "đã khôi phục". Idempotent — không có pending request → no-op.
   */
  async cancelDeletion(
    userId: string,
    reason: 'user_login' | 'user_cancel' | 'admin_cancel',
    msg?: Messages,
  ): Promise<boolean> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletionScheduledAt: true, email: true, name: true },
    });
    if (!u?.deletionScheduledAt) {
      if (reason === 'user_cancel' && msg) {
        throw new BadRequestException(msg.users.deletionNotPending);
      }
      return false;
    }

    await this.prisma.$transaction([
      this.prisma.accountDeletionRequest.updateMany({
        where: { userId, status: 'pending' },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { deletionScheduledAt: null },
      }),
    ]);
    this.logger.log(`Cancelled pending deletion for user=${userId} reason=${reason}`);

    // Notification + email — fallback messages dùng VI khi gọi từ auto-login path (msg undefined)
    const title = msg?.users.deletionRestoreNotifTitle ?? 'Tài khoản đã được khôi phục';
    const subtitle = msg?.users.deletionRestoreNotifSubtitle ?? 'Bạn đã huỷ yêu cầu xoá tài khoản. Mọi dữ liệu được giữ lại.';
    try {
      await this.notifications.create({
        userId,
        title,
        subtitle,
        type: NOTIFICATION_TYPE_SYSTEM,
        targetType: 'account_deletion_restored',
      });
    } catch (err) {
      this.logger.warn(`cancelDeletion notification failed for user=${userId}: ${(err as Error).message}`);
    }
    if (u.email && !u.email.startsWith('deleted-')) {
      this.email
        .sendAccountDeletionRestored({ to: u.email, name: u.name })
        .catch((err) => this.logger.warn(`cancelDeletion email failed for user=${userId}: ${err.message}`));
    }

    return true;
  }

  /**
   * Cron: thực thi deletion sau grace 30 ngày.
   * Soft-delete + rename unique fields + clear sessions (logic cũ).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async executePendingDeletions(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.accountDeletionRequest.findMany({
      where: { status: 'pending', scheduledDeleteAt: { lte: now } },
      take: 100,
      include: { user: { select: { id: true, email: true, phone: true } } },
    });

    let count = 0;
    for (const req of due) {
      const u = req.user;
      if (!u || !u.email) continue;
      const stamp = now.getTime();
      try {
        await this.prisma.$transaction([
          // 1) Detach financial records (PaymentSession.submissionId is FK Cascade →
          //    null first so we don't delete payment history when KYC submissions go).
          this.prisma.paymentSession.updateMany({
            where: { userId: u.id, submissionId: { not: null } },
            data: { submissionId: null },
          }),

          // 2) Hard-delete KYC data (uploads cascade with submission).
          this.prisma.kycSubmission.deleteMany({ where: { userId: u.id } }),

          // 3) Hard-delete personal/session data — re-register starts fresh.
          this.prisma.userDevice.deleteMany({ where: { userId: u.id } }),
          this.prisma.userConsent.deleteMany({ where: { userId: u.id } }),
          this.prisma.notificationPreference.deleteMany({ where: { userId: u.id } }),
          this.prisma.dataExportRequest.deleteMany({ where: { userId: u.id } }),
          this.prisma.userPermission.deleteMany({ where: { userId: u.id } }),
          this.prisma.supportTicket.deleteMany({ where: { userId: u.id } }),
          // Feedback: relation is SetNull → keep aggregate signal but strip identity.
          this.prisma.feedback.updateMany({
            where: { userId: u.id },
            data: { userId: null, contact: null },
          }),

          // 4) Anonymize User row — release unique fields, reset KYC + subscription
          //    so a future re-register with same email/phone is a clean account.
          this.prisma.user.update({
            where: { id: u.id },
            data: {
              deletedAt: now,
              isActive: false,
              refreshToken: null,
              refreshTokenMobile: null,
              refreshTokenWeb: null,
              deletionScheduledAt: null,
              email: `deleted-${stamp}-${u.email}`,
              phone: u.phone ? `deleted-${stamp}-${u.phone}` : null,
              googleSub: null,
              appleSub: null,
              password: null,
              name: 'Deleted User',
              avatar: null,
              gender: null,
              dateOfBirth: null,
              emailVerified: false,
              registerDeviceId: null,
              registerIp: null,
              kycBypass: false,
              kycStatus: 'none',
              kycSubmissionId: null,
              subscriptionStatus: 'none',
              subscriptionPlanId: null,
              subscriptionCycle: null,
              subscriptionProvider: null,
              subscriptionPriceOverride: null,
              subscriptionFrozenAt: null,
              subscriptionFrozenReason: null,
              trialEndsAt: null,
              nextChargeAt: null,
              currentPeriodStart: null,
              currentPeriodEnd: null,
              pendingPlanId: null,
              pendingCycle: null,
              pendingEffectiveAt: null,
            },
          }),

          this.prisma.accountDeletionRequest.update({
            where: { id: req.id },
            data: { status: 'completed', completedAt: now },
          }),
        ]);
        count++;
      } catch (err) {
        this.logger.error(`Failed to execute deletion req=${req.id}: ${(err as Error).message}`);
      }
    }
    if (count > 0) this.logger.log(`Executed ${count} pending account deletions`);
    return count;
  }

  // ─── KYC Bypass (ADMIN only) ────────────────────────────────────────────────

  async toggleKycBypass(adminId: string, id: string, bypass: boolean, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, role: ROLE.OWNER },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { kycBypass: bypass },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, isActive: true, kycBypass: true, kycStatus: true,
      },
    });

    this.logger.log(
      `KYC bypass ${bypass ? 'granted' : 'revoked'} for user=${id} by admin=${adminId}`,
    );
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.USER_KYC_BYPASS_TOGGLE,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: id,
      targetLabel: user.email,
      metadata: { bypass },
    });

    return {
      message: bypass ? msg.users.kycBypassGranted : msg.users.kycBypassRevoked,
      data: updated,
    };
  }

  // ─── Staff Management (OWNER only) ─────────────────────────────────────────

  async getAvailableStaff(msg: Messages) {
    const staff = await this.prisma.user.findMany({
      // Loại trừ system SALE (scope=system) — họ thuộc hệ thống, không gán cho OWNER được.
      where: {
        role: ROLE.SALE,
        ownerId: null,
        scope: USER_SCOPE.OWNER,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, ownerId: true, scope: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { message: msg.users.staffListSuccess, data: staff };
  }

  async getMyStaff(ownerId: string, msg: Messages) {
    const staff = await this.prisma.user.findMany({
      where: { ownerId, role: ROLE.SALE, deletedAt: null },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, scope: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { message: msg.users.staffListSuccess, data: staff };
  }

  async addMyStaff(ownerId: string, saleEmail: string, msg: Messages) {
    const sale = await this.prisma.user.findFirst({
      where: { email: saleEmail.toLowerCase().trim(), deletedAt: null },
    });
    if (!sale) throw new NotFoundException(msg.users.staffUserNotFound);

    if (sale.role !== ROLE.SALE) {
      throw new BadRequestException(msg.users.staffOnlySaleRole);
    }

    // System SALE không được gán cho OWNER (họ thuộc hệ thống).
    if (sale.scope === USER_SCOPE.SYSTEM) {
      throw new BadRequestException(msg.users.staffOnlySaleRole);
    }

    if (sale.ownerId) {
      throw new ConflictException(msg.users.staffAlreadyAssigned);
    }

    const updated = await this.prisma.user.update({
      where: { id: sale.id },
      data: { ownerId },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, ownerId: true, isActive: true, createdAt: true,
      },
    });

    return { message: msg.users.staffAddSuccess, data: updated };
  }

  // ─── Admin moderation actions ──────────────────────────────────────────────

  /** Chống leo quyền: system SALE không được tác động lên user role=ADMIN. */
  private assertCallerCanTargetAdmin(caller: { role: number }, targetRole: number, msg: Messages) {
    if (targetRole === ROLE.ADMIN && caller.role !== ROLE.ADMIN) {
      throw new ForbiddenException(msg.common.forbidden);
    }
  }

  async banUser(caller: { id: string; role: number }, userId: string, reason: string, msg: Messages) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException(msg.users.banReasonRequired);
    }
    if (caller.id === userId) {
      throw new BadRequestException(msg.users.cannotSelfTarget);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true, bannedAt: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    this.assertCallerCanTargetAdmin(caller, user.role, msg);
    if (!user.isActive || user.bannedAt) {
      throw new BadRequestException(msg.users.alreadyBanned);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        bannedAt: new Date(),
        bannedReason: reason.trim(),
        bannedBy: caller.id,
        refreshToken: null,
        refreshTokenMobile: null,
        refreshTokenWeb: null,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, bannedAt: true, bannedReason: true },
    });
    this.logger.log(`User ${userId} banned by caller=${caller.id} reason="${reason}"`);
    void this.auditLog.log({
      actorId: caller.id,
      actorRole: caller.role,
      action: AUDIT_ACTION.USER_BAN,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      targetLabel: updated.email,
      metadata: { reason: reason.trim() },
    });
    return { message: msg.users.banSuccess, data: updated };
  }

  async unbanUser(caller: { id: string; role: number }, userId: string, msg: Messages) {
    if (caller.id === userId) {
      throw new BadRequestException(msg.users.cannotSelfTarget);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, bannedAt: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    this.assertCallerCanTargetAdmin(caller, user.role, msg);
    if (!user.bannedAt) {
      throw new BadRequestException(msg.users.notBanned);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        bannedAt: null,
        bannedReason: null,
        bannedBy: null,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    this.logger.log(`User ${userId} unbanned by caller=${caller.id}`);
    void this.auditLog.log({
      actorId: caller.id,
      actorRole: caller.role,
      action: AUDIT_ACTION.USER_UNBAN,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      targetLabel: updated.email,
    });
    return { message: msg.users.unbanSuccess, data: updated };
  }

  async revokeSessions(adminId: string, userId: string, msg: Messages) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    await this.prisma.user.update({
      where: { id: userId },
      // Revoke sessions → clear cả 3 cột (legacy + mobile + web)
      data: { refreshToken: null, refreshTokenMobile: null, refreshTokenWeb: null },
    });
    // Also remove FCM device tokens so push notifications stop reaching former sessions.
    await this.prisma.userDevice.deleteMany({ where: { userId } });
    this.logger.log(`Sessions revoked for user=${userId} by admin=${adminId}`);
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.USER_REVOKE_SESSIONS,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
    });
    return { message: msg.users.revokeSessionsSuccess, data: { userId } };
  }

  async adminResetPassword(
    adminId: string,
    userId: string,
    newPassword: string | undefined,
    msg: Messages,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    // Generate a temporary password if admin didn't specify one
    const generated =
      newPassword ??
      `Tmp${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 90 + 10)}!`;
    if (generated.length < 8) {
      throw new BadRequestException(msg.users.passwordTooShort);
    }
    // Complexity: ít nhất 1 chữ + 1 số (auto-generated luôn pass, admin-set thì có thể fail).
    if (!/[A-Za-z]/.test(generated) || !/\d/.test(generated)) {
      throw new BadRequestException(msg.users.passwordWeak);
    }
    const hashed = await bcrypt.hash(generated, 10);
    await this.prisma.user.update({
      where: { id: userId },
      // Admin reset password → force logout mọi phiên (mobile + web)
      data: { password: hashed, refreshToken: null, refreshTokenMobile: null, refreshTokenWeb: null },
    });
    this.logger.log(`Password reset for user=${userId} by admin=${adminId}`);
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.USER_RESET_PASSWORD,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      metadata: { adminSuppliedPassword: !!newPassword },
    });
    // Return the temporary password ONLY when admin didn't supply one — UI shows once.
    return {
      message: msg.users.resetPasswordSuccess,
      data: {
        userId,
        tempPassword: newPassword ? null : generated,
      },
    };
  }

  async changeRole(caller: { id: string; role: number }, userId: string, newRole: number, msg: Messages) {
    const allowedRoles: number[] = [ROLE.ADMIN, ROLE.OWNER, ROLE.SALE, ROLE.CUSTOMER];
    if (!allowedRoles.includes(newRole)) {
      throw new BadRequestException(msg.users.invalidRole);
    }
    if (caller.id === userId) {
      throw new BadRequestException(msg.users.cannotSelfTarget);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, ownerId: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    // Chống leo quyền: chỉ ADMIN được tác động lên user ADMIN HOẶC nâng cấp lên ADMIN.
    this.assertCallerCanTargetAdmin(caller, user.role, msg);
    if (newRole === ROLE.ADMIN && caller.role !== ROLE.ADMIN) {
      throw new ForbiddenException(msg.common.forbidden);
    }

    // When demoting to SALE → must clear ownerId if downgrading, but caller can re-assign separately.
    // When promoting to OWNER → clear ownerId.
    // Khi role mới ≠ SALE → reset scope='owner' (scope chỉ có ngữ nghĩa với SALE).
    const data: { role: number; ownerId?: string | null; scope?: string } = { role: newRole };
    if (newRole === ROLE.OWNER || newRole === ROLE.ADMIN || newRole === ROLE.CUSTOMER) {
      data.ownerId = null;
      data.scope = USER_SCOPE.OWNER;
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, role: true, ownerId: true, isActive: true },
    });
    this.logger.log(`Role changed user=${userId} ${user.role}→${newRole} by caller=${caller.id}`);
    void this.auditLog.log({
      actorId: caller.id,
      actorRole: caller.role,
      action: AUDIT_ACTION.USER_CHANGE_ROLE,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      metadata: { oldRole: user.role, newRole },
    });
    return { message: msg.users.changeRoleSuccess, data: updated };
  }

  async removeMyStaff(ownerId: string, staffId: string, msg: Messages) {
    const staff = await this.prisma.user.findFirst({
      where: { id: staffId, ownerId, role: ROLE.SALE, deletedAt: null },
    });
    if (!staff) throw new NotFoundException(msg.users.staffNotFound);

    await this.prisma.user.update({
      where: { id: staffId },
      data: { ownerId: null },
    });

    return { message: msg.users.staffRemoveSuccess, data: null };
  }
}
