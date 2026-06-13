import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Messages } from '../../i18n';
import { ROLE, AUDIT_ACTION, AUDIT_TARGET_TYPE } from '../../common/constants';
import * as bcrypt from 'bcryptjs';

// Fields non-admin users can update on their own profile
const SELF_EDITABLE_FIELDS = ['name', 'phone', 'email', 'gender', 'dateOfBirth'];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService, private auditLog: AuditLogService) {}

  async findAll(msg: Messages, role?: number, withStats?: boolean, q?: string) {
    const select: any = {
      id: true, name: true, phone: true, email: true, avatar: true,
      role: true, ownerId: true, isActive: true, gender: true, dateOfBirth: true,
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
      },
      select,
      orderBy: { createdAt: 'desc' },
    });

    // Map _count thành field phẳng cho FE
    const data = withStats
      ? users.map((u: any) => ({
          ...u,
          stats: {
            propertyCount: u._count?.properties ?? 0,
            bookingCount: (u._count?.saleBookings ?? 0) + (u._count?.customerBookings ?? 0),
          },
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
        role: true, ownerId: true, isActive: true, gender: true, dateOfBirth: true,
        kycBypass: true, kycStatus: true, createdAt: true,
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

  async create(dto: CreateUserDto, msg: Messages) {
    dto.email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException(msg.users.emailDuplicate);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
      select: {
        id: true, name: true, phone: true, email: true, role: true, ownerId: true,
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

    const now = new Date();
    const stamp = now.getTime();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          isActive: false,
          refreshToken: null,
          // Free up unique fields cho re-register
          email: `deleted-${stamp}-${user.email}`,
          phone: user.phone ? `deleted-${stamp}-${user.phone}` : null,
          googleSub: null,
          appleSub: null,
        },
      }),
      this.prisma.userDevice.deleteMany({ where: { userId } }),
    ]);

    if (reason) {
      this.logger.log(`Self-delete user ${userId} reason: ${reason.slice(0, 200)}`);
    }

    return { message: msg.users.selfDeleteSuccess, data: null };
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
      where: { role: ROLE.SALE, ownerId: null, isActive: true, deletedAt: null },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, ownerId: true, isActive: true, createdAt: true,
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
        role: true, isActive: true, createdAt: true,
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

  async banUser(adminId: string, userId: string, reason: string, msg: Messages) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException(msg.users.banReasonRequired);
    }
    if (adminId === userId) {
      throw new BadRequestException(msg.users.cannotSelfTarget);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, bannedAt: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    if (!user.isActive || user.bannedAt) {
      throw new BadRequestException(msg.users.alreadyBanned);
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        bannedAt: new Date(),
        bannedReason: reason.trim(),
        bannedBy: adminId,
        refreshToken: null,
      },
      select: { id: true, name: true, email: true, role: true, isActive: true, bannedAt: true, bannedReason: true },
    });
    this.logger.log(`User ${userId} banned by admin=${adminId} reason="${reason}"`);
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.USER_BAN,
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: userId,
      targetLabel: updated.email,
      metadata: { reason: reason.trim() },
    });
    return { message: msg.users.banSuccess, data: updated };
  }

  async unbanUser(adminId: string, userId: string, msg: Messages) {
    if (adminId === userId) {
      throw new BadRequestException(msg.users.cannotSelfTarget);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, bannedAt: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
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
    this.logger.log(`User ${userId} unbanned by admin=${adminId}`);
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
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
      data: { refreshToken: null },
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
      data: { password: hashed, refreshToken: null },
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

  async changeRole(adminId: string, userId: string, newRole: number, msg: Messages) {
    const allowedRoles: number[] = [ROLE.ADMIN, ROLE.OWNER, ROLE.SALE, ROLE.CUSTOMER];
    if (!allowedRoles.includes(newRole)) {
      throw new BadRequestException(msg.users.invalidRole);
    }
    if (adminId === userId) {
      throw new BadRequestException(msg.users.cannotSelfTarget);
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, ownerId: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    // When demoting to SALE → must clear ownerId if downgrading, but caller can re-assign separately.
    // When promoting to OWNER → clear ownerId.
    const data: { role: number; ownerId?: string | null } = { role: newRole };
    if (newRole === ROLE.OWNER || newRole === ROLE.ADMIN || newRole === ROLE.CUSTOMER) {
      data.ownerId = null;
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, role: true, ownerId: true, isActive: true },
    });
    this.logger.log(`Role changed user=${userId} ${user.role}→${newRole} by admin=${adminId}`);
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
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
