import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Messages } from '../../i18n';
import { ROLE, SUBSCRIPTION_STATUS, OWNER_SIGNUP_TRIAL_DAYS } from '../../common/constants';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import * as appleSignin from 'apple-signin-auth';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';

const RESET_TOKEN_TTL_MINUTES = 10;

/**
 * Phân biệt phiên login: 1 slot mobile (app Android/iOS) + 1 slot web song song.
 * FE gửi qua header `X-Client-Type: mobile|web` khi login/register/google/apple/staff-accept.
 * Không gửi → default 'web' (an toàn cho browser cũ chưa cập nhật).
 */
export type ClientType = 'mobile' | 'web';

export function normalizeClientType(raw: string | undefined | null): ClientType {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'mobile' || v === 'ios' || v === 'android' || v === 'app') return 'mobile';
  return 'web';
}

/**
 * Apple IAP compliance: app iOS không có UI thanh toán → OWNER mới đăng ký
 * được cấp trial ngầm N ngày (mặc định 60). Hết hạn → entitlement gate ở
 * properties/staff sẽ tự khóa với message "Tài khoản chưa có quyền dùng
 * tính năng này". CUSTOMER không bị ảnh hưởng.
 */
function buildOwnerSignupTrial(role: number) {
  if (role !== ROLE.OWNER) return {};
  const now = Date.now();
  return {
    subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
    trialEndsAt: new Date(now + OWNER_SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000),
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private usersService: UsersService,
  ) {}

  async register(
    dto: RegisterDto,
    msg: Messages,
    meta: { deviceId?: string | null; ip?: string | null; clientType?: ClientType } = {},
  ) {
    const email = dto.email.toLowerCase().trim();

    const existingEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) {
      throw new ConflictException(msg.auth.emailDuplicate);
    }

    if (dto.phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (existingPhone) {
        throw new ConflictException(msg.auth.phoneDuplicate);
      }
    }

    await this.assertRegisterAllowed(meta.deviceId ?? null, meta.ip ?? null, msg);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const trial = buildOwnerSignupTrial(dto.role);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        password: hashedPassword,
        role: dto.role,
        phone: dto.phone || null,
        registerDeviceId: meta.deviceId || null,
        registerIp: meta.ip || null,
        ...trial,
      },
    });

    const clientType = meta.clientType ?? 'web';
    const tokens = await this.generateTokens(user.id, user.email, user.role, clientType);
    await this.updateRefreshToken(user.id, clientType, tokens.refreshToken);

    return {
      message: msg.auth.registerSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  async login(dto: LoginDto, msg: Messages, meta: { clientType?: ClientType } = {}) {
    // Ưu tiên identifier (chuẩn mới), fallback email/phone (backward-compat FE cũ)
    const raw = (dto.identifier || dto.email || dto.phone || '').trim();
    if (!raw) {
      throw new UnauthorizedException(msg.auth.invalidCredentials);
    }

    // Detect identifier: email vs phone
    // Phone VN: 0xxxxxxxxx hoặc +84xxxxxxxxx → chuẩn hoá về 0xxxxxxxxx (cách lưu DB)
    const phoneRegex = /^(0\d{9}|\+84\d{9})$/;
    const isPhone = phoneRegex.test(raw);
    const normalizedPhone = isPhone
      ? raw.startsWith('+84')
        ? '0' + raw.slice(3)
        : raw
      : null;
    const normalizedEmail = !isPhone ? raw.toLowerCase() : null;

    const user = await this.prisma.user.findFirst({
      where: isPhone ? { phone: normalizedPhone! } : { email: normalizedEmail! },
    });

    if (!user || !user.isActive || user.deletedAt || !user.password) {
      throw new UnauthorizedException(msg.auth.invalidCredentials);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(msg.auth.invalidCredentials);
    }

    const clientType = meta.clientType ?? 'web';
    const tokens = await this.generateTokens(user.id, user.email, user.role, clientType);
    await this.updateRefreshToken(user.id, clientType, tokens.refreshToken);
    await this.autoCancelPendingDeletion(user.id);

    return {
      message: msg.auth.loginSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  /** NĐ 13: login lại trong grace 30d → tự huỷ pending deletion + thông báo khôi phục */
  private async autoCancelPendingDeletion(userId: string): Promise<void> {
    try {
      await this.usersService.cancelDeletion(userId, 'user_login');
    } catch (err) {
      this.logger.warn(`autoCancelPendingDeletion failed for user=${userId}: ${(err as Error).message}`);
    }
  }

  async googleAuth(
    dto: GoogleAuthDto,
    msg: Messages,
    meta: { deviceId?: string | null; ip?: string | null; clientType?: ClientType } = {},
  ) {
    const audience = this.configService.get<string>('GOOGLE_OAUTH_WEB_CLIENT_ID');
    if (!audience) {
      throw new UnauthorizedException(msg.auth.googleTokenInvalid);
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException(msg.auth.googleTokenInvalid);
    }

    if (!payload || !payload.email || !payload.sub) {
      throw new UnauthorizedException(msg.auth.googleTokenInvalid);
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException(msg.auth.googleEmailNotVerified);
    }

    const email = payload.email.toLowerCase();
    const googleSub = payload.sub;
    const name = payload.name || email;
    const picture = payload.picture || null;

    let user = await this.prisma.user.findUnique({ where: { googleSub } });
    if (!user) {
      user = await this.prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      if (!user.isActive || user.deletedAt) {
        throw new ForbiddenException(msg.auth.accountInactive);
      }
      const updateData: Record<string, any> = {};
      if (!user.googleSub) updateData.googleSub = googleSub;
      if (!user.emailVerified) updateData.emailVerified = true;
      if (!user.avatar && picture) updateData.avatar = picture;
      if (Object.keys(updateData).length > 0) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: updateData });
      }
    } else {
      // First-time Google login → cần role
      if (dto.role === undefined || dto.role === null) {
        return {
          message: msg.auth.googleNewUserPrompt,
          data: {
            isNewUser: true,
            googleProfile: { email, name, avatar: picture, sub: googleSub },
          },
        };
      }
      if (dto.role === ROLE.ADMIN) {
        throw new ForbiddenException(msg.auth.googleAdminForbidden);
      }
      if (dto.role === ROLE.SALE) {
        throw new ForbiddenException(msg.auth.googleSaleForbidden);
      }
      if (dto.role !== ROLE.OWNER && dto.role !== ROLE.CUSTOMER) {
        throw new BadRequestException(msg.auth.googleRoleInvalid);
      }

      await this.assertRegisterAllowed(meta.deviceId ?? null, meta.ip ?? null, msg);

      const trial = buildOwnerSignupTrial(dto.role);
      user = await this.prisma.user.create({
        data: {
          name,
          email,
          password: null,
          role: dto.role,
          googleSub,
          emailVerified: true,
          avatar: picture,
          registerDeviceId: meta.deviceId || null,
          registerIp: meta.ip || null,
          ...trial,
        },
      });
    }

    const clientType = meta.clientType ?? 'web';
    const tokens = await this.generateTokens(user.id, user.email, user.role, clientType);
    await this.updateRefreshToken(user.id, clientType, tokens.refreshToken);
    await this.autoCancelPendingDeletion(user.id);

    return {
      message: msg.auth.loginSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  /**
   * Apple Sign-In flow (iOS Apple Guideline 4.8).
   * Logic giống googleAuth: 4 case (existing/new+role/new-no-role/error).
   * KHÁC: Apple chỉ trả email + name ở LẦN ĐẦU user authorize → BE phải cache.
   * FE phải lưu email/name từ lần đầu và gửi kèm các lần sau (best-effort).
   */
  async appleAuth(
    dto: AppleAuthDto,
    msg: Messages,
    meta: { deviceId?: string | null; ip?: string | null; clientType?: ClientType } = {},
  ) {
    const audience = this.configService.get<string>('APPLE_CLIENT_ID');
    if (!audience) throw new UnauthorizedException(msg.auth.appleTokenInvalid);

    let payload: appleSignin.AppleIdTokenType;
    try {
      payload = await appleSignin.verifyIdToken(dto.idToken, {
        audience,
        ignoreExpiration: false,
      });
    } catch {
      throw new UnauthorizedException(msg.auth.appleTokenInvalid);
    }

    if (!payload?.sub) {
      throw new UnauthorizedException(msg.auth.appleTokenInvalid);
    }

    const appleSub = payload.sub;
    // Apple email_verified có thể là 'true' (string) hoặc true (boolean) tuỳ payload
    const emailFromToken = payload.email?.toLowerCase() || null;
    // FE gửi kèm email/name từ first-consent — ưu tiên token, fallback DTO
    const email = emailFromToken || dto.email?.toLowerCase() || null;
    const name = dto.name || (email ? email.split('@')[0] : 'Apple User');

    let user = await this.prisma.user.findUnique({ where: { appleSub } });
    if (!user && email) {
      user = await this.prisma.user.findUnique({ where: { email } });
    }

    if (user) {
      if (!user.isActive || user.deletedAt) {
        throw new ForbiddenException(msg.auth.accountInactive);
      }
      const updateData: Record<string, any> = {};
      if (!user.appleSub) updateData.appleSub = appleSub;
      if (!user.emailVerified && payload.email_verified === true) updateData.emailVerified = true;
      if (Object.keys(updateData).length > 0) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: updateData });
      }
    } else {
      // First-time Apple login → cần role
      if (dto.role === undefined || dto.role === null) {
        return {
          message: msg.auth.googleNewUserPrompt,
          data: {
            isNewUser: true,
            appleProfile: { email, name, sub: appleSub },
          },
        };
      }
      // Apple chia sẻ business rule với Google: ADMIN/SALE không tự đăng ký được
      if (dto.role === ROLE.ADMIN) {
        throw new ForbiddenException(msg.auth.googleAdminForbidden);
      }
      if (dto.role === ROLE.SALE) {
        throw new ForbiddenException(msg.auth.googleSaleForbidden);
      }
      if (dto.role !== ROLE.OWNER && dto.role !== ROLE.CUSTOMER) {
        throw new BadRequestException(msg.auth.googleRoleInvalid);
      }
      // Apple yêu cầu email để tạo account; nếu user hide email và không cache → reject
      if (!email) {
        throw new BadRequestException(msg.auth.appleEmailRequired);
      }

      await this.assertRegisterAllowed(meta.deviceId ?? null, meta.ip ?? null, msg);

      const trial = buildOwnerSignupTrial(dto.role);
      user = await this.prisma.user.create({
        data: {
          name,
          email,
          password: null,
          role: dto.role,
          appleSub,
          emailVerified: payload.email_verified === true,
          registerDeviceId: meta.deviceId || null,
          registerIp: meta.ip || null,
          ...trial,
        },
      });
    }

    const clientType = meta.clientType ?? 'mobile'; // Apple mặc định mobile (iOS)
    const tokens = await this.generateTokens(user.id, user.email, user.role, clientType);
    await this.updateRefreshToken(user.id, clientType, tokens.refreshToken);
    await this.autoCancelPendingDeletion(user.id);

    return {
      message: msg.auth.loginSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    };
  }

  /**
   * Reset-token bí mật riêng (không dùng JWT_SECRET của access-token để tránh
   * dùng access-token làm reset-token). Fallback JWT_SECRET chỉ khi env chưa
   * có — dev convenience; prod phải set rõ JWT_RESET_SECRET.
   */
  private getResetSecret(): string {
    const secret =
      this.configService.get<string>('JWT_RESET_SECRET') ||
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_RESET_SECRET / JWT_SECRET chưa được cấu hình');
    }
    return secret;
  }

  async forgotPassword(dto: ForgotPasswordDto, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: dto.identifier },
          { email: dto.identifier },
        ],
      },
      select: { id: true, email: true, phone: true, isActive: true, deletedAt: true },
    });

    // Trả success ngay cả khi user không tồn tại để tránh enumeration.
    if (!user || !user.isActive || user.deletedAt) {
      return { message: msg.auth.forgotPasswordSuccess, data: null };
    }

    // Sinh reset token: TTL 10 phút, có purpose='reset' để verify chặn nhầm token.
    const resetToken = this.jwtService.sign(
      { sub: user.id, purpose: 'reset' },
      { secret: this.getResetSecret(), expiresIn: `${RESET_TOKEN_TTL_MINUTES}m` },
    );

    // Gửi qua email nếu user có email + SMTP configured.
    // KHÔNG bao giờ trả token trong response (tránh leak qua proxy / log access).
    // TODO: tích hợp SMS provider cho user chỉ có phone.
    this.logger.log(`Password reset issued for user=${user.id}`);

    if (user.email && this.emailService.isEnabled()) {
      const base = (this.configService.get<string>('FRONTEND_BASE_URL') || 'https://halong24h.com').replace(/\/+$/, '');
      const resetLink = `${base}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
      try {
        await this.emailService.sendPasswordReset({
          to: user.email,
          resetLink,
          expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
        });
      } catch (err) {
        // Không leak failure ra ngoài — vẫn trả success để chống enumeration.
        this.logger.error(`sendPasswordReset failed for user=${user.id}: ${(err as Error).message}`);
      }
    } else if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`[DEV ONLY] reset token for ${user.id}: ${resetToken}`);
    }

    return { message: msg.auth.forgotPasswordSuccess, data: null };
  }

  async resetPassword(dto: ResetPasswordDto, msg: Messages) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = this.jwtService.verify(dto.token, { secret: this.getResetSecret() });
    } catch {
      throw new BadRequestException(msg.auth.resetTokenInvalid);
    }

    // Bắt buộc purpose='reset' — chặn dùng access-token làm reset-token.
    if (payload.purpose !== 'reset' || !payload.sub) {
      throw new BadRequestException(msg.auth.resetTokenInvalid);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new BadRequestException(msg.auth.resetTokenInvalid);
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      // Reset password → logout mọi phiên (cả mobile lẫn web).
      data: { password: hashedPassword, refreshToken: null, refreshTokenMobile: null, refreshTokenWeb: null },
    });

    return { message: msg.auth.resetPasswordSuccess, data: null };
  }

  async refreshToken(refreshToken: string, msg: Messages) {
    // Verify chữ ký + hạn JWT. Chỉ block try/catch quanh verify để không nuốt
    // các ForbiddenException ném ở dưới (vd: user bị xoá, token DB không khớp).
    let payload: { sub: string; clientType?: ClientType };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      // JWT malformed / sai chữ ký / quá hạn
      throw new ForbiddenException(msg.auth.expiredRefreshToken);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt || !user.isActive) {
      throw new ForbiddenException(msg.auth.invalidRefreshToken);
    }

    // Nhận diện phiên. Token cũ (trước v1.19) không có clientType → mặc định 'web'
    // và fallback so với cột legacy `refreshToken` để không đá tất cả user đang login.
    const clientType: ClientType = payload.clientType === 'mobile' ? 'mobile' : 'web';
    const storedHash =
      clientType === 'mobile' ? user.refreshTokenMobile : user.refreshTokenWeb;

    let matched = false;
    if (storedHash) {
      matched = await bcrypt.compare(refreshToken, storedHash);
    }
    // Fallback tương thích ngược 1 lần: token phát trước v1.19 nằm ở cột `refreshToken`.
    if (!matched && !payload.clientType && user.refreshToken) {
      matched = await bcrypt.compare(refreshToken, user.refreshToken);
    }
    if (!matched) {
      throw new ForbiddenException(msg.auth.invalidRefreshToken);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, clientType);
    await this.updateRefreshToken(user.id, clientType, tokens.refreshToken);

    return {
      message: msg.auth.refreshSuccess,
      data: tokens,
    };
  }

  async logout(userId: string, clientType: ClientType, msg: Messages) {
    // Chỉ clear cột của client hiện tại — session còn lại (mobile hoặc web) không bị đá.
    await this.prisma.user.update({
      where: { id: userId },
      data:
        clientType === 'mobile'
          ? { refreshTokenMobile: null }
          : { refreshTokenWeb: null },
    });
    return { message: msg.auth.logoutSuccess, data: null };
  }

  /**
   * Update user's own profile. Whitelist: fullName (→ name), email, phone.
   * Phone uniqueness checked; email duplicate caught via Prisma unique constraint below.
   */
  async updateProfile(
    userId: string,
    dto: { fullName?: string; email?: string; phone?: string },
    msg: Messages,
  ) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new UnauthorizedException(msg.auth.accountDisabled);

    if (dto.phone && dto.phone !== user.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing && existing.id !== userId) {
        throw new ConflictException(msg.users.phoneDuplicate);
      }
    }
    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException(msg.auth.emailDuplicate);
      }
    }

    const data: { name?: string; email?: string; phone?: string } = {};
    if (dto.fullName !== undefined) data.name = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId, msg);
  }

  async getProfile(userId: string, msg: Messages) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, phone: true, email: true, avatar: true,
        role: true, ownerId: true, scope: true, isActive: true, gender: true, dateOfBirth: true,
        emailVerified: true, createdAt: true, updatedAt: true,
        kycBypass: true, kycStatus: true, subscriptionStatus: true, subscriptionPlanId: true,
        subscriptionCycle: true, subscriptionProvider: true, subscriptionPriceOverride: true,
        subscriptionFrozenAt: true, subscriptionFrozenReason: true,
        trialEndsAt: true, nextChargeAt: true,
        currentPeriodStart: true, currentPeriodEnd: true,
        pendingPlanId: true, pendingCycle: true, pendingEffectiveAt: true,
        deletionScheduledAt: true,
        permissions: {
          select: { module: true, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
        },
      },
    });
    const isKycVerified = !!user && (user.kycBypass === true || user.kycStatus === 'approved');
    return {
      message: msg.auth.profileSuccess,
      data: user ? { ...user, isKycVerified } : user,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, msg: Messages) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException(msg.auth.accountDisabled);
    if (!user.password) {
      throw new BadRequestException(msg.auth.currentPasswordIncorrect);
    }

    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException(msg.auth.currentPasswordIncorrect);
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { message: msg.auth.changePasswordSuccess, data: null };
  }

  /**
   * Anti-spam check: trong 24h vừa qua, 1 deviceId chỉ được tạo tối đa 3 account
   * và 1 IP tối đa 10 account (cho phép share network gia đình/văn phòng).
   * Throw 429 nếu vượt threshold.
   */
  private async assertRegisterAllowed(
    deviceId: string | null,
    ip: string | null,
    msg: Messages,
  ): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const limits: Array<Promise<number>> = [];

    if (deviceId) {
      limits.push(
        this.prisma.user.count({
          where: { registerDeviceId: deviceId, createdAt: { gt: since } },
        }).then((n) => (n >= 3 ? -1 : n)),
      );
    }
    if (ip) {
      limits.push(
        this.prisma.user.count({
          where: { registerIp: ip, createdAt: { gt: since } },
        }).then((n) => (n >= 10 ? -2 : n)),
      );
    }

    const results = await Promise.all(limits);
    if (results.some((r) => r === -1 || r === -2)) {
      throw new HttpException(msg.auth.tooManyRegisters, HttpStatus.TOO_MANY_REQUESTS);
    }
  }


  /**
   * Verify Google idToken (audience = GOOGLE_OAUTH_WEB_CLIENT_ID).
   * Throws UnauthorizedException nếu invalid / email chưa verified.
   * Public để các module khác (staff invite accept) dùng lại.
   */
  async verifyGoogleIdToken(idToken: string, msg: Messages): Promise<TokenPayload> {
    const audience = this.configService.get<string>('GOOGLE_OAUTH_WEB_CLIENT_ID');
    if (!audience) throw new UnauthorizedException(msg.auth.googleTokenInvalid);

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException(msg.auth.googleTokenInvalid);
    }

    if (!payload || !payload.email || !payload.sub) {
      throw new UnauthorizedException(msg.auth.googleTokenInvalid);
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException(msg.auth.googleEmailNotVerified);
    }
    return payload;
  }

  /**
   * Issue access + refresh tokens cho user vừa được tạo / login.
   * Persist hashed refresh token vào cột tương ứng với `clientType`.
   */
  async issueTokensFor(
    user: { id: string; email: string; role: number },
    clientType: ClientType = 'web',
  ) {
    const tokens = await this.generateTokens(user.id, user.email, user.role, clientType);
    await this.updateRefreshToken(user.id, clientType, tokens.refreshToken);
    return tokens;
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: number,
    clientType: ClientType,
  ) {
    const payload = { sub: userId, email, role, clientType };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: 900,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: 1209600,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(
    userId: string,
    clientType: ClientType,
    refreshToken: string,
  ) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    // Ghi vào đúng cột theo clientType. Không đụng cột kia → giữ session còn lại.
    // Đồng thời null cột legacy `refreshToken` để không bị fallback lộn ngược trong tương lai.
    await this.prisma.user.update({
      where: { id: userId },
      data:
        clientType === 'mobile'
          ? { refreshTokenMobile: hashedRefreshToken, refreshToken: null }
          : { refreshTokenWeb: hashedRefreshToken, refreshToken: null },
    });
  }
}
