import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateSystemInviteDto } from './dto/create-system-invite.dto';
import { Messages } from '../../i18n';
import {
  ROLE,
  USER_SCOPE,
  AUDIT_ACTION,
  AUDIT_TARGET_TYPE,
} from '../../common/constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import * as crypto from 'crypto';

const INVITE_TTL_DAYS = 7;
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SHORT_CODE_LENGTH = 6;

@Injectable()
export class SystemStaffService {
  private readonly logger = new Logger(SystemStaffService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private configService: ConfigService,
    private auditLog: AuditLogService,
  ) {}

  /**
   * Admin tạo invite cho SALE hệ thống.
   * Reuse bảng `staff_invites` với `scope=system`. `ownerId` lưu admin id (inviter).
   */
  async createInvite(adminId: string, dto: CreateSystemInviteDto, msg: Messages) {
    const email = dto.email.toLowerCase().trim();

    // Chống mời chính mình
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!admin) throw new NotFoundException(msg.users.notFound);
    if (email === admin.email.toLowerCase()) {
      throw new BadRequestException(msg.staff.inviteSelf);
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existingUser) {
      throw new ConflictException(msg.staff.emailHasAccount);
    }

    // Auto-expire stale pending invites cho cùng email + system scope
    await this.prisma.staffInvite.updateMany({
      where: { email, scope: USER_SCOPE.SYSTEM, status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });

    const existingInvite = await this.prisma.staffInvite.findFirst({
      where: { email, scope: USER_SCOPE.SYSTEM, status: 'pending', expiresAt: { gt: new Date() } },
    });
    if (existingInvite) {
      throw new ConflictException(msg.staff.invitePendingDuplicate);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const shortCode = this.generateShortCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.staffInvite.create({
      data: {
        ownerId: adminId, // inviter
        email,
        token,
        shortCode,
        scope: USER_SCOPE.SYSTEM,
        expiresAt,
        status: 'pending',
      },
    });

    const baseUrl = this.configService.get<string>('FRONTEND_BASE_URL') || 'https://halong24h.com';
    const inviteLink = `${baseUrl}/staff/accept?token=${token}`;

    let emailSent = true;
    try {
      await this.emailService.sendStaffInvite({
        to: email,
        ownerName: admin.name || 'Halong24h Admin',
        inviteLink,
        shortCode,
        expiresAt,
        appStoreUrl: this.configService.get<string>('APP_STORE_URL') || null,
        playStoreUrl: this.configService.get<string>('PLAY_STORE_URL') || null,
      });
    } catch (err) {
      emailSent = false;
      this.logger.error(`System staff invite email failed ${invite.id}: ${(err as Error).message}`);
    }

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: 'system_staff.invite_create',
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: invite.id,
      targetLabel: email,
    });

    return {
      message: msg.systemSale.inviteCreateSuccess(email),
      data: {
        invite: {
          id: invite.id,
          email: invite.email,
          shortCode: invite.shortCode,
          scope: invite.scope,
          status: invite.status,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        },
        inviteLink,
        emailSent,
      },
    };
  }

  async listInvites(status: string | undefined, msg: Messages) {
    const where: any = { scope: USER_SCOPE.SYSTEM };
    if (status && status !== 'all') where.status = status;

    const invites = await this.prisma.staffInvite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, shortCode: true, status: true, scope: true,
        ownerId: true, expiresAt: true, acceptedAt: true, acceptedUserId: true, createdAt: true,
      },
    });
    return { message: msg.systemSale.inviteListSuccess, data: invites };
  }

  async cancelInvite(adminId: string, inviteId: string, msg: Messages) {
    const invite = await this.prisma.staffInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException(msg.staff.inviteNotFound);
    if (invite.scope !== USER_SCOPE.SYSTEM) {
      throw new BadRequestException(msg.staff.inviteForbidden);
    }
    if (invite.status !== 'pending') {
      throw new BadRequestException(msg.staff.inviteOnlyPendingCancel);
    }
    await this.prisma.staffInvite.update({
      where: { id: inviteId },
      data: { status: 'cancelled' },
    });
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: 'system_staff.invite_cancel',
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: invite.id,
      targetLabel: invite.email,
    });
    return { message: msg.systemSale.inviteCancelSuccess, data: null };
  }

  async listStaff(isActiveFilter: string | undefined, msg: Messages) {
    const where: any = {
      role: ROLE.SALE,
      scope: USER_SCOPE.SYSTEM,
      deletedAt: null,
    };
    if (isActiveFilter === 'true') where.isActive = true;
    else if (isActiveFilter === 'false') where.isActive = false;

    const staff = await this.prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, avatar: true,
        role: true, scope: true, isActive: true, createdAt: true,
        permissions: {
          select: { module: true, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { message: msg.systemSale.listSuccess, data: staff };
  }

  async removeStaff(adminId: string, staffId: string, msg: Messages) {
    if (adminId === staffId) {
      throw new BadRequestException(msg.staff.cannotRemoveSelf);
    }
    const staff = await this.prisma.user.findFirst({
      where: { id: staffId, role: ROLE.SALE, scope: USER_SCOPE.SYSTEM, deletedAt: null },
    });
    if (!staff) throw new NotFoundException(msg.systemSale.notFound);

    await this.prisma.user.update({
      where: { id: staffId },
      // Disable system SALE → logout mọi phiên (mobile + web)
      data: { isActive: false, refreshToken: null, refreshTokenMobile: null, refreshTokenWeb: null },
    });
    // Xoá device tokens để dừng FCM push.
    await this.prisma.userDevice.deleteMany({ where: { userId: staffId } });

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: 'system_staff.remove',
      targetType: AUDIT_TARGET_TYPE.USER,
      targetId: staffId,
      targetLabel: staff.email,
    });

    return { message: msg.systemSale.removeSuccess, data: null };
  }

  private generateShortCode(): string {
    let code = '';
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
      const idx = crypto.randomInt(0, SHORT_CODE_ALPHABET.length);
      code += SHORT_CODE_ALPHABET[idx];
    }
    return code;
  }
}
