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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, msg: Messages) {
    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existingPhone) {
      throw new ConflictException(msg.auth.phoneDuplicate);
    }

    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException(msg.auth.emailDuplicate);
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        password: hashedPassword,
        role: dto.role,
        email: dto.email || null,
      },
    });

    const tokens = await this.generateTokens(user.id, user.phone, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: msg.auth.registerSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      },
    };
  }

  async login(dto: LoginDto, msg: Messages) {
    const identifier = dto.phone.trim();
    const isEmail = identifier.includes('@');

    const user = isEmail
      ? await this.prisma.user.findUnique({ where: { email: identifier } })
      : await this.prisma.user.findUnique({ where: { phone: identifier } });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException(msg.auth.invalidCredentials);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(msg.auth.invalidCredentials);
    }

    const tokens = await this.generateTokens(user.id, user.phone, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: msg.auth.loginSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      },
    };
  }

  async googleAuth(dto: GoogleAuthDto, msg: Messages) {
    let googlePayload: { email: string; name: string; sub: string };
    try {
      const decoded = this.jwtService.decode(dto.idToken) as any;
      if (!decoded || !decoded.email) {
        throw new Error('Invalid token');
      }
      googlePayload = { email: decoded.email, name: decoded.name || decoded.email, sub: decoded.sub };
    } catch {
      throw new BadRequestException(msg.auth.googleTokenInvalid);
    }

    let user = await this.prisma.user.findUnique({
      where: { email: googlePayload.email },
    });

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException(msg.auth.accountDisabled);
      }
    } else {
      if (dto.role === undefined || dto.role === null) {
        throw new BadRequestException(msg.auth.googleRoleRequired);
      }

      const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
      user = await this.prisma.user.create({
        data: {
          name: googlePayload.name,
          phone: `google_${googlePayload.sub}`,
          email: googlePayload.email,
          password: randomPassword,
          role: dto.role,
        },
      });
    }

    const tokens = await this.generateTokens(user.id, user.phone, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      message: msg.auth.loginSuccess,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
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

      const tokens = await this.generateTokens(user.id, user.phone, user.role);
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
        id: true, name: true, phone: true, email: true,
        role: true, isActive: true, gender: true, dateOfBirth: true, createdAt: true,
      },
    });
    return { message: msg.auth.profileSuccess, data: user };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, msg: Messages) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException(msg.auth.accountDisabled);

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

  private async generateTokens(userId: string, phone: string, role: number) {
    const payload = { sub: userId, phone, role };

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
