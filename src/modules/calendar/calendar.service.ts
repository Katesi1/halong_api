import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Messages } from '../../i18n';
import { ROLE, BOOKING_STATUS, CALENDAR_LOCK_STATUS } from '../../common/constants';

@Injectable()
export class CalendarService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getProperties(
    user: { id: string; role: number },
    msg: Messages,
    type?: number,
    ownerId?: string,
  ) {
    const where: any = { isActive: true };

    if (user.role === ROLE.STAFF) {
      where.ownerId = user.id;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    if (type !== undefined) {
      where.type = type;
    }

    const properties = await this.prisma.property.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        code: true,
      },
      orderBy: { name: 'asc' },
    });

    return { message: msg.calendar.propertyListSuccess, data: properties };
  }

  async getCalendarGrid(
    propertyId: string,
    startDate: string,
    endDate: string,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, type: true, ownerId: true, weekdayPrice: true, weekendPrice: true, holidayPrice: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);
    if (user.role === ROLE.STAFF && property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    // Get bookings for this property in date range
    const bookings = await this.prisma.booking.findMany({
      where: {
        propertyId,
        status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
        checkinDate: { lte: end },
        checkoutDate: { gte: start },
      },
      select: {
        checkinDate: true,
        checkoutDate: true,
        status: true,
      },
    });

    // Get calendar locks for this property in date range
    const locks = await this.prisma.calendarLock.findMany({
      where: {
        propertyId,
        date: { gte: start, lte: end },
      },
      select: {
        date: true,
        status: true,
      },
    });

    // Build lock map by date string
    const lockMap = new Map<string, number>();
    for (const lock of locks) {
      lockMap.set(lock.date.toISOString().split('T')[0], lock.status);
    }

    // Build day-by-day grid
    const days: { date: string; price: number; status: string }[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();

      // Calculate price based on day of week
      let price = property.weekdayPrice || 0;
      if (dayOfWeek === 5 || dayOfWeek === 6) price = property.weekendPrice || price;

      // Determine status
      let status = 'available';

      // Check calendar locks first
      if (lockMap.has(dateStr)) {
        const lockStatus = lockMap.get(dateStr)!;
        status = lockStatus === CALENDAR_LOCK_STATUS.BOOKED ? 'booked' : 'locked';
      }

      // Check bookings (override if applicable)
      if (status === 'available') {
        for (const booking of bookings) {
          if (current >= booking.checkinDate && current < booking.checkoutDate) {
            status = booking.status === BOOKING_STATUS.CONFIRMED ? 'booked' : 'hold';
            break;
          }
        }
      }

      days.push({ date: dateStr, price, status });
      current.setDate(current.getDate() + 1);
    }

    return {
      message: msg.calendar.gridSuccess,
      data: {
        property: { id: property.id, name: property.name, type: property.type },
        properties: [{
          id: property.id,
          code: (property as any).code,
          name: property.name,
          days,
        }],
      },
    };
  }

  async lockDate(
    propertyId: string,
    date: string,
    status: number | undefined,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, isActive: true },
    });
    if (!property || !property.isActive) throw new NotFoundException(msg.calendar.propertyNotFound);

    if (user.role === ROLE.STAFF && property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    const lockDate = new Date(date);

    // Check if already locked
    const existingLock = await this.prisma.calendarLock.findFirst({
      where: { propertyId, date: lockDate },
    });
    if (existingLock) {
      throw new BadRequestException(msg.calendar.dateAlreadyLocked);
    }

    // Check if already booked
    const nextDay = new Date(lockDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        propertyId,
        status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
        checkinDate: { lt: nextDay },
        checkoutDate: { gt: lockDate },
      },
    });
    if (existingBooking) {
      throw new BadRequestException(msg.calendar.dateAlreadyLocked);
    }

    const lock = await this.prisma.calendarLock.create({
      data: {
        propertyId,
        date: lockDate,
        status: status ?? CALENDAR_LOCK_STATUS.LOCKED,
      },
    });

    return { message: msg.calendar.lockSuccess, data: lock };
  }

  async unlockDate(
    propertyId: string,
    date: string,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true },
    });
    if (!property) throw new NotFoundException(msg.calendar.propertyNotFound);

    if (user.role === ROLE.STAFF && property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    const lockDate = new Date(date);
    const lock = await this.prisma.calendarLock.findFirst({
      where: { propertyId, date: lockDate },
    });

    if (!lock) throw new NotFoundException(msg.calendar.lockNotFound);

    await this.prisma.calendarLock.delete({ where: { id: lock.id } });

    return { message: msg.calendar.unlockSuccess, data: null };
  }

  async getAdminContact(msg: Messages) {
    const admin = await this.prisma.user.findFirst({
      where: { role: ROLE.ADMIN, isActive: true },
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
