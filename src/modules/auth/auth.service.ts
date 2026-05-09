import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
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

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, msg: Messages) {
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

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        password: hashedPassword,
        role: dto.role,
        phone: dto.phone || null,
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
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
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

  async googleAuth(dto: GoogleAuthDto, msg: Messages) {
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

      user = await this.prisma.user.create({
        data: {
          name,
          email,
          password: null,
          role: dto.role,
          googleSub,
          emailVerified: true,
          avatar: picture,
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
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.refreshToken || !user.isActive) {
        throw new ForbiddenException(msg.auth.invalidRefreshToken);
      }

      const isRefreshTokenValid = await bcrypt.compare(
        refreshToken,
        user.refreshToken,
      );
      if (!isRefreshTokenValid) {
        throw new ForbiddenException(msg.auth.invalidRefreshToken);
      }

      const tokens = await this.generateTokens(user.id, user.email, user.role);
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        message: msg.auth.refreshSuccess,
        data: tokens,
      };
    } catch {
      throw new ForbiddenException(msg.auth.expiredRefreshToken);
    }
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
