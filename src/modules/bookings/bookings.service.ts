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
import { ROLE, BOOKING_STATUS, CALENDAR_LOCK_STATUS, NOTIFICATION_TYPE, AUDIT_ACTION, AUDIT_TARGET_TYPE, getEffectiveOwnerId, isSaleUnassigned } from '../../common/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../email/email.service';

const STAFF_HOLD_DURATION_SECONDS = 1800; // 30 phút
const CUSTOMER_HOLD_DURATION_SECONDS = 86400; // 24 giờ
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
    private email: EmailService,
  ) {}

  // ─── Staff/Admin Methods ──────────────────────────────────────────────────

  async findAll(
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    propertyId?: string,
    status?: number,
    page?: number,
    limit?: number,
  ) {
    const where: any = {};

    if (propertyId) where.propertyId = propertyId;
    if (status !== undefined) where.status = status;

    // Scope by property ownership
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId) {
      where.property = { ownerId: effectiveOwnerId };
    }

    const take = Math.min(Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const currentPage = Math.max(1, Number(page) || 1);
    const skip = (currentPage - 1) * take;

    const [bookings, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
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
        take,
        skip,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const bookingsWithExtras = bookings.map((booking) => {
      let holdRemainingSeconds = 0;
      if (booking.status === BOOKING_STATUS.HOLD && booking.holdExpireAt) {
        holdRemainingSeconds = Math.max(0, Math.floor((booking.holdExpireAt.getTime() - Date.now()) / 1000));
      }
      // Flatten denorm fields cho FE: propertyName + nights
      const propertyName = booking.property?.name ?? null;
      const nights = this.calcNights(booking.checkinDate, booking.checkoutDate);
      return { ...booking, holdRemainingSeconds, propertyName, nights };
    });

    return {
      message: msg.bookings.listSuccess,
      data: bookingsWithExtras,
      meta: { total, page: currentPage, limit: take },
    };
  }

  /** Tính số đêm giữa checkin và checkout (UTC date diff). */
  private calcNights(checkin: Date, checkout: Date): number {
    const ms = checkout.getTime() - checkin.getTime();
    return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
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
      data: {
        ...booking,
        holdRemainingSeconds,
        propertyName: booking.property?.name ?? null,
        nights: this.calcNights(booking.checkinDate, booking.checkoutDate),
      },
    };
  }

  /** Parse 'YYYY-MM-DD' → UTC midnight Date */
  private toUTCDate(dateStr: string): Date {
    const d = new Date(dateStr.split('T')[0] + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    return d;
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

    const holdExpireAt = new Date(Date.now() + STAFF_HOLD_DURATION_SECONDS * 1000);

    // Wrap conflict-check + holds-cancel + create trong 1 transaction Serializable
    // để tránh race condition double-booking khi 2 request concurrent.
    const { booking, cancelledHoldIds } = await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          propertyId,
          status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
          checkinDate: { lt: checkout },
          checkoutDate: { gt: checkin },
        },
      });
      if (conflict) {
        if (conflict.status === BOOKING_STATUS.CONFIRMED) {
          throw new BadRequestException(msg.bookings.propertyAlreadyBooked);
        }
        if (conflict.saleId !== user.id) {
          const holdRemaining = conflict.holdExpireAt
            ? Math.max(0, Math.ceil((conflict.holdExpireAt.getTime() - Date.now()) / 60000))
            : 30;
          throw new BadRequestException(msg.bookings.propertyOnHold(holdRemaining));
        }
      }

      const lockConflict = await tx.calendarLock.findFirst({
        where: { propertyId, date: { gte: checkin, lt: checkout } },
      });
      if (lockConflict) {
        throw new BadRequestException(msg.bookings.dateLocked);
      }

      const overlappingHolds = await tx.booking.findMany({
        where: {
          propertyId,
          status: BOOKING_STATUS.HOLD,
          checkinDate: { lt: checkout },
          checkoutDate: { gt: checkin },
        },
        select: { id: true },
      });
      if (overlappingHolds.length > 0) {
        await tx.booking.updateMany({
          where: { id: { in: overlappingHolds.map((h) => h.id) } },
          data: {
            status: BOOKING_STATUS.CANCELLED,
            cancelledAt: new Date(),
            cancelledByUserId: user.id,
            cancelledByRole: user.role,
            cancelledReason: 'Auto-cancel: new staff hold overrides previous hold',
          },
        });
      }

      const created = await tx.booking.create({
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

      return { booking: created, cancelledHoldIds: overlappingHolds.map((h) => h.id) };
    });

    // Side-effects ngoài transaction: Redis + notifications fire-and-forget
    await this.redis.setHold(booking.id, STAFF_HOLD_DURATION_SECONDS);
    void Promise.all(cancelledHoldIds.map((id) => this.redis.delHold(id))).catch(() => undefined);

    void this.notifications.notifyPropertyOwner(
      propertyId,
      'Booking mới — Giữ chỗ',
      `${booking.property.name} (${booking.property.code}) được giữ chỗ bởi ${booking.sale?.name || 'Staff'}`,
      NOTIFICATION_TYPE.BOOKING,
      booking.id,
      'booking',
      { pushType: 'booking_created', deepLink: `/bookings/${booking.id}` },
    ).catch(() => undefined);

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

    await this.redis.delHold(id);

    // Notify owner + customer
    void this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Booking được xác nhận',
      `${confirmed.property.name} (${confirmed.property.code}) — booking đã xác nhận`,
      NOTIFICATION_TYPE.BOOKING,
      id,
      'booking',
      { pushType: 'booking_confirmed', deepLink: `/bookings/${id}` },
    ).catch(() => undefined);
    if (booking.customerId) {
      void this.notifications.notifyUser(
        booking.customerId,
        'Đặt phòng được xác nhận',
        `Phòng ${confirmed.property.name} đã được xác nhận`,
        NOTIFICATION_TYPE.BOOKING,
        id,
        'booking',
        { pushType: 'booking_confirmed', deepLink: '/my-bookings' },
      ).catch(() => undefined);
    }

    return { message: msg.bookings.confirmSuccess, data: confirmed };
  }

  async markPaid(
    id: string,
    amount: number | undefined,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: { select: { id: true, name: true, code: true, ownerId: true } } },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    this.checkBookingAccess(booking, user, msg);

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      throw new BadRequestException(msg.bookings.alreadyCancelled);
    }

    const paidAmount = amount ?? booking.totalAmount ?? booking.depositAmount ?? 0;
    if (paidAmount <= 0) {
      throw new BadRequestException(msg.bookings.paidAmountRequired);
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        paidAmount,
        paidAt: new Date(),
        // Nếu booking vẫn ở HOLD, chuyển luôn sang CONFIRMED
        status:
          booking.status === BOOKING_STATUS.HOLD ? BOOKING_STATUS.CONFIRMED : booking.status,
        holdExpireAt: null,
      },
      include: { property: { select: { id: true, name: true, code: true } } },
    });

    await this.redis.delHold(id);

    void this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Booking đã thu tiền',
      `${updated.property.name} (${updated.property.code}) — đã ghi nhận ${paidAmount.toLocaleString('vi-VN')} đ`,
      NOTIFICATION_TYPE.PAYMENT,
      id,
      'booking',
      { pushType: 'booking_paid', deepLink: `/bookings/${id}` },
    ).catch(() => undefined);
    if (booking.customerId) {
      void this.notifications.notifyUser(
        booking.customerId,
        'Đã nhận thanh toán',
        `Booking ${updated.property.name} đã được ghi nhận thanh toán.`,
        NOTIFICATION_TYPE.PAYMENT,
        id,
        'booking',
        { pushType: 'booking_paid', deepLink: '/my-bookings' },
      ).catch(() => undefined);
    }

    void this.auditLog.log({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT_ACTION.BOOKING_MARK_PAID,
      targetType: AUDIT_TARGET_TYPE.BOOKING,
      targetId: id,
      targetLabel: `${updated.property.name} (${updated.property.code})`,
      metadata: { amount: paidAmount, previousStatus: booking.status },
    });

    return { message: msg.bookings.markPaidSuccess, data: updated };
  }

  async cancelBooking(
    id: string,
    reason: string | undefined,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            ownerId: true,
            name: true,
            code: true,
            owner: { select: { name: true, phone: true } },
          },
        },
        customer: { select: { email: true, name: true } },
      },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    this.checkBookingAccess(booking, user, msg);

    if (booking.status === BOOKING_STATUS.CANCELLED) {
      throw new BadRequestException(msg.bookings.alreadyCancelled);
    }

    await this.prisma.booking.update({
      where: { id },
      data: {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: user.id,
        cancelledByRole: user.role,
        cancelledReason: reason ?? null,
      },
    });

    await this.redis.delHold(id);

    const propLabel = `${booking.property.name} (${booking.property.code})`;

    // Notify owner + customer (if any)
    void this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Booking đã bị hủy',
      `${propLabel} — booking đã hủy`,
      NOTIFICATION_TYPE.BOOKING,
      id,
      'booking',
      { pushType: 'booking_cancelled', deepLink: `/bookings/${id}` },
    ).catch(() => undefined);
    if (booking.customerId) {
      const subtitle = reason
        ? `${booking.property.name} đã được huỷ — ${reason}`
        : `${booking.property.name} đã được huỷ`;
      void this.notifications.notifyUser(
        booking.customerId,
        'Đặt phòng đã huỷ',
        subtitle,
        NOTIFICATION_TYPE.BOOKING,
        id,
        'booking',
        { pushType: 'booking_cancelled', deepLink: '/my-bookings' },
      ).catch(() => undefined);
    }

    // Email customer (if we have one)
    const customerEmail = booking.customer?.email;
    if (customerEmail) {
      void this.email
        .sendBookingCancelled({
          to: customerEmail,
          customerName: booking.customer?.name ?? booking.customerName ?? 'Quý khách',
          propertyName: booking.property.name,
          propertyCode: booking.property.code,
          checkinDate: booking.checkinDate,
          checkoutDate: booking.checkoutDate,
          reason: reason ?? null,
          ownerName: booking.property.owner?.name ?? null,
          ownerPhone: booking.property.owner?.phone ?? null,
        })
        .catch(() => undefined);
    }

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

    const holdExpireAt = new Date(Date.now() + CUSTOMER_HOLD_DURATION_SECONDS * 1000);

    const booking = await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
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

      const lockConflict = await tx.calendarLock.findFirst({
        where: { propertyId, date: { gte: checkin, lt: checkout } },
      });
      if (lockConflict) {
        throw new ConflictException(msg.bookings.dateLocked);
      }

      return tx.booking.create({
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
    });

    // Fire-and-forget side effects
    void (async () => {
      try {
        const customer = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
        void this.notifications.notifyPropertyOwner(
          propertyId,
          'Khách đặt phòng mới',
          `${booking.property.name} (${booking.property.code}) — khách ${customer?.name || 'Ẩn danh'} giữ chỗ`,
          NOTIFICATION_TYPE.BOOKING,
          booking.id,
          'booking',
          { pushType: 'booking_created', deepLink: `/bookings/${booking.id}` },
        );
      } catch {
        /* noop */
      }
    })();

    return {
      message: msg.bookings.customerHoldSuccess,
      data: { ...booking, holdRemainingSeconds: CUSTOMER_HOLD_DURATION_SECONDS },
    };
  }

  async getMyBookings(
    user: { id: string; role: number },
    msg: Messages,
    status?: number,
    page?: number,
    limit?: number,
  ) {
    const where: any = { customerId: user.id };
    if (status !== undefined) {
      where.status = status;
    }

    const take = Math.min(Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const currentPage = Math.max(1, Number(page) || 1);
    const skip = (currentPage - 1) * take;

    const [bookings, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
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
        take,
        skip,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const bookingsWithHoldTtl = bookings.map((booking) => {
      let holdRemainingSeconds = 0;
      if (booking.status === BOOKING_STATUS.HOLD && booking.holdExpireAt) {
        holdRemainingSeconds = Math.max(0, Math.floor((booking.holdExpireAt.getTime() - Date.now()) / 1000));
      }
      return { ...booking, holdRemainingSeconds };
    });

    return {
      message: msg.bookings.myListSuccess,
      data: bookingsWithHoldTtl,
      meta: { total, page: currentPage, limit: take },
    };
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
      data: {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: user.id,
        cancelledByRole: user.role,
      },
      include: { property: { select: { name: true, code: true } } },
    });

    await this.redis.delHold(id);

    // Notify owner
    void this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Khách hủy đặt phòng',
      `${cancelled.property.name} (${cancelled.property.code}) — khách đã hủy giữ chỗ`,
      NOTIFICATION_TYPE.BOOKING,
      id,
      'booking',
      { pushType: 'booking_cancelled', deepLink: `/bookings/${id}` },
    ).catch(() => undefined);

    return { message: msg.bookings.customerCancelSuccess, data: null };
  }

  // ─── Cron Job ─────────────────────────────────────────────────────────────

  /**
   * Calendar grid cho 1 property theo year + month.
   * Trả mỗi ngày: status (available/locked/hold/booked) + bookingId + customerName.
   * Scope theo getEffectiveOwnerId — SALE chỉ thấy property của OWNER mình.
   */
  async getCalendarForProperty(
    propertyId: string,
    year: number,
    month: number,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: { id: true, name: true, code: true, ownerId: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId && property.ownerId !== effectiveOwnerId) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    // Range: ngày đầu tháng → ngày đầu tháng kế (UTC)
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(year, month, 0).getDate();

    const [bookings, locks] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          propertyId,
          status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
          checkinDate: { lt: end },
          checkoutDate: { gt: start },
        },
        select: {
          id: true, checkinDate: true, checkoutDate: true, status: true,
          customerName: true, customer: { select: { name: true } },
        },
      }),
      this.prisma.calendarLock.findMany({
        where: { propertyId, date: { gte: start, lt: end } },
      }),
    ]);

    const days: any[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(Date.UTC(year, month - 1, d));
      const dateStr = date.toISOString().slice(0, 10);

      let status: 'available' | 'locked' | 'hold' | 'booked' = 'available';
      let bookingId: string | null = null;
      let note: string | null = null;

      const lock = locks.find((l) => l.date.toISOString().slice(0, 10) === dateStr);
      if (lock) {
        status = 'locked';
      }

      const booking = bookings.find(
        (b) => b.checkinDate <= date && b.checkoutDate > date,
      );
      if (booking) {
        status = booking.status === BOOKING_STATUS.CONFIRMED ? 'booked' : 'hold';
        bookingId = booking.id;
        note = booking.customer?.name || booking.customerName || null;
      }

      days.push({ date: dateStr, status, bookingId, note });
    }

    return {
      message: msg.bookings.listSuccess,
      data: {
        property: { id: property.id, name: property.name, code: property.code },
        year,
        month,
        days,
      },
    };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireHoldBookings() {
    const now = new Date();

    // Lấy id trước cho mục đích cleanup Redis, nhưng update là atomic 1 query
    // với điều kiện status=HOLD + holdExpireAt<=now → không race với confirm.
    const expired = await this.prisma.booking.findMany({
      where: { status: BOOKING_STATUS.HOLD, holdExpireAt: { lte: now } },
      select: { id: true },
    });

    if (expired.length === 0) return 0;

    const result = await this.prisma.booking.updateMany({
      where: {
        id: { in: expired.map((b) => b.id) },
        status: BOOKING_STATUS.HOLD,
        holdExpireAt: { lte: now },
      },
      data: {
        status: BOOKING_STATUS.CANCELLED,
        cancelledAt: now,
        cancelledReason: 'Auto-cancel: hold expired',
        // cancelledByUserId/Role intentionally null = system/cron
      },
    });

    await Promise.all(expired.map((b) => this.redis.delHold(b.id).catch(() => undefined)));

    return result.count;
  }

  /**
   * Mark NO_SHOW: booking CONFIRMED đã qua checkoutDate > 24h mà không có paidAt
   * (proxy cho "khách không đến + không hoàn tất thanh toán tại chỗ").
   * Chạy mỗi ngày 03:30 (giờ server, sau khi đêm trước đã đóng sổ).
   */
  @Cron('30 3 * * *')
  async markNoShowBookings() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();
    const result = await this.prisma.booking.updateMany({
      where: {
        status: BOOKING_STATUS.CONFIRMED,
        checkoutDate: { lt: cutoff },
        paidAt: null,
      },
      data: {
        status: BOOKING_STATUS.NO_SHOW,
        noShowMarkedAt: now,
      },
    });
    return result.count;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private checkBookingAccess(booking: any, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId && booking.property?.ownerId !== effectiveOwnerId) {
      throw new ForbiddenException(msg.bookings.forbiddenAccess);
    }
  }
}
