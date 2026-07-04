import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../email/email.service';
import { en } from '../../i18n';
import { BOOKING_STATUS, ROLE } from '../../common/constants';

const msg = en;

describe('BookingsService', () => {
  let service: BookingsService;
  let prisma: PrismaService;
  let redis: RedisService;
  let email: EmailService;

  const mockBooking = {
    id: 'booking-1',
    propertyId: 'property-1',
    saleId: 'staff-1',
    customerId: null,
    checkinDate: new Date('2026-05-01'),
    checkoutDate: new Date('2026-05-03'),
    status: BOOKING_STATUS.HOLD,
    holdExpireAt: new Date(Date.now() + 1800000),
    customerName: 'Guest',
    customerPhone: '0911111111',
    depositAmount: null,
    guestCount: 2,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    property: { ownerId: 'owner-1' },
  };

  beforeEach(async () => {
    const prismaMock: any = {
      booking: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      property: {
        findUnique: jest.fn(),
      },
      calendarLock: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    // Interactive transaction: chạy callback với tx = chính prismaMock, nên tx.booking.* tái dùng mock ở trên.
    prismaMock.$transaction = jest.fn().mockImplementation((cb: any) => cb(prismaMock));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
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
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue(undefined),
            notifyPropertyOwner: jest.fn().mockResolvedValue(undefined),
            notifyAdmins: jest.fn().mockResolvedValue(undefined),
            notifyUser: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendBookingCancelled: jest.fn().mockResolvedValue(undefined),
            sendBookingConfirmed: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<RedisService>(RedisService);
    email = module.get<EmailService>(EmailService);
  });

  describe('holdProperty', () => {
    it('should throw BadRequestException when checkin >= checkout', async () => {
      await expect(
        service.holdProperty(
          { propertyId: 'property-1', checkinDate: '2026-05-05', checkoutDate: '2026-05-01', customerName: 'X', customerPhone: '0911' },
          { id: 'staff-1', role: ROLE.SALE },
          msg,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when checkin in past', async () => {
      await expect(
        service.holdProperty(
          { propertyId: 'property-1', checkinDate: '2020-01-01', checkoutDate: '2020-01-03', customerName: 'X', customerPhone: '0911' },
          { id: 'staff-1', role: ROLE.SALE },
          msg,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when property has confirmed booking in range', async () => {
      (prisma.property.findUnique as jest.Mock).mockResolvedValue({ id: 'property-1', isActive: true });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({ id: 'conflict-1', status: BOOKING_STATUS.CONFIRMED });
      (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.holdProperty(
          { propertyId: 'property-1', checkinDate: '2026-08-01', checkoutDate: '2026-08-03', customerName: 'X', customerPhone: '0911' },
          { id: 'staff-1', role: ROLE.SALE },
          msg,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create HOLD booking and set Redis on success', async () => {
      (prisma.property.findUnique as jest.Mock).mockResolvedValue({ id: 'property-1', ownerId: 'owner-1', isActive: true });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.booking.create as jest.Mock).mockResolvedValue({
        ...mockBooking,
        property: { id: 'property-1', name: 'P1', code: 'C1' },
        sale: { id: 'staff-1', name: 'S1' },
      });

      const result = await service.holdProperty(
        { propertyId: 'property-1', checkinDate: '2026-08-01', checkoutDate: '2026-08-03', customerName: 'Guest', customerPhone: '0911111111' },
        { id: 'staff-1', role: ROLE.SALE, ownerId: 'owner-1' },
        msg,
      );

      expect(result.data.holdRemainingSeconds).toBe(1800);
      expect(redis.setHold).toHaveBeenCalled();
    });

    it('should allow booking with checkin = today (not blocked as past)', async () => {
      // Ngày hôm nay theo lịch VN (UTC+7), định dạng YYYY-MM-DD.
      const vnToday = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const vnTomorrow = new Date(Date.now() + 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      (prisma.property.findUnique as jest.Mock).mockResolvedValue({ id: 'property-1', ownerId: 'owner-1', isActive: true });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (prisma.booking.create as jest.Mock).mockResolvedValue({
        ...mockBooking,
        property: { id: 'property-1', name: 'P1', code: 'C1' },
        sale: { id: 'staff-1', name: 'S1' },
      });

      const result = await service.holdProperty(
        { propertyId: 'property-1', checkinDate: vnToday, checkoutDate: vnTomorrow, customerName: 'Guest', customerPhone: '0911111111' },
        { id: 'staff-1', role: ROLE.SALE, ownerId: 'owner-1' },
        msg,
      );

      expect(prisma.booking.create).toHaveBeenCalled();
      expect(result.data.holdRemainingSeconds).toBe(1800);
    });
  });

  describe('completeCheckedOutBookings', () => {
    it('should flip CONFIRMED bookings past checkout-noon to COMPLETED', async () => {
      (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const count = await service.completeCheckedOutBookings();

      expect(count).toBe(2);
      const call = (prisma.booking.updateMany as jest.Mock).mock.calls[0][0];
      expect(call.where.status).toBe(BOOKING_STATUS.CONFIRMED);
      // Ngưỡng = now - 5h (12h trưa VN của ngày checkout, checkout lưu 00:00Z).
      expect(call.where.checkoutDate.lte).toBeInstanceOf(Date);
      expect(call.data.status).toBe(BOOKING_STATUS.COMPLETED);
      expect(call.data.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('paymentInfo (enrich via findOne)', () => {
    const ownerBank = {
      id: 'owner-1', name: 'Owner', phone: '0900000000',
      bankBin: '970436', bankName: 'Vietcombank',
      bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN VAN A',
    };
    const baseConfirmed = {
      ...mockBooking,
      status: BOOKING_STATUS.CONFIRMED,
      depositAmount: 500000,
      paidAt: null,
      review: null,
      property: {
        id: 'property-1', name: 'P1', slug: 'p1', code: 'C1',
        cancellationPolicy: 0, ownerId: 'owner-1', images: [], owner: ownerBank,
      },
    };
    const admin = { id: 'admin-1', role: ROLE.ADMIN };

    it('returns paymentInfo with VietQR payload when CONFIRMED + bank + deposit + unpaid', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(baseConfirmed);
      const res = await service.findOne('booking-1', admin, msg);
      const pi = res.data.paymentInfo;
      expect(pi).not.toBeNull();
      expect(pi!.amount).toBe(500000);
      expect(pi!.bank.accountNumber).toBe('0123456789');
      expect(typeof pi!.qrPayload).toBe('string');
      expect(pi!.qrPayload.length).toBeGreaterThan(20);
    });

    it('returns null paymentInfo when already paid', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ ...baseConfirmed, paidAt: new Date() });
      const res = await service.findOne('booking-1', admin, msg);
      expect(res.data.paymentInfo).toBeNull();
    });

    it('returns null paymentInfo when owner has no bank configured', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
        ...baseConfirmed,
        property: { ...baseConfirmed.property, owner: { ...ownerBank, bankBin: null, bankAccountNumber: null } },
      });
      const res = await service.findOne('booking-1', admin, msg);
      expect(res.data.paymentInfo).toBeNull();
    });

    it('returns null paymentInfo when status is HOLD (chưa confirm)', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ ...baseConfirmed, status: BOOKING_STATUS.HOLD });
      const res = await service.findOne('booking-1', admin, msg);
      expect(res.data.paymentInfo).toBeNull();
    });
  });

  describe('markPaid email', () => {
    const admin = { id: 'admin-1', role: ROLE.ADMIN };

    it('sends booking-confirmed email when customer has email', async () => {
      const booking = {
        ...mockBooking,
        status: BOOKING_STATUS.CONFIRMED,
        customerId: 'cust-1',
        totalAmount: 1000000,
        depositAmount: 500000,
        property: { id: 'property-1', name: 'P1', code: 'C1', ownerId: 'owner-1', owner: { name: 'Owner', phone: '0900' } },
        customer: { email: 'guest@example.com', name: 'Guest' },
      };
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
      (prisma.booking.update as jest.Mock).mockResolvedValue({ ...booking, property: { id: 'property-1', name: 'P1', code: 'C1' } });

      await service.markPaid('booking-1', 500000, admin, msg);

      expect(email.sendBookingConfirmed).toHaveBeenCalledTimes(1);
      const arg = (email.sendBookingConfirmed as jest.Mock).mock.calls[0][0];
      expect(arg.to).toBe('guest@example.com');
      expect(arg.paidAmount).toBe(500000);
    });

    it('does not send email when customer has no email', async () => {
      const booking = {
        ...mockBooking,
        status: BOOKING_STATUS.CONFIRMED,
        customerId: 'cust-1',
        property: { id: 'property-1', name: 'P1', code: 'C1', ownerId: 'owner-1', owner: { name: 'Owner', phone: '0900' } },
        customer: null,
      };
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(booking);
      (prisma.booking.update as jest.Mock).mockResolvedValue({ ...booking, property: { id: 'property-1', name: 'P1', code: 'C1' } });

      await service.markPaid('booking-1', 500000, admin, msg);

      expect(email.sendBookingConfirmed).not.toHaveBeenCalled();
    });
  });

  describe('confirmBooking', () => {
    it('should throw BadRequestException when status is not HOLD', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ ...mockBooking, status: BOOKING_STATUS.CONFIRMED });

      await expect(
        service.confirmBooking('booking-1', { id: 'admin-1', role: ROLE.ADMIN }, msg),
      ).rejects.toThrow(BadRequestException);
    });

    it('should confirm and clear Redis hold', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue(mockBooking);
      (prisma.booking.update as jest.Mock).mockResolvedValue({
        ...mockBooking,
        status: BOOKING_STATUS.CONFIRMED,
        property: { name: 'Villa Test', code: 'VT01' },
      });

      await service.confirmBooking('booking-1', { id: 'admin-1', role: ROLE.ADMIN }, msg);

      // Redis hold hiện key theo booking.id (không phải propertyId).
      expect(redis.delHold).toHaveBeenCalledWith('booking-1');
    });
  });

  describe('cancelBooking', () => {
    it('should throw BadRequestException when already cancelled', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({ ...mockBooking, status: BOOKING_STATUS.CANCELLED });

      await expect(
        service.cancelBooking('booking-1', undefined, { id: 'admin-1', role: ROLE.ADMIN }, msg),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when SALE cancels booking of another owner', async () => {
      (prisma.booking.findUnique as jest.Mock).mockResolvedValue({
        ...mockBooking,
        property: { ownerId: 'other-owner' },
      });

      await expect(
        service.cancelBooking('booking-1', undefined, { id: 'staff-1', role: ROLE.SALE, ownerId: 'owner-1' }, msg),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('expireHoldBookings', () => {
    it('should cancel expired HOLD bookings and clear Redis', async () => {
      const expired = [
        { id: 'b1', propertyId: 'p1' },
        { id: 'b2', propertyId: 'p2' },
      ];
      (prisma.booking.findMany as jest.Mock).mockResolvedValue(expired);
      (prisma.booking.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const count = await service.expireHoldBookings();

      expect(count).toBe(2);
      expect(redis.delHold).toHaveBeenCalledTimes(2);
    });
  });
});
