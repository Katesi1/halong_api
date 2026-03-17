import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { Messages } from '../../i18n';
import { BookingStatus, Role } from '@prisma/client';

const HOLD_DURATION_SECONDS = 1800; // 30 phút

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findAll(user: { id: string; role: Role }, msg: Messages, roomId?: string) {
    const where: any = {};

    if (roomId) where.roomId = roomId;

    if (user.role === Role.SALE) {
      where.saleId = user.id;
    }

    if (user.role === Role.OWNER) {
      where.room = { homestay: { ownerId: user.id } };
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

    const bookingsWithHoldTtl = await Promise.all(
      bookings.map(async (booking) => {
        if (booking.status === BookingStatus.HOLD) {
          const ttl = await this.redis.getHoldTtl(booking.roomId);
          return { ...booking, holdRemainingSeconds: ttl > 0 ? ttl : 0 };
        }
        return booking;
      }),
    );

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
    if (booking.status === BookingStatus.HOLD) {
      const ttl = await this.redis.getHoldTtl(booking.roomId);
      holdRemainingSeconds = ttl > 0 ? ttl : 0;
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

    const conflict = await this.prisma.booking.findFirst({
      where: {
        roomId,
        status: { in: [BookingStatus.CONFIRMED] },
        OR: [
          { checkinDate: { lte: checkout }, checkoutDate: { gte: checkin } },
        ],
      },
    });
    if (conflict) {
      throw new BadRequestException(msg.bookings.roomAlreadyBooked);
    }

    await this.prisma.booking.updateMany({
      where: { roomId, status: BookingStatus.HOLD },
      data: { status: BookingStatus.CANCELLED },
    });

    const holdExpireAt = new Date(Date.now() + HOLD_DURATION_SECONDS * 1000);
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

    await this.redis.setHold(roomId, booking.id, HOLD_DURATION_SECONDS);

    return {
      message: msg.bookings.holdSuccess,
      data: { ...booking, holdRemainingSeconds: HOLD_DURATION_SECONDS },
    };
  }

  async confirmBooking(id: string, user: { id: string; role: Role }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    if (user.role === Role.OWNER) {
      const room = await this.prisma.room.findUnique({
        where: { id: booking.roomId },
        include: { homestay: true },
      });
      if (room?.homestay.ownerId !== user.id) {
        throw new ForbiddenException(msg.bookings.forbiddenConfirm);
      }
    }

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
        OR: [
          { checkinDate: { lte: endDate }, checkoutDate: { gte: startDate } },
        ],
      },
      select: {
        id: true, checkinDate: true, checkoutDate: true, status: true,
        customerName: true, sale: { select: { name: true } },
      },
    });

    const result = await Promise.all(
      bookings.map(async (b) => {
        if (b.status === BookingStatus.HOLD) {
          const ttl = await this.redis.getHoldTtl(roomId);
          return { ...b, holdRemainingSeconds: ttl > 0 ? ttl : 0 };
        }
        return b;
      }),
    );

    return { message: msg.rooms.calendarSuccess, data: result };
  }

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

  private async checkBookingAccess(booking: any, user: { id: string; role: Role }, msg: Messages) {
    if (user.role === Role.SALE && booking.saleId !== user.id) {
      throw new ForbiddenException(msg.bookings.forbiddenAccess);
    }
    if (user.role === Role.OWNER) {
      const room = await this.prisma.room.findUnique({
        where: { id: booking.roomId },
        include: { homestay: { select: { ownerId: true } } },
      });
      if (!room || room.homestay.ownerId !== user.id) {
        throw new ForbiddenException(msg.bookings.forbiddenAccess);
      }
    }
  }
}
