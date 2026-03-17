import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PartnerService } from './partner.service';
import { PrismaService } from '../../prisma/prisma.service';
import { en } from '../../i18n';

const msg = en;

describe('PartnerService', () => {
  let service: PartnerService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnerService,
        {
          provide: PrismaService,
          useValue: {
            room: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            booking: {
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PartnerService>(PartnerService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getRooms', () => {
    it('should return paginated results', async () => {
      (prisma.room.findMany as jest.Mock).mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      (prisma.room.count as jest.Mock).mockResolvedValue(10);

      const result = await service.getRooms({ page: 1, limit: 2 }, msg);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(10);
      expect(result.meta.totalPages).toBe(5);
    });
  });

  describe('createBooking', () => {
    it('should throw BadRequestException when room already booked', async () => {
      (prisma.room.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'admin-1' });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ id: 'conflict-1' });

      await expect(
        service.createBooking(
          { roomId: 'room-1', checkinDate: '2026-06-01', checkoutDate: '2026-06-03', customerName: 'A', customerPhone: '09' },
          msg,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when checkout <= checkin', async () => {
      (prisma.room.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1' });

      await expect(
        service.createBooking(
          { roomId: 'room-1', checkinDate: '2026-06-05', checkoutDate: '2026-06-01', customerName: 'A', customerPhone: '09' },
          msg,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelBooking', () => {
    it('should throw BadRequestException when already cancelled', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', status: 'CANCELLED' });

      await expect(
        service.cancelBooking('b1', msg),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when booking not found', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.cancelBooking('bad-id', msg),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
