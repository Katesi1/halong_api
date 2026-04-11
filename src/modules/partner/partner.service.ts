import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePartnerBookingDto } from './dto/create-partner-booking.dto';
import { Messages } from '../../i18n';
import { ROLE, BOOKING_STATUS } from '../../common/constants';

@Injectable()
export class PartnerService {
  constructor(private prisma: PrismaService) {}

  async getProperties(query: { page?: number; limit?: number; type?: number }, msg: Messages) {
    const { page = 1, limit = 20, type } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true, deletedAt: null };
    if (type !== undefined) where.type = type;

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        include: {
          images: { where: { isCover: true }, take: 1 },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      message: msg.partner.listSuccess,
      data: properties,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getPropertyDetail(id: string, msg: Messages) {
    const property = await this.prisma.property.findUnique({
      where: { id, isActive: true, deletedAt: null },
      include: {
        images: { orderBy: { order: 'asc' } },
      },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);
    return { message: msg.partner.getSuccess, data: property };
  }

  async getPropertyAvailability(propertyId: string, year: number, month: number, msg: Messages) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const bookings = await this.prisma.booking.findMany({
      where: {
        propertyId,
        status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
        checkinDate: { lte: endDate },
        checkoutDate: { gte: startDate },
      },
      select: { checkinDate: true, checkoutDate: true, status: true },
    });

    return { message: msg.partner.availabilitySuccess, data: bookings };
  }

  async createBooking(data: CreatePartnerBookingDto, msg: Messages) {
    const property = await this.prisma.property.findUnique({ where: { id: data.propertyId, deletedAt: null } });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    const checkin = new Date(data.checkinDate);
    const checkout = new Date(data.checkoutDate);

    if (checkin >= checkout) {
      throw new BadRequestException(msg.bookings.checkoutBeforeCheckin);
    }

    const admin = await this.prisma.user.findFirst({ where: { role: ROLE.ADMIN, deletedAt: null } });
    if (!admin) throw new BadRequestException(msg.users.adminNotFound);

    const conflict = await this.prisma.booking.findFirst({
      where: {
        propertyId: data.propertyId,
        status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
        checkinDate: { lt: checkout },
        checkoutDate: { gt: checkin },
      },
    });
    if (conflict) throw new BadRequestException(msg.bookings.propertyAlreadyBooked);

    const booking = await this.prisma.booking.create({
      data: {
        propertyId: data.propertyId,
        saleId: admin.id,
        checkinDate: checkin,
        checkoutDate: checkout,
        status: BOOKING_STATUS.HOLD,
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
    if (booking.status === BOOKING_STATUS.CANCELLED) {
      throw new BadRequestException(msg.bookings.alreadyCancelled);
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BOOKING_STATUS.CANCELLED },
    });

    return { message: msg.partner.cancelSuccess, data: updated };
  }
}
