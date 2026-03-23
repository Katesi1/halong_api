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
import { BookingStatus, Role } from '@prisma/client';

const STAFF_HOLD_DURATION_SECONDS = 1800; // 30 phút
const CUSTOMER_HOLD_DURATION_SECONDS = 86400; // 24 giờ

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ─── Staff/Admin Methods ──────────────────────────────────────────────────

  async findAll(user: { id: string; role: Role }, msg: Messages, roomId?: string) {
    const where: any = {};

    if (roomId) where.roomId = roomId;

    // Staff only sees bookings they created
    if (user.role === Role.STAFF) {
      where.saleId = user.id;
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        room: {
          select: {
            id: true, name: true, code: true,
            homestay: { select: { id: true, name: true } },
          },
        },
        sale: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const bookingsWithHoldTtl = bookings.map((booking) => {
      let holdRemainingSeconds = 0;
      if (booking.status === BookingStatus.HOLD && booking.holdExpireAt) {
        holdRemainingSeconds = Math.max(0, Math.floor((booking.holdExpireAt.getTime() - Date.now()) / 1000));
      }
      return { ...booking, holdRemainingSeconds };
    });

    return { message: msg.bookings.listSuccess, data: bookingsWithHoldTtl };
  }

  async findOne(id: string, user: { id: string; role: Role }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        room: {
          include: {
            homestay: true,
            images: { orderBy: { order: 'asc' }, take: 5 },
            price: true,
          },
        },
        sale: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    await this.checkBookingAccess(booking, user, msg);

    let holdRemainingSeconds = 0;
    if (booking.status === BookingStatus.HOLD && booking.holdExpireAt) {
      holdRemainingSeconds = Math.max(0, Math.floor((booking.holdExpireAt.getTime() - Date.now()) / 1000));
    }

    return {
      message: msg.bookings.getSuccess,
      data: { ...booking, holdRemainingSeconds },
    };
  }

  async holdRoom(dto: CreateBookingDto, user: { id: string; role: Role }, msg: Messages) {
    const { roomId, checkinDate, checkoutDate } = dto;

    const checkin = new Date(checkinDate);
    const checkout = new Date(checkoutDate);
    if (checkin >= checkout) {
      throw new BadRequestException(msg.bookings.checkoutBeforeCheckin);
    }
    if (checkin < new Date()) {
      throw new BadRequestException(msg.bookings.checkinInPast);
    }

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room || !room.isActive) throw new NotFoundException(msg.rooms.notFound);

    // Check Redis hold
    const existingHold = await this.redis.getHold(roomId);
    if (existingHold) {
      const holdBooking = await this.prisma.booking.findFirst({
        where: { id: existingHold, status: BookingStatus.HOLD },
        select: { saleId: true },
      });
      if (holdBooking && holdBooking.saleId !== user.id) {
        const ttl = await this.redis.getHoldTtl(roomId);
        throw new BadRequestException(msg.bookings.roomOnHold(Math.ceil(ttl / 60)));
      }
    }

    // Check date conflicts
    const conflict = await this.prisma.booking.findFirst({
      where: {
        roomId,
        status: { in: [BookingStatus.CONFIRMED] },
        checkinDate: { lt: checkout },
        checkoutDate: { gt: checkin },
      },
    });
    if (conflict) {
      throw new BadRequestException(msg.bookings.roomAlreadyBooked);
    }

    // Cancel existing holds for this room
    await this.prisma.booking.updateMany({
      where: { roomId, status: BookingStatus.HOLD },
      data: { status: BookingStatus.CANCELLED },
    });

    const holdExpireAt = new Date(Date.now() + STAFF_HOLD_DURATION_SECONDS * 1000);
    const booking = await this.prisma.booking.create({
      data: {
        roomId,
        saleId: user.id,
        checkinDate: checkin,
        checkoutDate: checkout,
        status: BookingStatus.HOLD,
        holdExpireAt,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        depositAmount: dto.depositAmount,
        notes: dto.notes,
      },
      include: {
        room: { select: { id: true, name: true, code: true } },
        sale: { select: { id: true, name: true } },
      },
    });

    await this.redis.setHold(roomId, booking.id, STAFF_HOLD_DURATION_SECONDS);

    return {
      message: msg.bookings.holdSuccess,
      data: { ...booking, holdRemainingSeconds: STAFF_HOLD_DURATION_SECONDS },
    };
  }

  async confirmBooking(id: string, user: { id: string; role: Role }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    if (booking.status !== BookingStatus.HOLD) {
      throw new BadRequestException(msg.bookings.onlyConfirmHold);
    }

    const confirmed = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CONFIRMED, holdExpireAt: null },
    });

    await this.redis.delHold(booking.roomId);

    return { message: msg.bookings.confirmSuccess, data: confirmed };
  }

  async cancelBooking(id: string, user: { id: string; role: Role }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    await this.checkBookingAccess(booking, user, msg);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException(msg.bookings.alreadyCancelled);
    }

    await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED },
    });

    await this.redis.delHold(booking.roomId);

    return { message: msg.bookings.cancelSuccess, data: null };
  }

  async update(id: string, dto: UpdateBookingDto, user: { id: string; role: Role }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    await this.checkBookingAccess(booking, user, msg);

    const updated = await this.prisma.booking.update({
      where: { id },
      data: dto,
    });

    return { message: msg.bookings.updateSuccess, data: updated };
  }

  async getRoomCalendar(roomId: string, year: number, month: number, msg: Messages) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId,
        status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
        checkinDate: { lte: endDate },
        checkoutDate: { gte: startDate },
      },
      select: {
        id: true, checkinDate: true, checkoutDate: true, status: true,
        customerName: true, holdExpireAt: true,
        sale: { select: { name: true } },
      },
    });

    const result = bookings.map((b) => {
      let holdRemainingSeconds = 0;
      if (b.status === BookingStatus.HOLD && b.holdExpireAt) {
        holdRemainingSeconds = Math.max(0, Math.floor((b.holdExpireAt.getTime() - Date.now()) / 1000));
      }
      const { holdExpireAt, ...rest } = b;
      return { ...rest, holdRemainingSeconds };
    });

    return { message: msg.rooms.calendarSuccess, data: result };
  }

  // ─── Customer Methods ─────────────────────────────────────────────────────

  async customerHold(dto: CustomerHoldBookingDto, user: { id: string; role: Role }, msg: Messages) {
    const { roomId, checkinDate, checkoutDate } = dto;

    const checkin = new Date(checkinDate);
    const checkout = new Date(checkoutDate);
    if (checkin >= checkout) {
      throw new BadRequestException(msg.bookings.checkoutBeforeCheckin);
    }
    if (checkin < new Date()) {
      throw new BadRequestException(msg.bookings.checkinInPast);
    }

    // Check room exists and is active
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { homestay: { select: { name: true } } },
    });
    if (!room || !room.isActive) throw new NotFoundException(msg.rooms.notFound);

    // Check date conflicts (HOLD + CONFIRMED)
    const conflict = await this.prisma.booking.findFirst({
      where: {
        roomId,
        status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
        checkinDate: { lt: checkout },
        checkoutDate: { gt: checkin },
      },
    });
    if (conflict) {
      throw new ConflictException(msg.bookings.roomNotAvailable);
    }

    const holdExpireAt = new Date(Date.now() + CUSTOMER_HOLD_DURATION_SECONDS * 1000);
    const booking = await this.prisma.booking.create({
      data: {
        roomId,
        customerId: user.id,
        checkinDate: checkin,
        checkoutDate: checkout,
        status: BookingStatus.HOLD,
        holdExpireAt,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        guestCount: dto.guestCount || 2,
        notes: dto.notes,
      },
      include: {
        room: {
          select: {
            name: true,
            homestay: { select: { name: true } },
          },
        },
      },
    });

    return {
      message: msg.bookings.customerHoldSuccess,
      data: { ...booking, holdRemainingSeconds: CUSTOMER_HOLD_DURATION_SECONDS },
    };
  }

  async getMyBookings(user: { id: string; role: Role }, msg: Messages, status?: string) {
    const where: any = { customerId: user.id };
    if (status) {
      where.status = status as BookingStatus;
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        room: {
          select: {
            id: true, name: true, code: true,
            homestay: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const bookingsWithHoldTtl = bookings.map((booking) => {
      let holdRemainingSeconds = 0;
      if (booking.status === BookingStatus.HOLD && booking.holdExpireAt) {
        holdRemainingSeconds = Math.max(0, Math.floor((booking.holdExpireAt.getTime() - Date.now()) / 1000));
      }
      return { ...booking, holdRemainingSeconds };
    });

    return { message: msg.bookings.myListSuccess, data: bookingsWithHoldTtl };
  }

  async customerCancel(id: string, user: { id: string; role: Role }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    // Must belong to this customer
    if (booking.customerId !== user.id) {
      throw new ForbiddenException(msg.bookings.notYourBooking);
    }

    // Can only cancel HOLD status
    if (booking.status === BookingStatus.CONFIRMED) {
      throw new BadRequestException(msg.bookings.cannotCancelConfirmed);
    }
    if (booking.status !== BookingStatus.HOLD) {
      throw new BadRequestException(msg.bookings.onlyCancelHold);
    }

    await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.CANCELLED },
    });

    await this.redis.delHold(booking.roomId);

    return { message: msg.bookings.customerCancelSuccess, data: null };
  }

  // ─── Cron Job ─────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async expireHoldBookings() {
    const now = new Date();
    const expired = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.HOLD,
        holdExpireAt: { lte: now },
      },
    });

    if (expired.length > 0) {
      await this.prisma.booking.updateMany({
        where: { id: { in: expired.map((b) => b.id) } },
        data: { status: BookingStatus.CANCELLED },
      });

      await Promise.all(expired.map((b) => this.redis.delHold(b.roomId)));
    }

    return expired.length;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async checkBookingAccess(booking: any, user: { id: string; role: Role }, msg: Messages) {
    if (user.role === Role.STAFF && booking.saleId !== user.id) {
      throw new ForbiddenException(msg.bookings.forbiddenAccess);
    }
  }
}
