import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Messages } from '../../i18n';
import { ROLE, STAFF_ROLES, BOOKING_STATUS, CALENDAR_LOCK_STATUS, NOTIFICATION_TYPE } from '../../common/constants';
import { NotificationsService } from '../notifications/notifications.service';

interface GridProperty {
  id: string;
  name: string;
  type: number;
  code: string;
  view?: string | null;
  address?: string | null;
  weekdayPrice?: number | null;
  weekendPrice?: number | null;
  holidayPrice?: number | null;
}

@Injectable()
export class CalendarService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notifications: NotificationsService,
  ) {}

  private readonly propertyGridSelect = {
    id: true,
    name: true,
    type: true,
    code: true,
    view: true,
    address: true,
    ownerId: true,
    weekdayPrice: true,
    weekendPrice: true,
    holidayPrice: true,
  } as const;

  // ─── Property list for calendar sidebar ────────────────────────────────────

  async getProperties(
    user: { id: string; role: number },
    msg: Messages,
    type?: number,
    ownerId?: string,
  ) {
    const where: any = { isActive: true };

    if ((STAFF_ROLES as readonly number[]).includes(user.role)) {
      where.ownerId = user.id;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    if (type !== undefined) where.type = type;

    const properties = await this.prisma.property.findMany({
      where,
      select: { id: true, name: true, type: true, code: true, view: true, address: true },
      orderBy: { name: 'asc' },
    });

    return { message: msg.calendar.propertyListSuccess, data: properties };
  }

  // ─── Trang 1: Public grid (xem tất cả, không cần auth) ────────────────────

  async getPublicGrid(
    startDate: string,
    endDate: string,
    msg: Messages,
    propertyId?: string,
    type?: number,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const where: any = { isActive: true };
    if (propertyId) where.id = propertyId;
    if (type !== undefined) where.type = type;

    const properties = await this.prisma.property.findMany({
      where,
      select: this.propertyGridSelect,
      orderBy: { name: 'asc' },
    });

    const grid = await this.buildGrid(properties, start, end, false);

    return { message: msg.calendar.gridSuccess, data: { properties: grid } };
  }

  // ─── Trang 2: Management grid (cần auth, OWNER/SALE chỉ thấy của mình) ────

  async getCalendarGrid(
    startDate: string,
    endDate: string,
    user: { id: string; role: number },
    msg: Messages,
    propertyId?: string,
    type?: number,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const where: any = { isActive: true };
    if (propertyId) where.id = propertyId;
    if ((STAFF_ROLES as readonly number[]).includes(user.role)) {
      where.ownerId = user.id;
    }
    if (type !== undefined) where.type = type;

    const properties = await this.prisma.property.findMany({
      where,
      select: this.propertyGridSelect,
      orderBy: { name: 'asc' },
    });

    if (propertyId && properties.length === 0) {
      throw new NotFoundException(msg.properties.notFound);
    }

    const grid = await this.buildGrid(properties, start, end, true);

    return { message: msg.calendar.gridSuccess, data: { properties: grid } };
  }

  // ─── Lock / Unlock / Sold ──────────────────────────────────────────────────

  async lockDate(
    propertyId: string,
    date: string,
    status: number | undefined,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    await this.getPropertyWithAccess(propertyId, user, msg);
    const lockDate = new Date(date);

    const existingLock = await this.prisma.calendarLock.findFirst({
      where: { propertyId, date: lockDate },
    });
    if (existingLock) {
      throw new BadRequestException(msg.calendar.dateAlreadyLocked);
    }

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

    await this.notifications.notifyPropertyOwner(
      propertyId,
      'Ngày đã bị khóa',
      `Ngày ${date} đã được khóa trên lịch`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
    );

    return { message: msg.calendar.lockSuccess, data: lock };
  }

  async unlockDate(
    propertyId: string,
    date: string,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    await this.getPropertyWithAccess(propertyId, user, msg);
    const lockDate = new Date(date);

    const lock = await this.prisma.calendarLock.findFirst({
      where: { propertyId, date: lockDate },
    });
    if (!lock) throw new NotFoundException(msg.calendar.lockNotFound);

    await this.prisma.calendarLock.delete({ where: { id: lock.id } });

    await this.notifications.notifyPropertyOwner(
      propertyId,
      'Ngày đã mở khóa',
      `Ngày ${date} đã được mở khóa trên lịch`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
    );

    return { message: msg.calendar.unlockSuccess, data: null };
  }

  async markSold(
    propertyId: string,
    date: string,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    await this.getPropertyWithAccess(propertyId, user, msg);
    const lockDate = new Date(date);

    const existingLock = await this.prisma.calendarLock.findFirst({
      where: { propertyId, date: lockDate },
    });

    if (existingLock) {
      const updated = await this.prisma.calendarLock.update({
        where: { id: existingLock.id },
        data: { status: CALENDAR_LOCK_STATUS.BOOKED },
      });
      await this.notifications.notifyPropertyOwner(
        propertyId,
        'Ngày đánh dấu đã bán',
        `Ngày ${date} được đánh dấu đã bán`,
        NOTIFICATION_TYPE.BOOKING,
        propertyId,
        'property',
      );
      return { message: msg.calendar.soldSuccess, data: updated };
    }

    const lock = await this.prisma.calendarLock.create({
      data: {
        propertyId,
        date: lockDate,
        status: CALENDAR_LOCK_STATUS.BOOKED,
      },
    });

    await this.notifications.notifyPropertyOwner(
      propertyId,
      'Ngày đánh dấu đã bán',
      `Ngày ${date} được đánh dấu đã bán`,
      NOTIFICATION_TYPE.BOOKING,
      propertyId,
      'property',
    );

    return { message: msg.calendar.soldSuccess, data: lock };
  }

  // ─── Admin Contact ─────────────────────────────────────────────────────────

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

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private async buildGrid(
    properties: GridProperty[],
    start: Date,
    end: Date,
    includeNote: boolean,
  ) {
    const propertyIds = properties.map(p => p.id);

    if (propertyIds.length === 0) return [];

    const [bookings, locks] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          propertyId: { in: propertyIds },
          status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
          checkinDate: { lte: end },
          checkoutDate: { gte: start },
        },
        select: {
          propertyId: true,
          checkinDate: true,
          checkoutDate: true,
          status: true,
          customerName: true,
        },
      }),
      this.prisma.calendarLock.findMany({
        where: {
          propertyId: { in: propertyIds },
          date: { gte: start, lte: end },
        },
        select: { propertyId: true, date: true, status: true },
      }),
    ]);

    // Group by propertyId
    const bookingsByProp = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const list = bookingsByProp.get(b.propertyId) || [];
      list.push(b);
      bookingsByProp.set(b.propertyId, list);
    }

    const locksByProp = new Map<string, Map<string, number>>();
    for (const lock of locks) {
      if (!locksByProp.has(lock.propertyId)) {
        locksByProp.set(lock.propertyId, new Map());
      }
      locksByProp.get(lock.propertyId)!.set(
        lock.date.toISOString().split('T')[0],
        lock.status,
      );
    }

    return properties.map(property => {
      const propBookings = bookingsByProp.get(property.id) || [];
      const propLocks = locksByProp.get(property.id) || new Map<string, number>();

      const days: { date: string; price: number; status: string; note?: string }[] = [];
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const dayOfWeek = current.getDay();

        let price = property.weekdayPrice || 0;
        if (dayOfWeek === 5 || dayOfWeek === 6) price = property.weekendPrice || price;

        let status = 'available';
        let note: string | undefined;

        if (propLocks.has(dateStr)) {
          const lockStatus = propLocks.get(dateStr)!;
          status = lockStatus === CALENDAR_LOCK_STATUS.BOOKED ? 'booked' : 'locked';
        }

        if (status === 'available') {
          for (const booking of propBookings) {
            if (current >= booking.checkinDate && current < booking.checkoutDate) {
              status = booking.status === BOOKING_STATUS.CONFIRMED ? 'booked' : 'hold';
              if (includeNote) note = booking.customerName || undefined;
              break;
            }
          }
        }

        days.push({ date: dateStr, price, status, ...(note ? { note } : {}) });
        current.setDate(current.getDate() + 1);
      }

      return {
        id: property.id,
        code: property.code,
        name: property.name,
        type: property.type,
        view: property.view,
        address: property.address,
        days,
      };
    });
  }

  private async getPropertyWithAccess(
    propertyId: string,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, isActive: true },
    });
    if (!property || !property.isActive) throw new NotFoundException(msg.calendar.propertyNotFound);

    if ((STAFF_ROLES as readonly number[]).includes(user.role) && property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    return property;
  }
}
