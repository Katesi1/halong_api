import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Messages } from '../../i18n';
import { BookingStatus, Role } from '@prisma/client';

@Injectable()
export class CalendarService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getPropertyGroups(
    user: { id: string; role: Role },
    msg: Messages,
    category?: string,
    ownerId?: string,
  ) {
    const where: any = { isActive: true };

    // STAFF chỉ thấy property của mình
    if (user.role === Role.STAFF) {
      where.ownerId = user.id;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    // If category filter, filter rooms by type
    const roomWhere: any = { isActive: true };
    if (category) roomWhere.type = category;

    const properties = await this.prisma.property.findMany({
      where,
      select: {
        id: true,
        name: true,
        _count: {
          select: { rooms: { where: roomWhere } },
        },
        rooms: {
          where: roomWhere,
          select: { type: true },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    const data = properties
      .filter((p) => p._count.rooms > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.rooms[0]?.type || null,
        roomCount: p._count.rooms,
      }));

    return { message: msg.calendar.propertyGroupsSuccess, data };
  }

  async getCalendarGrid(
    propertyGroupId: string,
    startDate: string,
    endDate: string,
    user: { id: string; role: Role },
    msg: Messages,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Kiểm tra quyền truy cập property
    const property = await this.prisma.property.findUnique({
      where: { id: propertyGroupId },
      select: { id: true, name: true, ownerId: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);
    if (user.role === Role.STAFF && property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    const rooms = await this.prisma.room.findMany({
      where: { propertyId: propertyGroupId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        price: true,
      },
      orderBy: { code: 'asc' },
    });

    // Get all bookings for these rooms in date range
    const roomIds = rooms.map((r) => r.id);
    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId: { in: roomIds },
        status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
        checkinDate: { lte: end },
        checkoutDate: { gte: start },
      },
      select: {
        roomId: true,
        checkinDate: true,
        checkoutDate: true,
        status: true,
      },
    });

    // Build day-by-day grid for each room
    const roomsData = rooms.map((room) => {
      const days: { date: string; price: number; status: string }[] = [];
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay();

        // Calculate price based on day of week
        let price = room.price?.weekdayPrice || 0;
        if (dayOfWeek === 5) price = room.price?.fridayPrice || price;
        else if (dayOfWeek === 6) price = room.price?.saturdayPrice || price;

        // Check booking status for this day
        let status = 'AVAILABLE';
        for (const booking of bookings) {
          if (
            booking.roomId === room.id &&
            current >= booking.checkinDate &&
            current < booking.checkoutDate
          ) {
            status = booking.status === BookingStatus.CONFIRMED ? 'BOOKED' : 'HOLD';
            break;
          }
        }

        days.push({ date: dateStr, price, status });
        current.setDate(current.getDate() + 1);
      }

      return { id: room.id, code: room.code, name: room.name, days };
    });

    return {
      message: msg.calendar.gridSuccess,
      data: {
        propertyGroup: { id: property.id, name: property.name },
        rooms: roomsData,
      },
    };
  }

  async lockRoom(
    roomId: string,
    date: string,
    user: { id: string; role: Role },
    msg: Messages,
  ) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { property: { select: { ownerId: true } } },
    });
    if (!room || !room.isActive) throw new NotFoundException(msg.calendar.roomNotFound);

    // STAFF chỉ lock phòng thuộc property của mình
    if (user.role === Role.STAFF && room.property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    const lockDate = new Date(date);
    const nextDay = new Date(lockDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Check if already booked/held
    const existing = await this.prisma.booking.findFirst({
      where: {
        roomId,
        status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
        checkinDate: { lt: nextDay },
        checkoutDate: { gt: lockDate },
      },
    });

    if (existing) {
      throw new BadRequestException(msg.calendar.dateAlreadyBooked);
    }

    // Create a HOLD booking for this date (no expiry — owner lock)
    const booking = await this.prisma.booking.create({
      data: {
        roomId,
        saleId: user.id,
        checkinDate: lockDate,
        checkoutDate: nextDay,
        status: BookingStatus.HOLD,
        notes: 'Owner lock',
      },
    });

    return { message: msg.calendar.lockSuccess, data: booking };
  }

  async unlockRoom(
    roomId: string,
    date: string,
    user: { id: string; role: Role },
    msg: Messages,
  ) {
    // Kiểm tra quyền sở hữu room
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { property: { select: { ownerId: true } } },
    });
    if (!room) throw new NotFoundException(msg.calendar.roomNotFound);

    if (user.role === Role.STAFF && room.property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    const lockDate = new Date(date);
    const nextDay = new Date(lockDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const booking = await this.prisma.booking.findFirst({
      where: {
        roomId,
        checkinDate: { lte: lockDate },
        checkoutDate: { gte: nextDay },
        status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
      },
    });

    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    if (booking.status === BookingStatus.CONFIRMED) {
      throw new BadRequestException(msg.calendar.cannotUnlockBooked);
    }

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.CANCELLED },
    });

    return { message: msg.calendar.unlockSuccess, data: null };
  }

  async getAdminContact(msg: Messages) {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      select: { name: true, phone: true },
    });

    const data = {
      name: admin?.name || this.configService.get('ADMIN_NAME', 'Admin Halong24h'),
      phone: admin?.phone || this.configService.get('ADMIN_PHONE', '0912345678'),
      zaloUrl: `https://zalo.me/${admin?.phone || this.configService.get('ADMIN_PHONE', '0912345678')}`,
    };

    return { message: msg.calendar.adminContactSuccess, data };
  }
}
