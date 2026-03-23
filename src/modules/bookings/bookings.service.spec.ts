import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { en } from '../../i18n';

const msg = en;

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: PrismaService;
  let redis: RedisService;

  const mockBooking = {
    id: 'booking-1',
    roomId: 'room-1',
    saleId: 'staff-1',
    customerId: null,
    checkinDate: new Date('2026-05-01'),
    checkoutDate: new Date('2026-05-03'),
    status: 'HOLD' as const,
    holdExpireAt: new Date(Date.now() + 1800000),
    customerName: 'Guest',
    customerPhone: '0911111111',
    depositAmount: null,
    guestCount: 2,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: PrismaService,
          useValue: {
            booking: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            room: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            getHold: jest.fn().mockResolvedValue(null),
            setHold: jest.fn().mockResolvedValue(undefined),
            delHold: jest.fn().mockResolvedValue(undefined),
            getHoldTtl: jest.fn().mockResolvedValue(1800),
          },
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<RedisService>(RedisService);
  });

  describe('holdRoom', () => {
    it('should throw BadRequestException when checkin >= checkout', async () => {
      await expect(
        service.holdRoom(
          { roomId: 'room-1', checkinDate: '2026-05-05', checkoutDate: '2026-05-01', customerName: 'X', customerPhone: '0911' },
          { id: 'staff-1', role: 'STAFF' as any },
          msg,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when checkin in past', async () => {
      await expect(
        service.holdRoom(
          { roomId: 'room-1', checkinDate: '2020-01-01', checkoutDate: '2020-01-03', customerName: 'X', customerPhone: '0911' },
          { id: 'staff-1', role: 'STAFF' as any },
          msg,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when room has confirmed booking in range', async () => {
      (prisma.room.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1', isActive: true });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ id: 'conflict-1' });
      (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.holdRoom(
          { roomId: 'room-1', checkinDate: '2026-08-01', checkoutDate: '2026-08-03', customerName: 'X', customerPhone: '0911' },
          { id: 'staff-1', role: 'STAFF' as any },
          msg,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create HOLD booking and set Redis on success', async () => {
      (prisma.room.findUnique as jest.Mock).mockResolvedValue({ id: 'room-1', isActive: true });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.booking.create as jest.Mock).mockResolvedValue({
        ...mockBooking,
        room: { id: 'room-1', name: 'R1', code: 'C1' },
        sale: { id: 'staff-1', name: 'S1' },
      });

      const result = await service.holdRoom(
        { roomId: 'room-1', checkinDate: '2026-08-01', checkoutDate: '2026-08-03', customerName: 'Guest', customerPhone: '0911111111' },
        { id: 'staff-1', role: 'STAFF' as any },
        msg,
      );

      expect(result.data.holdRemainingSeconds).toBe(1800);
      expect(redis.setHold).toHaveBeenCalled();
    });
  });

  describe('confirmBooking', () => {
    it('should throw BadRequestException when status is not HOLD', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });

      await expect(
        service.confirmBooking('booking-1', { id: 'admin-1', role: 'ADMIN' as any }, msg),
      ).rejects.toThrow(BadRequestException);
    });

    it('should confirm and clear Redis hold', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
      (prisma.booking.update as jest.Mock).mockResolvedValue({ ...mockBooking, status: 'CONFIRMED' });

      await service.confirmBooking('booking-1', { id: 'admin-1', role: 'ADMIN' as any }, msg);

      expect(redis.delHold).toHaveBeenCalledWith('room-1');
    });
  });

  describe('cancelBooking', () => {
    it('should throw BadRequestException when already cancelled', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ ...mockBooking, status: 'CANCELLED' });

      await expect(
        service.cancelBooking('booking-1', { id: 'admin-1', role: 'ADMIN' as any }, msg),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when STAFF cancels another staff booking', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ ...mockBooking, saleId: 'other-staff' });

      await expect(
        service.cancelBooking('booking-1', { id: 'staff-1', role: 'STAFF' as any }, msg),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('expireHoldBookings', () => {
    it('should cancel expired HOLD bookings and clear Redis', async () => {
      const expired = [
        { id: 'b1', roomId: 'r1' },
        { id: 'b2', roomId: 'r2' },
      ];
      (prisma.booking.findMany as jest.Mock).mockResolvedValue(expired);
      (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const count = await service.expireHoldBookings();

      expect(count).toBe(2);
      expect(redis.delHold).toHaveBeenCalledTimes(2);
    });
  });
});
