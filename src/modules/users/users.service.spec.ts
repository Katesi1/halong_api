import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { en } from '../../i18n';
import { ROLE } from '../../common/constants';

const msg = en;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-1',
    name: 'Test',
    phone: '0900000001',
    email: null,
    password: '$2a$10$hashedpassword',
    role: ROLE.SALE,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAll', () => {
    it('should return user list without password', async () => {
      const users = [{ id: 'u1', name: 'A', phone: '09001', email: null, role: ROLE.SALE, isActive: true, createdAt: new Date() }];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(users);

      const result = await service.findAll(msg);

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).password).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should throw ConflictException on duplicate phone', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.create({ name: 'New', phone: '0900000001', password: 'Test@123', role: ROLE.SALE }, msg),
      ).rejects.toThrow(ConflictException);
    });

    it('should hash password on create', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockImplementation(({ data }) => {
        expect(data.password).not.toBe('Test@123');
        expect(data.password).toMatch(/^\$2[aby]\$/);
        return Promise.resolve({ id: 'new-id', ...data });
      });

      await service.create({ name: 'New', phone: '0900000002', password: 'Test@123', role: ROLE.SALE }, msg);

      expect(prisma.user.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('bad-id', { name: 'X' }, { id: 'admin-1', role: ROLE.ADMIN }, msg),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update user fields correctly (admin)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, name: 'Updated' });

      const result = await service.update('user-1', { name: 'Updated' }, { id: 'admin-1', role: ROLE.ADMIN }, msg);

      expect(result.data.name).toBe('Updated');
    });

    it('should throw ForbiddenException when non-admin edits another user', async () => {
      await expect(
        service.update('other-user', { name: 'X' }, { id: 'user-1', role: ROLE.CUSTOMER }, msg),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should strip privileged fields for non-admin self-edit', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, name: 'NewName' });

      await service.update('user-1', { name: 'NewName', role: ROLE.ADMIN, isActive: false }, { id: 'user-1', role: ROLE.SALE }, msg);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ role: ROLE.ADMIN, isActive: false }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should throw BadRequestException when deleting self', async () => {
      await expect(
        service.remove('user-1', 'user-1', msg),
      ).rejects.toThrow(BadRequestException);
    });

    it('should soft delete (set deletedAt)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, deletedAt: new Date() });

      await service.remove('user-1', 'admin-id', msg);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
