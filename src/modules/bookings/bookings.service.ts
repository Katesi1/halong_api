import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { CustomerHoldBookingDto } from './dto/customer-hold-booking.dto';
import { Messages } from '../../i18n';
import { ROLE, BOOKING_STATUS, CALENDAR_LOCK_STATUS, NOTIFICATION_TYPE, getEffectiveOwnerId, isSaleUnassigned } from '../../common/constants';
import { NotificationsService } from '../notifications/notifications.service';

const STAFF_HOLD_DURATION_SECONDS = 1800; // 30 phút
const CUSTOMER_HOLD_DURATION_SECONDS = 86400; // 24 giờ

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private notifications: NotificationsService,
  ) {}

  // ─── Staff/Admin Methods ──────────────────────────────────────────────────

  async findAll(
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    propertyId?: string,
    status?: number,
  ) {
    const where: any = {};

    if (propertyId) where.propertyId = propertyId;
    if (status !== undefined) where.status = status;

    // Scope by property ownership
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId) {
      where.property = { ownerId: effectiveOwnerId };
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        property: {
          select: {
            id: true, name: true, code: true, type: true,
            images: { where: { isCover: true }, take: 1 },
          },
        },
        sale: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const bookingsWithHoldTtl = bookings.map((booking) => {
      let holdRemainingSeconds = 0;
      if (booking.status === BOOKING_STATUS.HOLD && booking.holdExpireAt) {
        holdRemainingSeconds = Math.max(0, Math.floor((booking.holdExpireAt.getTime() - Date.now()) / 1000));
      }
      return { ...booking, holdRemainingSeconds };
    });

    return { message: msg.bookings.listSuccess, data: bookingsWithHoldTtl };
  }

  async findOne(id: string, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        property: {
          include: {
            images: { orderBy: { order: 'asc' }, take: 5 },
            owner: { select: { id: true, name: true, phone: true } },
          },
        },
        sale: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    this.checkBookingAccess(booking, user, msg);

    let holdRemainingSeconds = 0;
    if (booking.status === BOOKING_STATUS.HOLD && booking.holdExpireAt) {
      holdRemainingSeconds = Math.max(0, Math.floor((booking.holdExpireAt.getTime() - Date.now()) / 1000));
    }

    return {
      message: msg.bookings.getSuccess,
      data: { ...booking, holdRemainingSeconds },
    };
  }

  /** Parse 'YYYY-MM-DD' → UTC midnight Date */
  private toUTCDate(dateStr: string): Date {
    return new Date(dateStr.split('T')[0] + 'T00:00:00.000Z');
  }

  async holdProperty(dto: CreateBookingDto, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const { propertyId, checkinDate, checkoutDate } = dto;

    const checkin = this.toUTCDate(checkinDate);
    const checkout = this.toUTCDate(checkoutDate);
    if (checkin >= checkout) {
      throw new BadRequestException(msg.bookings.checkoutBeforeCheckin);
    }
    if (checkin < new Date()) {
      throw new BadRequestException(msg.bookings.checkinInPast);
    }

    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || !property.isActive || property.deletedAt) throw new NotFoundException(msg.properties.notFound);

    // Check Redis hold
    const existingHold = await this.redis.getHold(propertyId);
    if (existingHold) {
      const holdBooking = await this.prisma.booking.findFirst({
        where: { id: existingHold, status: BOOKING_STATUS.HOLD },
        select: { saleId: true },
      });
      if (holdBooking && holdBooking.saleId !== user.id) {
        const ttl = await this.redis.getHoldTtl(propertyId);
        throw new BadRequestException(msg.bookings.propertyOnHold(Math.ceil(ttl / 60)));
      }
    }

    // Check date conflicts
    const conflict = await this.prisma.booking.findFirst({
      where: {
        propertyId,
        status: BOOKING_STATUS.CONFIRMED,
        checkinDate: { lt: checkout },
        checkoutDate: { gt: checkin },
      },
    });
    if (conflict) {
      throw new BadRequestException(msg.bookings.propertyAlreadyBooked);
    }

    // Check calendar lock conflicts (locked/hold/booked dates)
    const lockConflict = await this.prisma.calendarLock.findFirst({
      where: {
        propertyId,
        date: { gte: checkin, lt: checkout },
      },
    });
    if (lockConflict) {
      throw new BadRequestException(msg.bookings.dateLocked);
    }

    // Cancel existing holds for this property
    await this.prisma.booking.updateMany({
      where: { propertyId, status: BOOKING_STATUS.HOLD },
      data: { status: BOOKING_STATUS.CANCELLED },
    });

    const holdExpireAt = new Date(Date.now() + STAFF_HOLD_DURATION_SECONDS * 1000);
    const booking = await this.prisma.booking.create({
      data: {
        propertyId,
        saleId: user.id,
        checkinDate: checkin,
        checkoutDate: checkout,
        status: BOOKING_STATUS.HOLD,
        holdExpireAt,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        depositAmount: dto.depositAmount,
        guestCount: dto.guestCount || 2,
        notes: dto.notes,
      },
      include: {
        property: { select: { id: true, name: true, code: true } },
        sale: { select: { id: true, name: true } },
      },
    });

    await this.redis.setHold(propertyId, booking.id, STAFF_HOLD_DURATION_SECONDS);

    // Notify owner
    await this.notifications.notifyPropertyOwner(
      propertyId,
      'Booking mới — Giữ chỗ',
      `${booking.property.name} (${booking.property.code}) được giữ chỗ bởi ${booking.sale?.name || 'Staff'}`,
      NOTIFICATION_TYPE.BOOKING,
      booking.id,
      'booking',
    );

    return {
      message: msg.bookings.holdSuccess,
      data: { ...booking, holdRemainingSeconds: STAFF_HOLD_DURATION_SECONDS },
    };
  }

  async confirmBooking(id: string, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: { select: { ownerId: true } } },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    this.checkBookingAccess(booking, user, msg);

    if (booking.status !== BOOKING_STATUS.HOLD) {
      throw new BadRequestException(msg.bookings.onlyConfirmHold);
    }

    const confirmed = await this.prisma.booking.update({
      where: { id },
      data: { status: BOOKING_STATUS.CONFIRMED, holdExpireAt: null },
      include: {
        property: { select: { id: true, name: true, code: true } },
      },
    });

    await this.redis.delHold(booking.propertyId);

    // Notify owner + customer
    await this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Booking được xác nhận',
      `${confirmed.property.name} (${confirmed.property.code}) — booking đã xác nhận`,
      NOTIFICATION_TYPE.BOOKING,
      id,
      'booking',
    );
    if (booking.customerId) {
      await this.notifications.notifyUser(
        booking.customerId,
        'Đặt phòng được xác nhận',
        `Phòng ${confirmed.property.name} đã được xác nhận`,
        NOTIFICATION_TYPE.BOOKING,
        id,
        'booking',
      );
    }

    return { message: msg.bookings.confirmSuccess, data: confirmed };
  }

  async cancelBooking(id: string, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: { select: { ownerId: true } } },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    this.checkBookingAccess(booking, user, msg);

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      throw new BadRequestException(msg.bookings.alreadyCancelled);
    }

    const cancelled = await this.prisma.booking.update({
      where: { id },
      data: { status: BOOKING_STATUS.CANCELLED },
      include: { property: { select: { name: true, code: true } } },
    });

    await this.redis.delHold(booking.propertyId);

    // Notify owner
    await this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Booking đã bị hủy',
      `${cancelled.property.name} (${cancelled.property.code}) — booking đã hủy`,
      NOTIFICATION_TYPE.BOOKING,
      id,
      'booking',
    );

    return { message: msg.bookings.cancelSuccess, data: null };
  }

  async update(id: string, dto: UpdateBookingDto, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: { select: { ownerId: true } } },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    this.checkBookingAccess(booking, user, msg);

    const updated = await this.prisma.booking.update({
      where: { id },
      data: dto,
      include: {
        property: { select: { id: true, name: true, code: true } },
      },
    });

    return { message: msg.bookings.updateSuccess, data: updated };
  }

  // ─── Customer Methods ─────────────────────────────────────────────────────

  async customerHold(dto: CustomerHoldBookingDto, user: { id: string; role: number }, msg: Messages) {
    const { propertyId, checkinDate, checkoutDate } = dto;

    const checkin = this.toUTCDate(checkinDate);
    const checkout = this.toUTCDate(checkoutDate);
    if (checkin >= checkout) {
      throw new BadRequestException(msg.bookings.checkoutBeforeCheckin);
    }
    if (checkin < new Date()) {
      throw new BadRequestException(msg.bookings.checkinInPast);
    }

    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || !property.isActive || property.deletedAt) throw new NotFoundException(msg.properties.notFound);

    // Check date conflicts (HOLD + CONFIRMED)
    const conflict = await this.prisma.booking.findFirst({
      where: {
        propertyId,
        status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
        checkinDate: { lt: checkout },
        checkoutDate: { gt: checkin },
      },
    });
    if (conflict) {
      throw new ConflictException(msg.bookings.propertyNotAvailable);
    }

    // Check calendar lock conflicts (locked/hold/booked dates)
    const lockConflict = await this.prisma.calendarLock.findFirst({
      where: {
        propertyId,
        date: { gte: checkin, lt: checkout },
      },
    });
    if (lockConflict) {
      throw new ConflictException(msg.bookings.dateLocked);
    }

    const holdExpireAt = new Date(Date.now() + CUSTOMER_HOLD_DURATION_SECONDS * 1000);
    const booking = await this.prisma.booking.create({
      data: {
        propertyId,
        customerId: user.id,
        checkinDate: checkin,
        checkoutDate: checkout,
        status: BOOKING_STATUS.HOLD,
        holdExpireAt,
        guestCount: dto.guestCount || 2,
        notes: dto.notes,
      },
      include: {
        property: { select: { id: true, name: true, code: true } },
      },
    });

    // Notify owner
    const customer = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
    await this.notifications.notifyPropertyOwner(
      propertyId,
      'Khách đặt phòng mới',
      `${booking.property.name} (${booking.property.code}) — khách ${customer?.name || 'Ẩn danh'} giữ chỗ`,
      NOTIFICATION_TYPE.BOOKING,
      booking.id,
      'booking',
    );

    return {
      message: msg.bookings.customerHoldSuccess,
      data: { ...booking, holdRemainingSeconds: CUSTOMER_HOLD_DURATION_SECONDS },
    };
  }

  async getMyBookings(user: { id: string; role: number }, msg: Messages, status?: number) {
    const where: any = { customerId: user.id };
    if (status !== undefined) {
      where.status = status;
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        property: {
          select: {
            id: true, name: true, code: true, type: true,
            images: { where: { isCover: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const bookingsWithHoldTtl = bookings.map((booking) => {
      let holdRemainingSeconds = 0;
      if (booking.status === BOOKING_STATUS.HOLD && booking.holdExpireAt) {
        holdRemainingSeconds = Math.max(0, Math.floor((booking.holdExpireAt.getTime() - Date.now()) / 1000));
      }
      return { ...booking, holdRemainingSeconds };
    });

    return { message: msg.bookings.myListSuccess, data: bookingsWithHoldTtl };
  }

  async customerCancel(id: string, user: { id: string; role: number }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    if (booking.customerId !== user.id) {
      throw new ForbiddenException(msg.bookings.notYourBooking);
    }

    if (booking.status === BOOKING_STATUS.CONFIRMED) {
      throw new BadRequestException(msg.bookings.cannotCancelConfirmed);
    }
    if (booking.status !== BOOKING_STATUS.HOLD) {
      throw new BadRequestException(msg.bookings.onlyCancelHold);
    }

    const cancelled = await this.prisma.booking.update({
      where: { id },
      data: { status: BOOKING_STATUS.CANCELLED },
      include: { property: { select: { name: true, code: true } } },
    });

    await this.redis.delHold(booking.propertyId);

    // Notify owner
    await this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Khách hủy đặt phòng',
      `${cancelled.property.name} (${cancelled.property.code}) — khách đã hủy giữ chỗ`,
      NOTIFICATION_TYPE.BOOKING,
      id,
      'booking',
    );

    return { message: msg.bookings.customerCancelSuccess, data: null };
  }

  // ─── Cron Job ─────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async expireHoldBookings() {
    const now = new Date();
    const expired = await this.prisma.booking.findMany({
      where: {
        status: BOOKING_STATUS.HOLD,
        holdExpireAt: { lte: now },
      },
    });

    if (expired.length > 0) {
      await this.prisma.booking.updateMany({
        where: { id: { in: expired.map((b) => b.id) } },
        data: { status: BOOKING_STATUS.CANCELLED },
      });

      await Promise.all(expired.map((b) => this.redis.delHold(b.propertyId)));
    }

    return expired.length;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private checkBookingAccess(booking: any, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId && booking.property?.ownerId !== effectiveOwnerId) {
      throw new ForbiddenException(msg.bookings.forbiddenAccess);
    }
  }
}
