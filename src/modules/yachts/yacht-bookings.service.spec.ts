import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { YachtBookingsService } from './yacht-bookings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { ChatService } from '../chat/chat.service';
import { en } from '../../i18n';
import { ROLE, YACHT_BOOKING_STATUS } from '../../common/constants';
import { deriveYachtCode } from './yacht.helpers';
import { resolveNightlyRate } from '../bookings/booking-pricing';

const msg = en;

const ADMIN = { id: 'admin-1', role: ROLE.ADMIN, scope: 'owner' };
const SYSTEM_SALE = { id: 'sale-1', role: ROLE.SALE, scope: 'system' };
const OWNER_SALE = { id: 'sale-2', role: ROLE.SALE, scope: 'owner' };
const CUSTOMER = { id: 'cust-1', role: ROLE.CUSTOMER, scope: 'owner' };

const yacht = {
  id: 'yacht-1',
  name: 'Ambassador Cruise',
  isActive: true,
  deletedAt: null,
  maxGuests: 4,
  weekdayPrice: 900000, // giá người lớn/khách
  weekendPrice: 1100000,
  holidayPrice: 1300000,
  weekdayChildPrice: 650000, // giá trẻ em/khách
  weekendChildPrice: 800000,
  holidayChildPrice: 950000,
  departurePoint: 'Cảng Tuần Châu',
};

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'yb-1',
    yachtId: 'yacht-1',
    saleId: null,
    customerId: 'cust-1',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0901234567',
    customerEmail: 'a@example.com',
    adults: 2,
    children: 0,
    guestCount: 2,
    checkinDate: new Date('2030-08-12T00:00:00.000Z'),
    checkoutDate: new Date('2030-08-13T00:00:00.000Z'),
    status: YACHT_BOOKING_STATUS.PENDING,
    totalAmount: 3000000,
    paidAmount: null,
    paidAt: null,
    confirmedAt: null,
    cancelledReason: null,
    notes: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('YachtBookingsService', () => {
  let service: YachtBookingsService;
  let prisma: any;
  let email: { sendYachtBookingConfirmed: jest.Mock };
  let chat: { getOrCreateYachtConversation: jest.Mock; postSystemMessage: jest.Mock };

  beforeEach(async () => {
    prisma = {
      yacht: { findUnique: jest.fn() },
      yachtBooking: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      paymentBankAccount: { findUnique: jest.fn().mockResolvedValue(null) },
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'conv-1' }) },
      notification: { createMany: jest.fn() },
    };
    // $transaction: callback form → cb(prisma); array form → Promise.all.
    prisma.$transaction = jest.fn().mockImplementation((arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(prisma),
    );

    email = { sendYachtBookingConfirmed: jest.fn().mockResolvedValue(undefined) };
    chat = {
      getOrCreateYachtConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
      postSystemMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YachtBookingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { notifyUser: jest.fn() } },
        { provide: EmailService, useValue: email },
        { provide: ChatService, useValue: chat },
        { provide: ConfigService, useValue: { get: (_k: string, d?: string) => d ?? 'x' } },
      ],
    }).compile();

    service = module.get(YachtBookingsService);
  });

  describe('deriveYachtCode', () => {
    it('formats YC-XXXXXXXX from uuid', () => {
      expect(deriveYachtCode('abcd1234-5678-90ab-cdef-000000000000')).toBe('YC-ABCD1234');
    });
  });

  describe('createBooking', () => {
    it('throws when yacht not found', async () => {
      prisma.yacht.findUnique.mockResolvedValue(null);
      await expect(
        service.createBooking(
          { yachtId: 'x', checkinDate: '2030-08-12', checkoutDate: '2030-08-13', adults: 2 },
          CUSTOMER,
          msg,
          { asStaff: false },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when checkout < checkin (checkoutDate trước ngày đi)', async () => {
      prisma.yacht.findUnique.mockResolvedValue(yacht);
      await expect(
        service.createBooking(
          { yachtId: 'yacht-1', checkinDate: '2030-08-12', checkoutDate: '2030-08-09', adults: 2 },
          CUSTOMER,
          msg,
          { asStaff: false },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when guests exceed max', async () => {
      prisma.yacht.findUnique.mockResolvedValue(yacht);
      await expect(
        service.createBooking(
          { yachtId: 'yacht-1', checkinDate: '2030-08-12', checkoutDate: '2030-08-13', adults: 5 },
          CUSTOMER,
          msg,
          { asStaff: false },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a PENDING booking with computed total + seeds conversation', async () => {
      prisma.yacht.findUnique.mockResolvedValue(yacht);
      prisma.user.findUnique.mockResolvedValue({ name: 'A', phone: '090', email: 'a@example.com' });
      prisma.yachtBooking.create.mockImplementation(({ data }: any) =>
        Promise.resolve(makeBooking({ ...data })),
      );

      const res = await service.createBooking(
        { yachtId: 'yacht-1', checkinDate: '2030-08-12', checkoutDate: '2030-08-13', adults: 2 },
        CUSTOMER,
        msg,
        { asStaff: false },
      );

      expect(prisma.yachtBooking.create).toHaveBeenCalled();
      const created = prisma.yachtBooking.create.mock.calls[0][0].data;
      expect(created.status).toBe(YACHT_BOOKING_STATUS.PENDING);
      expect(created.customerId).toBe('cust-1');
      expect(typeof created.totalAmount).toBe('number');
      expect(created.totalAmount).toBeGreaterThan(0);
      expect(chat.getOrCreateYachtConversation).toHaveBeenCalledWith('yb-1', 'cust-1');
      expect(res.data.status).toBe(YACHT_BOOKING_STATUS.PENDING);
    });

    it('tính giá THEO ĐẦU NGƯỜI: 2 người lớn + 1 trẻ em (giá riêng)', async () => {
      prisma.yacht.findUnique.mockResolvedValue(yacht);
      prisma.user.findUnique.mockResolvedValue({ name: 'A', phone: '090', email: 'a@example.com' });
      prisma.yachtBooking.create.mockImplementation(({ data }: any) => Promise.resolve(makeBooking({ ...data })));

      await service.createBooking(
        { yachtId: 'yacht-1', checkinDate: '2030-08-12', adults: 2, children: 1 },
        CUSTOMER,
        msg,
        { asStaff: false },
      );
      const d = new Date('2030-08-12T00:00:00.000Z');
      const adultRate = resolveNightlyRate(d, { weekdayPrice: 900000, weekendPrice: 1100000, holidayPrice: 1300000 }).amount!;
      const childRate = resolveNightlyRate(d, { weekdayPrice: 650000, weekendPrice: 800000, holidayPrice: 950000 }).amount!;
      const created = prisma.yachtBooking.create.mock.calls[0][0].data;
      expect(created.totalAmount).toBe(2 * adultRate + 1 * childRate);
    });

    it('rejects when yacht already booked (conflict)', async () => {
      prisma.yacht.findUnique.mockResolvedValue(yacht);
      prisma.user.findUnique.mockResolvedValue({ name: 'A', phone: '090', email: 'a@example.com' });
      prisma.yachtBooking.findFirst.mockResolvedValue({ id: 'other' });
      await expect(
        service.createBooking(
          { yachtId: 'yacht-1', checkinDate: '2030-08-12', checkoutDate: '2030-08-13', adults: 2 },
          CUSTOMER,
          msg,
          { asStaff: false },
        ),
      ).rejects.toThrow();
    });
  });

  describe('confirm', () => {
    it('forbids non admin/system-sale', async () => {
      await expect(service.confirm('yb-1', OWNER_SALE, msg)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects non-PENDING booking', async () => {
      prisma.yachtBooking.findUnique.mockResolvedValue(makeBooking({ status: YACHT_BOOKING_STATUS.CONFIRMED }));
      await expect(service.confirm('yb-1', ADMIN, msg)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('confirms + returns VietQR payment info', async () => {
      prisma.yachtBooking.findUnique.mockResolvedValue(makeBooking());
      prisma.yacht.findUnique.mockResolvedValue(yacht);
      prisma.yachtBooking.update.mockImplementation(({ data }: any) =>
        Promise.resolve(makeBooking({ ...data })),
      );

      const res = await service.confirm('yb-1', SYSTEM_SALE, msg);
      expect(res.data.status).toBe(YACHT_BOOKING_STATUS.CONFIRMED);
      expect(res.data.payment.qrCode).toEqual(expect.any(String));
      expect(res.data.payment.content).toContain('YC');
    });
  });

  describe('markPaid', () => {
    it('rejects non-CONFIRMED booking', async () => {
      prisma.yachtBooking.findUnique.mockResolvedValue(makeBooking({ status: YACHT_BOOKING_STATUS.PENDING }));
      await expect(service.markPaid('yb-1', {}, ADMIN, msg)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks paid, sends email with code', async () => {
      prisma.yachtBooking.findUnique.mockResolvedValue(
        makeBooking({ status: YACHT_BOOKING_STATUS.CONFIRMED, totalAmount: 6000000 }),
      );
      prisma.yachtBooking.update.mockImplementation(({ data }: any) =>
        Promise.resolve(makeBooking({ status: YACHT_BOOKING_STATUS.CONFIRMED, totalAmount: 6000000, ...data })),
      );
      prisma.yacht.findUnique.mockResolvedValue({ name: 'Ambassador', departurePoint: 'Cảng' });

      const res = await service.markPaid('yb-1', {}, ADMIN, msg);
      expect(res.data.status).toBe(YACHT_BOOKING_STATUS.PAID);
      expect(res.data.bookingCode).toBe(deriveYachtCode('yb-1'));
      expect(email.sendYachtBookingConfirmed).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'a@example.com', paidAmount: 6000000 }),
      );
    });
  });

  describe('cancel', () => {
    it('customer cancels own PENDING booking', async () => {
      prisma.yachtBooking.findUnique.mockResolvedValue(makeBooking());
      prisma.yachtBooking.update.mockImplementation(({ data }: any) =>
        Promise.resolve(makeBooking({ ...data })),
      );
      const res = await service.cancel('yb-1', 'đổi lịch', CUSTOMER, msg);
      expect(res.data.status).toBe(YACHT_BOOKING_STATUS.CANCELLED);
    });

    it('customer cannot cancel a PAID booking', async () => {
      prisma.yachtBooking.findUnique.mockResolvedValue(makeBooking({ status: YACHT_BOOKING_STATUS.PAID }));
      await expect(service.cancel('yb-1', undefined, CUSTOMER, msg)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forbids a different customer', async () => {
      prisma.yachtBooking.findUnique.mockResolvedValue(makeBooking({ customerId: 'someone-else' }));
      await expect(service.cancel('yb-1', undefined, CUSTOMER, msg)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
