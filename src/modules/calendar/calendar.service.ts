import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Messages } from '../../i18n';
import { ROLE, BOOKING_STATUS, CALENDAR_LOCK_STATUS, NOTIFICATION_TYPE, getEffectiveOwnerId, isSaleUnassigned } from '../../common/constants';
import { NotificationsService, PushMeta } from '../notifications/notifications.service';

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
  owner?: { phone: string | null } | null;
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
    owner: { select: { phone: true } },
  } as const;

  // ─── Property list for calendar sidebar ────────────────────────────────────

  async getProperties(
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    type?: number,
    filterOwnerId?: string,
  ) {
    const where: any = { isActive: true, deletedAt: null };

    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId) {
      where.ownerId = effectiveOwnerId;
    } else if (filterOwnerId) {
      where.ownerId = filterOwnerId;
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
    propertyIds?: string[],
  ) {
    const start = this.toUTCDate(startDate);
    const end = this.toUTCDate(endDate);
    this.assertRangeWithinLimit(start, end);

    const where: any = { isActive: true, deletedAt: null };
    // Hỗ trợ cả single (propertyId) và multi (propertyIds CSV); multi ưu tiên hơn.
    if (propertyIds && propertyIds.length > 0) {
      where.id = { in: propertyIds };
    } else if (propertyId) {
      where.id = propertyId;
    }
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
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    propertyId?: string,
    type?: number,
    propertyIds?: string[],
  ) {
    const start = this.toUTCDate(startDate);
    const end = this.toUTCDate(endDate);
    this.assertRangeWithinLimit(start, end);

    const where: any = { isActive: true, deletedAt: null };
    if (propertyIds && propertyIds.length > 0) {
      where.id = { in: propertyIds };
    } else if (propertyId) {
      where.id = propertyId;
    }
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId) {
      where.ownerId = effectiveOwnerId;
    }
    if (type !== undefined) where.type = type;

    const properties = await this.prisma.property.findMany({
      where,
      select: this.propertyGridSelect,
      orderBy: { name: 'asc' },
    });

    if ((propertyId || (propertyIds && propertyIds.length > 0)) && properties.length === 0) {
      throw new NotFoundException(msg.properties.notFound);
    }

    const grid = await this.buildGrid(properties, start, end, true);

    return { message: msg.calendar.gridSuccess, data: { properties: grid } };
  }

  // ─── Lock / Unlock / Sold ──────────────────────────────────────────────────

  /** PushMeta cho sự kiện lịch — deep link tới màn property (nơi có lịch). */
  private calendarPush(pushType: string, propertyId: string): PushMeta {
    return { pushType, deepLink: `/host/properties/${propertyId}` };
  }

  async lockDate(
    propertyId: string,
    date: string,
    status: number | undefined,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    opts?: { skipNotify?: boolean },
  ) {
    if (isSaleUnassigned(user)) {
      throw new BadRequestException(msg.users.saleNotAssigned);
    }
    const property = await this.getPropertyWithAccess(propertyId, user, msg);
    const lockDate = this.toUTCDate(date);

    const existingLock = await this.prisma.calendarLock.findFirst({
      where: { propertyId, date: lockDate },
    });
    if (existingLock) {
      throw new BadRequestException(msg.calendar.dateAlreadyLocked);
    }

    const nextDay = new Date(lockDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
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

    if (!opts?.skipNotify) {
      await this.notifications.notifyPropertyTeam(
        propertyId,
        user.id,
        'Ngày đã bị khóa',
        `${property.name} (${property.code}): ngày ${date} đã được khóa`,
        NOTIFICATION_TYPE.SYSTEM,
        propertyId,
        'property',
        this.calendarPush('calendar_locked', propertyId),
      );
    }

    return { message: msg.calendar.lockSuccess, data: lock };
  }

  async unlockDate(
    propertyId: string,
    date: string,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    opts?: { skipNotify?: boolean },
  ) {
    if (isSaleUnassigned(user)) {
      throw new BadRequestException(msg.users.saleNotAssigned);
    }
    const property = await this.getPropertyWithAccess(propertyId, user, msg);
    const lockDate = this.toUTCDate(date);

    const lock = await this.prisma.calendarLock.findFirst({
      where: { propertyId, date: lockDate },
    });
    if (!lock) throw new NotFoundException(msg.calendar.lockNotFound);

    await this.prisma.calendarLock.delete({ where: { id: lock.id } });

    if (!opts?.skipNotify) {
      await this.notifications.notifyPropertyTeam(
        propertyId,
        user.id,
        'Ngày đã mở khóa',
        `${property.name} (${property.code}): ngày ${date} đã được mở khóa`,
        NOTIFICATION_TYPE.SYSTEM,
        propertyId,
        'property',
        this.calendarPush('calendar_unlocked', propertyId),
      );
    }

    return { message: msg.calendar.unlockSuccess, data: null };
  }

  async markSold(
    propertyId: string,
    date: string,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    if (isSaleUnassigned(user)) {
      throw new BadRequestException(msg.users.saleNotAssigned);
    }
    const property = await this.getPropertyWithAccess(propertyId, user, msg);
    const lockDate = this.toUTCDate(date);

    const existingLock = await this.prisma.calendarLock.findFirst({
      where: { propertyId, date: lockDate },
    });

    if (existingLock) {
      const updated = await this.prisma.calendarLock.update({
        where: { id: existingLock.id },
        data: { status: CALENDAR_LOCK_STATUS.BOOKED },
      });
      await this.notifications.notifyPropertyTeam(
        propertyId,
        user.id,
        'Ngày đánh dấu đã bán',
        `${property.name} (${property.code}): ngày ${date} được đánh dấu đã bán`,
        NOTIFICATION_TYPE.BOOKING,
        propertyId,
        'property',
        this.calendarPush('calendar_sold', propertyId),
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

    await this.notifications.notifyPropertyTeam(
      propertyId,
      user.id,
      'Ngày đánh dấu đã bán',
      `${property.name} (${property.code}): ngày ${date} được đánh dấu đã bán`,
      NOTIFICATION_TYPE.BOOKING,
      propertyId,
      'property',
      this.calendarPush('calendar_sold', propertyId),
    );

    return { message: msg.calendar.soldSuccess, data: lock };
  }

  // ─── Bulk lock/unlock ──────────────────────────────────────────────────────

  /**
   * Bulk lock or unlock multiple property-date pairs in one request.
   * Skips items that violate constraints (already locked / has booking / not found)
   * and returns per-item result so FE can show partial success.
   */
  async bulkUpdate(
    mode: 'lock' | 'unlock',
    items: Array<{ propertyId: string; date: string }>,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    if (!items || items.length === 0) {
      throw new BadRequestException(msg.calendar.bulkEmpty);
    }
    if (items.length > 100) {
      throw new BadRequestException(msg.calendar.bulkTooMany);
    }
    if (isSaleUnassigned(user)) {
      throw new BadRequestException(msg.users.saleNotAssigned);
    }

    // Xử lý song song thay vì tuần tự — mỗi item độc lập, giữ nguyên thứ tự kết quả.
    // skipNotify: bỏ notify per-item, tránh 100 DB row + 100 push khi bulk. Gộp 1 lần ở dưới.
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          if (mode === 'lock') {
            await this.lockDate(item.propertyId, item.date, undefined, user, msg, { skipNotify: true });
          } else {
            await this.unlockDate(item.propertyId, item.date, user, msg, { skipNotify: true });
          }
          return { propertyId: item.propertyId, date: item.date, ok: true } as const;
        } catch (err: any) {
          return {
            propertyId: item.propertyId,
            date: item.date,
            ok: false,
            error: err?.message ?? 'failed',
          } as const;
        }
      }),
    );

    // Gộp thông báo theo property → 1 notification/push cho cả team mỗi phòng (dù bulk cả trăm ngày).
    const countByProperty = new Map<string, number>();
    for (const r of results) {
      if (r.ok) countByProperty.set(r.propertyId, (countByProperty.get(r.propertyId) ?? 0) + 1);
    }
    const verb = mode === 'lock' ? 'khoá' : 'mở khoá';
    const pushType = mode === 'lock' ? 'calendar_bulk_locked' : 'calendar_bulk_unlocked';

    // Lấy tên/mã phòng 1 lần cho các property có thay đổi → message nói rõ phòng nào.
    const propIds = Array.from(countByProperty.keys());
    const props = propIds.length
      ? await this.prisma.property.findMany({
          where: { id: { in: propIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const propMap = new Map(props.map((p) => [p.id, p]));

    await Promise.all(
      Array.from(countByProperty.entries()).map(([propertyId, count]) => {
        const p = propMap.get(propertyId);
        const label = p ? `${p.name} (${p.code})` : 'Phòng';
        return this.notifications.notifyPropertyTeam(
          propertyId,
          user.id,
          'Cập nhật lịch hàng loạt',
          `${label}: ${count} ngày đã được ${verb}`,
          NOTIFICATION_TYPE.SYSTEM,
          propertyId,
          'property',
          this.calendarPush(pushType, propertyId),
        );
      }),
    );

    const succeeded = results.filter((r) => r.ok).length;
    return {
      message: msg.calendar.bulkSuccess(mode, succeeded, results.length),
      data: { mode, total: results.length, succeeded, failed: results.length - succeeded, results },
    };
  }

  // ─── Admin Contact ─────────────────────────────────────────────────────────

  async getAdminContact(msg: Messages) {
    const admin = await this.prisma.user.findFirst({
      where: { role: ROLE.ADMIN, isActive: true, deletedAt: null },
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

  /** Normalize any Date/string to 'YYYY-MM-DD' (timezone-safe) */
  private toDateStr(d: Date | string): string {
    if (typeof d === 'string') return d.split('T')[0];
    // Use UTC components to avoid timezone offset
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** Parse 'YYYY-MM-DD' → UTC midnight Date */
  private toUTCDate(dateStr: string): Date {
    const d = new Date(dateStr.split('T')[0] + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    return d;
  }

  /** Chặn range quá dài để tránh build mảng days khổng lồ → block event-loop */
  private assertRangeWithinLimit(start: Date, end: Date) {
    if (end <= start) {
      throw new BadRequestException('endDate must be after startDate');
    }
    const MAX_DAYS = 92; // ~3 tháng
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
    if (diffDays > MAX_DAYS) {
      throw new BadRequestException(`Date range too large (max ${MAX_DAYS} days)`);
    }
  }

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

    // Group locks by propertyId → Map<dateStr, status>
    const locksByProp = new Map<string, Map<string, number>>();
    for (const lock of locks) {
      if (!locksByProp.has(lock.propertyId)) {
        locksByProp.set(lock.propertyId, new Map());
      }
      locksByProp.get(lock.propertyId)!.set(
        this.toDateStr(lock.date),
        lock.status,
      );
    }

    // Pre-compute booking date strings for timezone-safe comparison
    const bookingsWithStr = bookings.map(b => ({
      ...b,
      checkinStr: this.toDateStr(b.checkinDate),
      checkoutStr: this.toDateStr(b.checkoutDate),
    }));

    const bookingsByProp = new Map<string, typeof bookingsWithStr>();
    for (const b of bookingsWithStr) {
      const list = bookingsByProp.get(b.propertyId) || [];
      list.push(b);
      bookingsByProp.set(b.propertyId, list);
    }

    return properties.map(property => {
      const propBookings = bookingsByProp.get(property.id) || [];
      const propLocks = locksByProp.get(property.id) || new Map<string, number>();

      const days: { date: string; price: number; status: string; note?: string }[] = [];
      const current = new Date(start);

      while (current <= end) {
        const dateStr = this.toDateStr(current);
        const dayOfWeek = current.getUTCDay();

        let price = property.weekdayPrice || 0;
        if (dayOfWeek === 5 || dayOfWeek === 6) price = property.weekendPrice || price;

        let status = 'available';
        let note: string | undefined;

        if (propLocks.has(dateStr)) {
          const lockStatus = propLocks.get(dateStr)!;
          if (lockStatus === CALENDAR_LOCK_STATUS.BOOKED) {
            status = 'booked';
          } else if (lockStatus === CALENDAR_LOCK_STATUS.HOLD) {
            status = 'hold';
          } else {
            status = 'locked';
          }
        }

        if (status === 'available') {
          for (const booking of propBookings) {
            // Compare date strings: checkin <= date < checkout (checkout excluded)
            if (dateStr >= booking.checkinStr && dateStr < booking.checkoutStr) {
              status = booking.status === BOOKING_STATUS.CONFIRMED ? 'booked' : 'hold';
              if (includeNote) note = booking.customerName || undefined;
              break;
            }
          }
        }

        days.push({ date: dateStr, price, status, ...(note ? { note } : {}) });
        current.setUTCDate(current.getUTCDate() + 1);
      }

      return {
        id: property.id,
        code: property.code,
        name: property.name,
        type: property.type,
        view: property.view,
        address: property.address,
        ownerPhone: property.owner?.phone ?? null,
        days,
      };
    });
  }

  private async getPropertyWithAccess(
    propertyId: string,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, isActive: true, name: true, code: true },
    });
    if (!property || !property.isActive) throw new NotFoundException(msg.calendar.propertyNotFound);

    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId && property.ownerId !== effectiveOwnerId) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    return property;
  }
}
