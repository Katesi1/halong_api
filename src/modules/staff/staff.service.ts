import {
  Injectable,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  GoneException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { Messages } from '../../i18n';
import {
  ROLE,
  KYC_STATUS,
  NOTIFICATION_TYPE,
  PERMISSION_MODULE,
} from '../../common/constants';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { getEffectiveMaxSaleStaff, getPlanDisplayName } from '../../common/staff-entitlement';
import { isOwnerEntitled } from '../../common/subscription';
import { kycRequired } from '../../common/errors/kyc.errors';
import { featureLocked } from '../../common/errors/subscription.errors';

const INVITE_TTL_DAYS = 7;
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ I,O,1,0 cho dễ đọc
const SHORT_CODE_LENGTH = 6;

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private emailService: EmailService,
    private notifications: NotificationsService,
    private configService: ConfigService,
  ) {}

  async createInvite(caller: { id: string; role: number }, dto: CreateInviteDto, msg: Messages) {
    const isAdmin = caller.role === ROLE.ADMIN;
    const resolvedOwnerId = isAdmin ? dto.ownerId : caller.id;
    if (!resolvedOwnerId) {
      throw new BadRequestException(msg.staff.ownerIdRequired);
    }
    const ownerId: string = resolvedOwnerId;

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        id: true, name: true, email: true, role: true,
        kycStatus: true, kycBypass: true,
        subscriptionStatus: true, subscriptionPlanId: true,
        trialEndsAt: true,
      },
    });
    if (!owner || owner.role !== ROLE.OWNER) {
      throw new ForbiddenException(msg.staff.ownerOnly);
    }
    if (!isAdmin) {
      if (!owner.kycBypass && owner.kycStatus !== KYC_STATUS.APPROVED) {
        throw kycRequired(msg.staff.kycRequired);
      }
      // Apple IAP compliance: hết trial / chưa active → khoá im lặng, dùng
      // message entitlement chung (không lộ trạng thái subscription).
      if (!isOwnerEntitled(owner)) {
        throw featureLocked(msg.subscription.featureLocked);
      }

      // Plan entitlement: số slot SALE theo gói. Mirror FE StaffEntitlement.
      // ADMIN bypass để có thể seed/khắc phục thủ công.
      const maxSlots = getEffectiveMaxSaleStaff(
        owner.subscriptionPlanId,
        owner.subscriptionStatus,
      );
      const planName = getPlanDisplayName(owner.subscriptionPlanId);
      if (maxSlots === 0) {
        throw new ForbiddenException(msg.staff.staffNotAllowedOnPlan(planName));
      }
      if (maxSlots !== null) {
        // Đếm SALE active + invite pending chưa hết hạn → tính cả "đang giữ slot".
        const [activeStaff, pendingInvites] = await Promise.all([
          this.prisma.user.count({
            where: { ownerId, role: ROLE.SALE, isActive: true, deletedAt: null },
          }),
          this.prisma.staffInvite.count({
            where: { ownerId, status: 'pending', expiresAt: { gt: new Date() } },
          }),
        ]);
        if (activeStaff + pendingInvites >= maxSlots) {
          throw new ConflictException(
            msg.staff.staffSlotLimitReached(planName, maxSlots),
          );
        }
      }
    }

    const email = dto.email.toLowerCase().trim();
    if (email === owner.email.toLowerCase()) {
      throw new BadRequestException(msg.staff.inviteSelf);
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existingUser) {
      throw new ConflictException(msg.staff.emailHasAccount);
    }

    // Auto-expire stale pending invites (status=pending nhưng đã quá hạn)
    await this.prisma.staffInvite.updateMany({
      where: { ownerId, email, status: 'pending', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });

    const existingInvite = await this.prisma.staffInvite.findFirst({
      where: { ownerId, email, status: 'pending', expiresAt: { gt: new Date() } },
    });
    if (existingInvite) {
      throw new ConflictException(msg.staff.invitePendingDuplicate);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const shortCode = this.generateShortCode();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.staffInvite.create({
      data: { ownerId, email, token, shortCode, expiresAt, status: 'pending' },
    });

    const baseUrl = this.configService.get<string>('FRONTEND_BASE_URL') || 'https://halong24h.com';
    const inviteLink = `${baseUrl}/staff/accept?token=${token}`;

    let emailSent = true;
    try {
      await this.emailService.sendStaffInvite({
        to: email,
        ownerName: owner.name,
        inviteLink,
        shortCode,
        expiresAt,
      });
    } catch (err) {
      emailSent = false;
      this.logger.error(`Email send failed for invite ${invite.id}: ${(err as Error).message}`);
    }

    return {
      message: msg.staff.inviteCreateSuccess(email),
      data: {
        invite: {
          id: invite.id,
          email: invite.email,
          shortCode: invite.shortCode,
          status: invite.status,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        },
        // Always return link/code so OWNER can share manually if SMTP down
        inviteLink,
        emailSent,
      },
    };
  }

  async listInvites(
    caller: { id: string; role: number },
    ownerIdFilter: string | undefined,
    status: string | undefined,
    msg: Messages,
  ) {
    const where: any = {};
    if (caller.role === ROLE.ADMIN) {
      if (ownerIdFilter) where.ownerId = ownerIdFilter;
    } else {
      where.ownerId = caller.id;
    }
    if (status && status !== 'all') {
      where.status = status;
    }
    const invites = await this.prisma.staffInvite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, shortCode: true, status: true, ownerId: true,
        expiresAt: true, acceptedAt: true, acceptedUserId: true, createdAt: true,
      },
    });
    return { message: msg.staff.inviteListSuccess, data: invites };
  }

  async cancelInvite(caller: { id: string; role: number }, inviteId: string, msg: Messages) {
    const invite = await this.prisma.staffInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException(msg.staff.inviteNotFound);
    if (caller.role !== ROLE.ADMIN && invite.ownerId !== caller.id) {
      throw new ForbiddenException(msg.staff.inviteForbidden);
    }
    if (invite.status !== 'pending') {
      throw new BadRequestException(msg.staff.inviteOnlyPendingCancel);
    }

    await this.prisma.staffInvite.update({
      where: { id: inviteId },
      data: { status: 'cancelled' },
    });
    return { message: msg.staff.inviteCancelSuccess, data: null };
  }

  async verifyInvite(tokenOrCode: string, msg: Messages) {
    const invite = await this.findInviteByTokenOrCode(tokenOrCode);
    if (!invite) throw new NotFoundException(msg.staff.inviteNotFound);
    if (invite.status === 'accepted') throw new GoneException(msg.staff.inviteAlreadyAccepted);
    if (invite.status === 'cancelled') throw new GoneException(msg.staff.inviteCancelled);
    if (invite.expiresAt < new Date()) {
      // Auto-expire stale pending invites
      if (invite.status === 'pending') {
        await this.prisma.staffInvite.update({ where: { id: invite.id }, data: { status: 'expired' } });
      }
      throw new GoneException(msg.staff.inviteExpired);
    }

    const properties = await this.prisma.property.findFirst({
      where: { ownerId: invite.ownerId, isActive: true, deletedAt: null },
      select: { name: true },
      orderBy: { createdAt: 'asc' },
    });

    return {
      message: msg.staff.inviteVerifySuccess,
      data: {
        email: invite.email,
        owner: {
          name: invite.owner.name,
          avatar: invite.owner.avatar,
          homestayName: properties?.name || null,
        },
        expiresAt: invite.expiresAt,
        status: invite.status,
      },
    };
  }

  async acceptInvite(dto: AcceptInviteDto, msg: Messages) {
    const invite = await this.findInviteByTokenOrCode(dto.token);
    if (!invite) throw new NotFoundException(msg.staff.inviteNotFound);
    if (invite.status === 'accepted') throw new GoneException(msg.staff.inviteAlreadyAccepted);
    if (invite.status === 'cancelled') throw new GoneException(msg.staff.inviteCancelled);
    if (invite.expiresAt < new Date()) {
      throw new GoneException(msg.staff.inviteExpired);
    }

    let newUser;

    if (dto.method === 'google') {
      if (!dto.idToken) throw new BadRequestException(msg.auth.googleTokenInvalid);
      const payload = await this.authService.verifyGoogleIdToken(dto.idToken, msg);

      if (payload.email!.toLowerCase() !== invite.email.toLowerCase()) {
        throw new ForbiddenException(msg.staff.emailMismatch);
      }

      const existing = await this.prisma.user.findFirst({
        where: { email: payload.email!.toLowerCase(), deletedAt: null },
      });
      if (existing) throw new ConflictException(msg.staff.emailHasAccount);

      newUser = await this.prisma.user.create({
        data: {
          email: payload.email!.toLowerCase(),
          name: payload.name || invite.email,
          avatar: payload.picture || null,
          googleSub: payload.sub,
          emailVerified: true,
          role: ROLE.SALE,
          ownerId: invite.ownerId,
          isActive: true,
          password: null,
        },
      });
    } else if (dto.method === 'password') {
      if (!dto.password) throw new BadRequestException(msg.staff.passwordTooShort);
      if (!dto.name || !dto.name.trim()) throw new BadRequestException(msg.staff.nameRequired);

      const existing = await this.prisma.user.findFirst({
        where: { email: invite.email, deletedAt: null },
      });
      if (existing) throw new ConflictException(msg.staff.emailHasAccount);

      if (dto.phone) {
        const phoneTaken = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
        if (phoneTaken) throw new ConflictException(msg.users.phoneDuplicate);
      }

      const hashedPassword = await bcrypt.hash(dto.password, 10);
      newUser = await this.prisma.user.create({
        data: {
          email: invite.email,
          name: dto.name.trim(),
          phone: dto.phone || null,
          password: hashedPassword,
          role: ROLE.SALE,
          ownerId: invite.ownerId,
          isActive: true,
          emailVerified: false,
        },
      });
    } else {
      throw new BadRequestException(msg.staff.methodInvalid);
    }

    await this.prisma.staffInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted', acceptedAt: new Date(), acceptedUserId: newUser.id },
    });

    // Default permissions for new SALE: full CRUD on operational modules,
    // read-only on properties. OWNER can adjust later via PUT /permissions/:userId.
    await this.prisma.userPermission.createMany({
      data: [
        { userId: newUser.id, module: PERMISSION_MODULE.PROPERTIES, canCreate: false, canRead: true,  canUpdate: false, canDelete: false },
        { userId: newUser.id, module: PERMISSION_MODULE.BOOKINGS,   canCreate: true,  canRead: true,  canUpdate: true,  canDelete: false },
        { userId: newUser.id, module: PERMISSION_MODULE.CALENDAR,   canCreate: true,  canRead: true,  canUpdate: true,  canDelete: true  },
        { userId: newUser.id, module: PERMISSION_MODULE.REVIEWS,    canCreate: false, canRead: true,  canUpdate: true,  canDelete: false },
      ],
      skipDuplicates: true,
    });

    // Notify OWNER: nhân viên đã accept invite
    await this.notifications.notifyUser(
      invite.ownerId,
      msg.staff.notifyInviteAcceptedTitle,
      msg.staff.notifyInviteAcceptedBody(newUser.name, newUser.email),
      NOTIFICATION_TYPE.SYSTEM,
      newUser.id,
      'staff',
      { pushType: 'staff_invite_accepted', deepLink: '/staff/manage' },
    );

    const tokens = await this.authService.issueTokensFor({
      id: newUser.id, email: newUser.email, role: newUser.role,
    });

    return {
      message: msg.staff.inviteAcceptSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  async listStaff(
    caller: { id: string; role: number },
    ownerIdFilter: string | undefined,
    isActiveFilter: string | undefined,
    msg: Messages,
  ) {
    const where: any = { role: ROLE.SALE, deletedAt: null };
    if (caller.role === ROLE.ADMIN) {
      if (ownerIdFilter) where.ownerId = ownerIdFilter;
    } else {
      where.ownerId = caller.id;
    }
    if (isActiveFilter === 'true') where.isActive = true;
    else if (isActiveFilter === 'false') where.isActive = false;

    const staff = await this.prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, avatar: true,
        role: true, isActive: true, ownerId: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { message: msg.staff.listSuccess, data: staff };
  }

  async removeStaff(caller: { id: string; role: number }, staffId: string, msg: Messages) {
    if (caller.id === staffId) throw new BadRequestException(msg.staff.cannotRemoveSelf);

    const where: any = { id: staffId, role: ROLE.SALE, deletedAt: null };
    if (caller.role !== ROLE.ADMIN) where.ownerId = caller.id;
    const staff = await this.prisma.user.findFirst({ where });
    if (!staff) throw new NotFoundException(msg.staff.notFound);

    await this.prisma.user.update({
      where: { id: staffId },
      data: { isActive: false, refreshToken: null },
    });

    // Notify SALE: bị xoá khỏi team → FE detect và logout
    await this.notifications.notifyUser(
      staffId,
      'Bạn đã bị gỡ khỏi đội',
      'Tài khoản nhân viên của bạn đã bị huỷ bởi chủ homestay. Vui lòng đăng nhập lại nếu cần.',
      NOTIFICATION_TYPE.SYSTEM,
      staffId,
      'staff',
      { pushType: 'staff_removed', deepLink: '/login' },
    );

    return { message: msg.staff.removeSuccess, data: null };
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private generateShortCode(): string {
    let code = '';
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
      const idx = crypto.randomInt(0, SHORT_CODE_ALPHABET.length);
      code += SHORT_CODE_ALPHABET[idx];
    }
    return `HL-${code}`;
  }

  private async findInviteByTokenOrCode(input: string) {
    const trimmed = input.trim();
    // Long token = 64 hex chars; short code = "HL-XXXXXX" (9 chars)
    const where = trimmed.length >= 32 ? { token: trimmed } : { shortCode: trimmed.toUpperCase() };
    return this.prisma.staffInvite.findUnique({
      where: where as any,
      include: { owner: { select: { name: true, avatar: true } } },
    });
  }
}
