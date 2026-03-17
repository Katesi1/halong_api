import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { HomestaysService } from './homestays.service';
import { PrismaService } from '../../prisma/prisma.service';
import { en } from '../../i18n';

const msg = en;

describe('HomestaysService', () => {
  let service: HomestaysService;
  let prisma: PrismaService;

  const mockHomestay = {
    id: 'hs-1',
    ownerId: 'owner-1',
    name: 'Homestay A',
    address: '123 Beach',
    latitude: null,
    longitude: null,
    mapLink: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomestaysService,
        {
          provide: PrismaService,
          useValue: {
            homestay: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<HomestaysService>(HomestaysService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAll', () => {
    it('should filter by ownerId when user is OWNER', async () => {
      (prisma.homestay.findMany as jest.Mock).mockResolvedValue([mockHomestay]);

      await service.findAll({ id: 'owner-1', role: 'OWNER' as any }, msg);

      expect(prisma.homestay.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'owner-1', isActive: true },
        }),
      );
    });

    it('should return all active homestays for ADMIN', async () => {
      (prisma.homestay.findMany as jest.Mock).mockResolvedValue([mockHomestay]);

      await service.findAll({ id: 'admin-1', role: 'ADMIN' as any }, msg);

      expect(prisma.homestay.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });
  });

  describe('create', () => {
    it('should throw NotFoundException when ownerId does not exist (ADMIN)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(
          { name: 'New', address: 'Addr', ownerId: 'bad-owner' },
          { id: 'admin-1', role: 'ADMIN' as any },
          msg,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should throw ForbiddenException when OWNER updates another owner homestay', async () => {
      (prisma.homestay.findUnique as jest.Mock).mockResolvedValue(mockHomestay);

      await expect(
        service.update('hs-1', { name: 'X' }, { id: 'other-owner', role: 'OWNER' as any }, msg),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should soft delete homestay', async () => {
      (prisma.homestay.findUnique as jest.Mock).mockResolvedValue(mockHomestay);
      (prisma.homestay.update as jest.Mock).mockResolvedValue({ ...mockHomestay, isActive: false });

      await service.remove('hs-1', { id: 'owner-1', role: 'OWNER' as any }, msg);

      expect(prisma.homestay.update).toHaveBeenCalledWith({
        where: { id: 'hs-1' },
        data: { isActive: false },
      });
    });

    it('should return 404 for already soft-deleted homestay', async () => {
      (prisma.homestay.findUnique as jest.Mock).mockResolvedValue({ ...mockHomestay, isActive: false });

      await expect(
        service.remove('hs-1', { id: 'owner-1', role: 'OWNER' as any }, msg),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
