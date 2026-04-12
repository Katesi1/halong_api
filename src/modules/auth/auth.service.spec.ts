import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { en } from '../../i18n';
import * as bcrypt from 'bcryptjs';

const msg = en;

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const hashedPassword = bcrypt.hashSync('Test@123', 10);

  const mockUser = {
    id: 'user-1',
    name: 'Test User',
    phone: '0900000001',
    email: 'test@example.com',
    password: hashedPassword,
    role: 'STAFF' as const,
    isActive: true,
    refreshToken: bcrypt.hashSync('valid-refresh-token', 10),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.login({ email: 'test@example.com', password: 'Test@123' }, msg);

      expect(result.data.accessToken).toBeDefined();
      expect(result.data.refreshToken).toBeDefined();
      expect(result.data.user.id).toBe('user-1');
      expect(result.data.user.email).toBe('test@example.com');
      expect((result.data.user as any).password).toBeUndefined();
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong-pass' }, msg),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.login({ email: 'notfound@example.com', password: 'Test@123' }, msg),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });

      await expect(
        service.login({ email: 'test@example.com', password: 'Test@123' }, msg),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should return new tokens on valid refresh token', async () => {
      (jwtService.verify as jest.Mock).mockReturnValue({ sub: 'user-1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        refreshToken: bcrypt.hashSync('valid-refresh-token', 10),
      });
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.refreshToken('valid-refresh-token', msg);

      expect(result.data.accessToken).toBeDefined();
      expect(result.data.refreshToken).toBeDefined();
    });

    it('should throw ForbiddenException on expired/invalid token', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.refreshToken('expired-token', msg),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('logout', () => {
    it('should clear refresh token', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.logout('user-1', msg);

      expect(result.data).toBeNull();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { refreshToken: null },
      });
    });
  });

  describe('getProfile', () => {
    it('should return user without password', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'Test',
        phone: '0900000001',
        email: 'test@example.com',
        role: 'STAFF',
        createdAt: new Date(),
      });

      const result = await service.getProfile('user-1', msg);

      expect(result.data!.id).toBe('user-1');
      expect((result.data as any).password).toBeUndefined();
      expect((result.data as any).refreshToken).toBeUndefined();
    });
  });
});
