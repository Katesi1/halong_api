import {
  Injectable,
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
import { ROLE } from '../../common/constants';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import * as appleSignin from 'apple-signin-auth';
import { AppleAuthDto } from './dto/apple-auth.dto';

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(
    dto: RegisterDto,
    msg: Messages,
    meta: { deviceId?: string | null; ip?: string | null } = {},
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

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        password: hashedPassword,
        role: dto.role,
        phone: dto.phone || null,
        registerDeviceId: meta.deviceId || null,
        registerIp: meta.ip || null,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: msg.auth.registerSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.serializeAuthUser(user),
      },
    };
  }

  async login(dto: LoginDto, msg: Messages) {
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

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: msg.auth.loginSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.serializeAuthUser(user),
      },
    };
  }

  async googleAuth(
    dto: GoogleAuthDto,
    msg: Messages,
    meta: { deviceId?: string | null; ip?: string | null } = {},
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
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: msg.auth.loginSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.serializeAuthUser(user),
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
    meta: { deviceId?: string | null; ip?: string | null } = {},
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
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: msg.auth.loginSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.serializeAuthUser(user),
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: dto.identifier },
          { email: dto.identifier },
        ],
      },
    });

    if (!user) {
      return { message: msg.auth.forgotPasswordSuccess, data: null };
    }

    return { message: msg.auth.forgotPasswordSuccess, data: null };
  }

  async resetPassword(dto: ResetPasswordDto, msg: Messages) {
    try {
      const payload = this.jwtService.verify(dto.token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
      await this.prisma.user.update({
        where: { id: payload.sub },
        data: { password: hashedPassword },
      });

      return { message: msg.auth.resetPasswordSuccess, data: null };
    } catch {
      throw new BadRequestException(msg.auth.resetTokenInvalid);
    }
  }

  async refreshToken(refreshToken: string, msg: Messages) {
    // Verify chữ ký + hạn JWT. Chỉ block try/catch quanh verify để không nuốt
    // các ForbiddenException ném ở dưới (vd: user bị xoá, token DB không khớp).
    let payload: { sub: string };
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

    // Reject nếu: user không tồn tại / đã soft-delete / bị disable / đã logout (refreshToken=null)
    if (!user || user.deletedAt || !user.isActive || !user.refreshToken) {
      throw new ForbiddenException(msg.auth.invalidRefreshToken);
    }

    // Compare với hash trong DB để chống dùng lại token cũ đã rotate
    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isRefreshTokenValid) {
      throw new ForbiddenException(msg.auth.invalidRefreshToken);
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: msg.auth.refreshSuccess,
      data: tokens,
    };
  }

  async logout(userId: string, msg: Messages) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: msg.auth.logoutSuccess, data: null };
  }

  async getProfile(userId: string, msg: Messages) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, phone: true, email: true, avatar: true,
        role: true, ownerId: true, isActive: true, gender: true, dateOfBirth: true,
        emailVerified: true, createdAt: true, updatedAt: true,
        kycBypass: true, kycStatus: true, subscriptionStatus: true, subscriptionPlanId: true,
        subscriptionCycle: true, trialEndsAt: true, nextChargeAt: true,
        permissions: {
          select: { module: true, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
        },
      },
    });
    return { message: msg.auth.profileSuccess, data: user };
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
   * Shape user object dùng chung cho mọi auth response (login/register/google/profile).
   */
  private serializeAuthUser(user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar ?? null,
      phone: user.phone ?? null,
      role: user.role,
      ownerId: user.ownerId ?? null,
      isActive: user.isActive,
      emailVerified: user.emailVerified ?? false,
      kycStatus: user.kycStatus ?? null,
      subscriptionStatus: user.subscriptionStatus ?? null,
      trialEndsAt: user.trialEndsAt ?? null,
      createdAt: user.createdAt ?? null,
      updatedAt: user.updatedAt ?? null,
    };
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
   * Persist hashed refresh token vào DB.
   */
  async issueTokensFor(user: { id: string; email: string; role: number }) {
    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  private async generateTokens(userId: string, email: string, role: number) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: 900,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: 604800,
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashedRefreshToken },
    });
  }
}
