import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePartnerBookingDto } from './dto/create-partner-booking.dto';
import { Messages } from '../../i18n';
import { BookingStatus } from '@prisma/client';

@Injectable()
export class PartnerService {
  constructor(private prisma: PrismaService) {}

  async getRooms(query: { propertyId?: string; page?: number; limit?: number }, msg: Messages) {
    const { propertyId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };
    if (propertyId) where.propertyId = propertyId;

    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: {
          property: { select: { id: true, name: true, address: true } },
          images: { where: { isCover: true }, take: 1 },
          price: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.room.count({ where }),
    ]);

    return {
      message: msg.partner.listSuccess,
      data: rooms,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getRoomDetail(id: string, msg: Messages) {
    const room = await this.prisma.room.findUnique({
      where: { id, isActive: true },
      include: {
        property: { select: { id: true, name: true, address: true, latitude: true, longitude: true, mapLink: true } },
        images: { orderBy: { order: 'asc' } },
        price: true,
      },
    });
    if (!room) throw new NotFoundException(msg.rooms.notFound);
    return { message: msg.partner.getSuccess, data: room };
  }

  async getRoomAvailability(roomId: string, year: number, month: number, msg: Messages) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId,
        status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
        checkinDate: { lte: endDate },
        checkoutDate: { gte: startDate },
      },
      select: { checkinDate: true, checkoutDate: true, status: true },
    });

    return { message: msg.partner.availabilitySuccess, data: bookings };
  }

  async createBooking(data: CreatePartnerBookingDto, msg: Messages) {
    const room = await this.prisma.room.findUnique({ where: { id: data.roomId } });
    if (!room) throw new NotFoundException(msg.rooms.notFound);

    const checkin = new Date(data.checkinDate);
    const checkout = new Date(data.checkoutDate);

    if (checkin >= checkout) {
      throw new BadRequestException(msg.bookings.checkoutBeforeCheckin);
    }

    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) throw new BadRequestException(msg.users.adminNotFound);

    const conflict = await this.prisma.booking.findFirst({
      where: {
        roomId: data.roomId,
        status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
        checkinDate: { lt: checkout },
        checkoutDate: { gt: checkin },
      },
    });
    if (conflict) throw new BadRequestException(msg.bookings.roomAlreadyBooked);

    const booking = await this.prisma.booking.create({
      data: {
        roomId: data.roomId,
        saleId: admin.id,
        checkinDate: checkin,
        checkoutDate: checkout,
        status: BookingStatus.HOLD,
        holdExpireAt: new Date(Date.now() + 30 * 60 * 1000),
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        notes: data.notes,
      },
    });

    return { message: msg.partner.bookingSuccess, data: booking };
  }

  async cancelBooking(bookingId: string, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException(msg.bookings.alreadyCancelled);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED },
    });

    return { message: msg.partner.cancelSuccess, data: updated };
  }
}
