import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../config/redis.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { CustomerHoldBookingDto } from './dto/customer-hold-booking.dto';
import { Messages } from '../../i18n';
import { ROLE, BOOKING_STATUS, CALENDAR_LOCK_STATUS, NOTIFICATION_TYPE, AUDIT_ACTION, AUDIT_TARGET_TYPE, getEffectiveOwnerId, isSaleUnassigned } from '../../common/constants';
import { buildVietQrPayload, sanitizeTransferContent } from '../payment/helpers/vietqr.helper';
import { computeBookingPricing, resolveGuestCounts, type PropertyPricing } from './booking-pricing';

/** Mã hiển thị HL-XXXXXXXX cho khách đối chiếu khi liên hệ chủ nhà. */
function deriveBookingCode(id: string): string {
  return `HL-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/** Pick cover image URL from a property image list. */
function pickCoverImageUrl(images?: { imageUrl: string; isCover: boolean; order?: number }[] | null): string | null {
  if (!images || images.length === 0) return null;
  const cover = images.find((img) => img.isCover);
  return (cover ?? images[0]).imageUrl;
}
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { EmailService } from '../email/email.service';

const STAFF_HOLD_DURATION_SECONDS = 1800; // 30 phút
const CUSTOMER_HOLD_DURATION_SECONDS = 1800; // 30 phút (khách giữ chỗ tối đa 30 phút)

// Tỉ lệ cọc mặc định khi owner ghi nhận cọc (mark-paid) mà không nhập số tiền
// và booking chưa có depositAmount → tự động 50% totalAmount.
const DEFAULT_DEPOSIT_RATE = 0.5;

// Trạng thái "chiếm phòng" cho check trùng lịch + hiển thị calendar.
// Gồm COMPLETED vì owner check-in (v1.31) đưa booking sang COMPLETED ngay khi khách nhận phòng
// dù vẫn đang lưu trú — nếu bỏ, booking check-in sớm sẽ không chặn đặt trùng + hiện "trống" trên lịch.
// Booking đã trả phòng (COMPLETED, checkout đã qua) không overlap với đặt mới (checkin >= hôm nay) → an toàn.
const BLOCKING_BOOKING_STATUSES = [
  BOOKING_STATUS.HOLD,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.COMPLETED,
];
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** Việt Nam = UTC+7. Dùng để quy đổi ngày-lịch <-> instant khi so sánh mốc giờ VN. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
/**
 * Booking coi như hoàn thành sau 12h trưa (giờ VN) ngày trả phòng.
 * checkoutDate lưu dạng 00:00Z của ngày trả → mốc hoàn thành = checkoutDate + 12h - 7h = +5h.
 */
const COMPLETE_AFTER_CHECKOUT_MS = (12 - 7) * 60 * 60 * 1000; // 5h

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
    private email: EmailService,
    private config: ConfigService,
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
              id: true, name: true, slug: true, code: true, type: true,
              cancellationPolicy: true,
              weekdayPrice: true, weekendPrice: true, holidayPrice: true,
              adultSurcharge: true, childSurcharge: true,
              standardGuests: true, standardChildren: true,
              images: { where: { isCover: true }, take: 1, select: { id: true, imageUrl: true, isCover: true, order: true } },
              owner: { select: { id: true, name: true, phone: true, bankBin: true, bankName: true, bankAccountNumber: true, bankAccountName: true } },
            },
          },
          sale: { select: { id: true, name: true, phone: true } },
          review: { select: { id: true } },
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
      return this.toBookingResponse(booking, holdRemainingSeconds);
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

  /**
   * Enrich booking với các field FE customer-web cần:
   *  - code: HL-XXXXXXXX để khách đối chiếu
   *  - propertySlug, coverImageUrl: link + thumbnail
   *  - host: { name, phone } — phone CHỈ lộ khi status >= CONFIRMED (tránh leak trước khi cọc)
   *  - cancellationPolicy: 0/1/2 từ property
   *  - hasReview: đã review chưa
   *  - depositDeadlineAt: cho HOLD = holdExpireAt; cho CONFIRMED chưa có business rule → null
   *  - paymentInfo: thông tin chuyển khoản + VietQR động — CHỈ lộ khi CONFIRMED, chưa trả (paidAt null),
   *    owner đã cấu hình bank và booking có tiền cọc. Sinh QR từ buildVietQrPayload (không lưu ảnh).
   */
  private enrichBookingExtras(booking: any): {
    code: string;
    propertyName: string | null;
    propertySlug: string | null;
    coverImageUrl: string | null;
    host: { name: string | null; phone: string | null } | null;
    cancellationPolicy: number | null;
    hasReview: boolean;
    canReview: boolean;
    reviewUnlockAt: Date | null;
    depositDeadlineAt: Date | null;
    nights: number;
    paymentInfo: {
      amount: number;
      content: string;
      bank: { bin: string; name: string | null; accountNumber: string; accountName: string | null };
      qrPayload: string;
    } | null;
  } {
    const property = booking?.property;
    const owner = property?.owner;
    const isConfirmedOrBeyond =
      booking.status === BOOKING_STATUS.CONFIRMED ||
      booking.status === BOOKING_STATUS.COMPLETED;
    const host = owner
      ? {
          name: owner.name ?? null,
          phone: isConfirmedOrBeyond ? owner.phone ?? null : null,
        }
      : null;
    const depositDeadlineAt =
      booking.status === BOOKING_STATUS.HOLD ? booking.holdExpireAt ?? null : null;
    const code = deriveBookingCode(booking.id);
    // Đánh giá chỉ mở sau 12h trưa ngày trả phòng (checkout + 5h), dù booking COMPLETED sớm do check-in.
    const hasReview = Boolean(booking.review);
    const reviewUnlockAt = booking.checkoutDate
      ? new Date(booking.checkoutDate.getTime() + COMPLETE_AFTER_CHECKOUT_MS)
      : null;
    const canReview =
      booking.status === BOOKING_STATUS.COMPLETED &&
      !hasReview &&
      reviewUnlockAt != null &&
      Date.now() >= reviewUnlockAt.getTime();
    return {
      code,
      propertyName: property?.name ?? null,
      propertySlug: property?.slug ?? null,
      coverImageUrl: pickCoverImageUrl(property?.images),
      host,
      cancellationPolicy:
        typeof property?.cancellationPolicy === 'number'
          ? property.cancellationPolicy
          : null,
      hasReview,
      canReview,
      reviewUnlockAt,
      depositDeadlineAt,
      nights: this.calcNights(booking.checkinDate, booking.checkoutDate),
      paymentInfo: this.buildPaymentInfo(booking, owner, code),
    };
  }

  /**
   * Sinh thông tin chuyển khoản + VietQR cho khách trả cọc.
   * Trả null trừ khi: status=CONFIRMED, chưa thanh toán (paidAt null), owner đủ thông tin bank,
   * và booking có depositAmount > 0. Số tiền pre-fill vào QR = depositAmount; nội dung = mã booking.
   */
  private buildPaymentInfo(
    booking: any,
    owner: any,
    code: string,
  ): {
    amount: number;
    content: string;
    bank: { bin: string; name: string | null; accountNumber: string; accountName: string | null };
    qrPayload: string;
  } | null {
    if (booking.status !== BOOKING_STATUS.CONFIRMED) return null;
    if (booking.paidAt) return null;
    // Số tiền cọc hiện lên QR: (1) depositAmount đã set (staff hold) → (2) fallback
    // 50% totalAmount (khách tự đặt không có depositAmount) — đồng bộ với markPaid.
    const amount =
      booking.depositAmount ??
      (booking.totalAmount != null
        ? Math.round(booking.totalAmount * DEFAULT_DEPOSIT_RATE)
        : 0);
    if (amount <= 0) return null;
    const bin = owner?.bankBin;
    const accountNumber = owner?.bankAccountNumber;
    if (!bin || !accountNumber) return null;

    const content = sanitizeTransferContent(code);
    const qrPayload = buildVietQrPayload({ bankBin: bin, accountNumber, amount, content });
    return {
      amount,
      content,
      bank: {
        bin,
        name: owner?.bankName ?? null,
        accountNumber,
        accountName: owner?.bankAccountName ?? null,
      },
      qrPayload,
    };
  }

  /** Strip field bank của owner khỏi property — bank chỉ được lộ hợp lệ qua paymentInfo. */
  private stripOwnerBankFields(property: any): any {
    const owner = property?.owner;
    if (!owner) return property;
    const { bankBin, bankName, bankAccountNumber, bankAccountName, ...safeOwner } = owner;
    return { ...property, owner: safeOwner };
  }

  /**
   * Shape 1 booking cho response: enrich extras + gắn holdRemainingSeconds, đồng thời
   * loại field bank của owner khỏi property.owner. Bank (bankBin/số TK/…) CHỈ được lộ
   * qua paymentInfo khi status=CONFIRMED và chưa trả — không nằm raw trên mọi row.
   * enrichBookingExtras đọc bank từ booking GỐC nên paymentInfo vẫn dựng đúng.
   */
  private toBookingResponse(booking: any, holdRemainingSeconds: number): any {
    const extras = this.enrichBookingExtras(booking);
    const property = booking?.property
      ? this.stripOwnerBankFields(booking.property)
      : undefined;

    // priceBreakdown: tính lại từ giá phòng hiện tại (nếu select có field giá) để hiển thị
    // minh bạch. totalAmount ưu tiên giá trị đã persist ở DB (set lúc hold/confirm/PUT);
    // fallback breakdown.total nếu DB chưa có nhưng tính được.
    const breakdown = this.computePricing(booking, booking?.property);
    const totalAmount = booking?.totalAmount ?? breakdown?.total ?? null;
    const paidAmount = booking?.paidAmount ?? 0;
    const remainingAmount =
      totalAmount != null ? Math.max(0, totalAmount - paidAmount) : null;

    return {
      ...booking,
      ...(property !== undefined ? { property } : {}),
      holdRemainingSeconds,
      ...extras,
      totalAmount,
      paidAmount,
      remainingAmount,
      priceBreakdown: breakdown,
    };
  }

  /** PropertyPricing từ 1 property object (null-normalize). */
  private pricingFromProperty(property: any): PropertyPricing {
    return {
      weekdayPrice: property?.weekdayPrice ?? null,
      weekendPrice: property?.weekendPrice ?? null,
      holidayPrice: property?.holidayPrice ?? null,
      adultSurcharge: property?.adultSurcharge ?? null,
      childSurcharge: property?.childSurcharge ?? null,
      standardGuests: property?.standardGuests ?? null,
      standardChildren: property?.standardChildren ?? null,
    };
  }

  /** Tính pricing cho 1 booking + property. Trả null nếu thiếu giá hoặc thiếu field giá trong select. */
  private computePricing(booking: any, property: any) {
    if (property?.weekdayPrice === undefined) return null; // select không có field giá → bỏ qua breakdown
    const { adults, children } = resolveGuestCounts(booking);
    const { breakdown } = computeBookingPricing({
      checkin: new Date(booking.checkinDate),
      checkout: new Date(booking.checkoutDate),
      adults,
      children,
      pricing: this.pricingFromProperty(property),
    });
    return breakdown;
  }

  /** Field giá cần select khi cần tính totalAmount ở create/confirm/update. */
  private static readonly PRICING_SELECT = {
    weekdayPrice: true, weekendPrice: true, holidayPrice: true,
    adultSurcharge: true, childSurcharge: true,
    standardGuests: true, standardChildren: true,
  } as const;

  /** Tính totalAmount để persist. Trả null nếu property chưa cấu hình giá. */
  private computeTotalToPersist(
    property: any,
    checkin: Date,
    checkout: Date,
    guests: { adults?: number | null; children?: number | null; guestCount?: number | null },
  ): number | null {
    const { adults, children } = resolveGuestCounts(guests);
    return computeBookingPricing({
      checkin,
      checkout,
      adults,
      children,
      pricing: this.pricingFromProperty(property),
    }).totalAmount;
  }

  async findOne(id: string, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        property: {
          include: {
            images: { orderBy: { order: 'asc' }, take: 5 },
            owner: { select: { id: true, name: true, phone: true, bankBin: true, bankName: true, bankAccountNumber: true, bankAccountName: true } },
          },
        },
        sale: { select: { id: true, name: true, phone: true } },
        review: { select: { id: true } },
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
      data: this.toBookingResponse(booking, holdRemainingSeconds),
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

  /**
   * 00:00Z của ngày hôm nay theo lịch VN (UTC+7), cùng convention với toUTCDate.
   * Dùng để cho phép đặt phòng từ hôm nay trở đi (checkin >= hôm nay), chỉ chặn ngày đã qua.
   */
  private startOfTodayUtc(): Date {
    const vnNow = new Date(Date.now() + VN_OFFSET_MS);
    return new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()));
  }

  async holdProperty(dto: CreateBookingDto, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const { propertyId, checkinDate, checkoutDate } = dto;

    const checkin = this.toUTCDate(checkinDate);
    const checkout = this.toUTCDate(checkoutDate);
    if (checkin >= checkout) {
      throw new BadRequestException(msg.bookings.checkoutBeforeCheckin);
    }
    // Cho phép đặt từ hôm nay trở đi (checkin >= đầu ngày hôm nay VN), chỉ chặn ngày đã qua.
    if (checkin < this.startOfTodayUtc()) {
      throw new BadRequestException(msg.bookings.checkinInPast);
    }

    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || !property.isActive || property.deletedAt) throw new NotFoundException(msg.properties.notFound);

    // Staff hold chỉ có guestCount → coi là người lớn cho phụ thu (children=0).
    const totalAmount = this.computeTotalToPersist(property, checkin, checkout, {
      guestCount: dto.guestCount || 2,
    });

    const holdExpireAt = new Date(Date.now() + STAFF_HOLD_DURATION_SECONDS * 1000);

    // Wrap conflict-check + holds-cancel + create trong 1 transaction Serializable
    // để tránh race condition double-booking khi 2 request concurrent.
    const { booking, cancelledHoldIds } = await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          propertyId,
          status: { in: BLOCKING_BOOKING_STATUSES },
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
          totalAmount,
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
      include: { property: { select: { ownerId: true, ...BookingsService.PRICING_SELECT } } },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    this.checkBookingAccess(booking, user, msg);

    if (booking.status !== BOOKING_STATUS.HOLD) {
      throw new BadRequestException(msg.bookings.onlyConfirmHold);
    }

    // Tính lại totalAmount theo giá phòng hiện tại (giá có thể đổi từ lúc hold).
    const totalAmount = this.computeTotalToPersist(
      booking.property,
      booking.checkinDate,
      booking.checkoutDate,
      booking,
    );

    const confirmed = await this.prisma.booking.update({
      where: { id },
      data: { status: BOOKING_STATUS.CONFIRMED, holdExpireAt: null, totalAmount },
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
      include: {
        property: {
          select: {
            id: true, name: true, code: true, ownerId: true,
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

    // Ghi nhận tiền cọc. Ưu tiên: (1) amount owner nhập → (2) depositAmount đã set lúc tạo
    // → (3) tự động 50% totalAmount (khi có giá) → (4) 0 (báo lỗi thiếu giá).
    const autoDeposit =
      booking.totalAmount != null
        ? Math.round(booking.totalAmount * DEFAULT_DEPOSIT_RATE)
        : null;
    const paidAmount = amount ?? booking.depositAmount ?? autoDeposit ?? 0;
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

    // Email xác nhận cho khách (email account HOẶC email liên hệ trên form + SMTP cấu hình).
    // Fire-and-forget.
    const toEmail = booking.customer?.email ?? booking.customerEmail;
    if (toEmail) {
      const totalForEmail = booking.totalAmount ?? null;
      void this.email.sendBookingConfirmed({
        to: toEmail,
        customerName: booking.customer?.name ?? booking.customerName ?? 'Quý khách',
        propertyName: updated.property.name,
        propertyCode: updated.property.code,
        checkinDate: booking.checkinDate,
        checkoutDate: booking.checkoutDate,
        paidAmount,
        totalAmount: totalForEmail,
        depositAmount: booking.depositAmount ?? null,
        remainingAmount: totalForEmail != null ? Math.max(0, totalForEmail - paidAmount) : null,
        bookingCode: deriveBookingCode(id),
        ownerName: booking.property.owner?.name ?? null,
        ownerPhone: booking.property.owner?.phone ?? null,
      }).catch(() => undefined);
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

  /**
   * Khách gửi ảnh bill chuyển khoản cọc (POST /bookings/:id/deposit-proof).
   * Chỉ hợp lệ khi booking đã CONFIRMED và chưa ghi nhận thanh toán (paidAt null).
   * Lưu URL vào depositProofUrl + push owner để vào đối chiếu và ghi nhận cọc.
   */
  async submitDepositProof(
    id: string,
    proofUrl: string,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: { select: { id: true, name: true, code: true, ownerId: true } } },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    this.checkBookingAccess(booking, user, msg);

    if (booking.status !== BOOKING_STATUS.CONFIRMED || booking.paidAt) {
      throw new BadRequestException(msg.bookings.depositProofInvalidState);
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { depositProofUrl: proofUrl },
      include: { property: { select: { id: true, name: true, code: true } } },
    });

    void this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Khách đã gửi ảnh chuyển khoản',
      `${updated.property.name} (${updated.property.code}) — khách gửi bill cọc, vào xác nhận thu tiền`,
      NOTIFICATION_TYPE.PAYMENT,
      id,
      'booking',
      { pushType: 'booking_deposit_proof', deepLink: `/bookings/${id}` },
    ).catch(() => undefined);

    return { message: msg.bookings.depositProofSuccess, data: updated };
  }

  /**
   * Owner xác nhận khách nhận phòng + thu nốt tiền phòng → hoàn tất booking (PATCH /bookings/:id/checkin).
   * - Yêu cầu status=CONFIRMED.
   * - Ghi checkedInAt; cộng dồn thanh toán: paidAmount += (amount ?? phần còn lại) → set paidAt.
   * - Chuyển status=COMPLETED + completedAt (đây là mốc "Done" chủ động của owner; cron 12h trưa
   *   checkout vẫn là fallback cho booking owner không thao tác).
   */
  async checkIn(
    id: string,
    amount: number | undefined,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        property: {
          select: {
            id: true, name: true, code: true, ownerId: true,
            owner: { select: { name: true, phone: true } },
          },
        },
        customer: { select: { email: true, name: true } },
      },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    this.checkBookingAccess(booking, user, msg);

    if (booking.status !== BOOKING_STATUS.CONFIRMED) {
      throw new BadRequestException(msg.bookings.onlyCheckinConfirmed);
    }

    const prevPaid = booking.paidAmount ?? 0;
    // Thu nốt: amount tường minh → cộng dồn; nếu bỏ trống → thu cho đủ totalAmount (nếu có giá).
    const remaining =
      booking.totalAmount != null ? Math.max(0, booking.totalAmount - prevPaid) : 0;
    const collected = amount ?? remaining;
    const newPaid = prevPaid + collected;
    const now = new Date();

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        checkedInAt: now,
        paidAmount: newPaid,
        paidAt: booking.paidAt ?? now,
        status: BOOKING_STATUS.COMPLETED,
        completedAt: now,
      },
      include: { property: { select: { id: true, name: true, code: true } } },
    });

    void this.notifications.notifyPropertyOwner(
      booking.propertyId,
      'Booking hoàn tất',
      `${updated.property.name} (${updated.property.code}) — đã nhận phòng, tổng thu ${newPaid.toLocaleString('vi-VN')} đ`,
      NOTIFICATION_TYPE.BOOKING,
      id,
      'booking',
      { pushType: 'booking_completed', deepLink: `/bookings/${id}` },
    ).catch(() => undefined);
    if (booking.customerId) {
      void this.notifications.notifyUser(
        booking.customerId,
        'Đơn đặt phòng đã hoàn tất',
        `Cảm ơn bạn đã lưu trú tại ${updated.property.name}. Bạn có thể đánh giá căn phòng.`,
        NOTIFICATION_TYPE.BOOKING,
        id,
        'booking',
        { pushType: 'booking_completed', deepLink: '/my-bookings' },
      ).catch(() => undefined);
    }

    // Email hoàn tất cho khách (email account HOẶC email liên hệ trên form). Fire-and-forget.
    const toEmail = booking.customer?.email ?? booking.customerEmail;
    if (toEmail) {
      void this.email.sendBookingConfirmed({
        to: toEmail,
        customerName: booking.customer?.name ?? booking.customerName ?? 'Quý khách',
        propertyName: updated.property.name,
        propertyCode: updated.property.code,
        checkinDate: booking.checkinDate,
        checkoutDate: booking.checkoutDate,
        paidAmount: newPaid,
        totalAmount: booking.totalAmount ?? null,
        depositAmount: booking.depositAmount ?? null,
        remainingAmount: booking.totalAmount != null ? Math.max(0, booking.totalAmount - newPaid) : null,
        bookingCode: deriveBookingCode(id),
        ownerName: booking.property.owner?.name ?? null,
        ownerPhone: booking.property.owner?.phone ?? null,
      }).catch(() => undefined);
    }

    void this.auditLog.log({
      actorId: user.id,
      actorRole: user.role,
      action: AUDIT_ACTION.BOOKING_MARK_PAID,
      targetType: AUDIT_TARGET_TYPE.BOOKING,
      targetId: id,
      targetLabel: `${updated.property.name} (${updated.property.code})`,
      metadata: { checkin: true, collected, totalPaid: newPaid },
    });

    return { message: msg.bookings.checkinSuccess, data: updated };
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
      include: { property: { select: { ownerId: true, ...BookingsService.PRICING_SELECT } } },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);
    this.checkBookingAccess(booking, user, msg);

    // Sửa số khách → đổi phụ thu → tính lại totalAmount. guestCount override chỉ áp cho
    // booking không tách adults/children (staff); booking khách giữ nguyên adults/children.
    const totalAmount = this.computeTotalToPersist(
      booking.property,
      booking.checkinDate,
      booking.checkoutDate,
      { adults: booking.adults, children: booking.children, guestCount: dto.guestCount ?? booking.guestCount },
    );

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { ...dto, totalAmount },
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
    // Cho phép đặt từ hôm nay trở đi (checkin >= đầu ngày hôm nay VN), chỉ chặn ngày đã qua.
    if (checkin < this.startOfTodayUtc()) {
      throw new BadRequestException(msg.bookings.checkinInPast);
    }

    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property || !property.isActive || property.deletedAt) throw new NotFoundException(msg.properties.notFound);

    // Số khách: ưu tiên tách adults + children; fallback guestCount (legacy) hoặc 2.
    const children = dto.children ?? 0;
    const totalGuests =
      dto.adults != null ? dto.adults + children : (dto.guestCount ?? 2);
    if (property.maxGuests && totalGuests > property.maxGuests) {
      throw new BadRequestException(msg.bookings.guestExceedsMax);
    }

    const totalAmount = this.computeTotalToPersist(property, checkin, checkout, {
      adults: dto.adults ?? null,
      children: dto.adults != null ? children : null,
      guestCount: totalGuests,
    });

    const holdExpireAt = new Date(Date.now() + CUSTOMER_HOLD_DURATION_SECONDS * 1000);

    const booking = await this.prisma.$transaction(async (tx) => {
      const conflict = await tx.booking.findFirst({
        where: {
          propertyId,
          status: { in: BLOCKING_BOOKING_STATUSES },
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
          customerName: dto.customerName.trim(),
          customerPhone: dto.customerPhone.trim(),
          customerEmail: dto.customerEmail?.trim() || null,
          adults: dto.adults ?? null,
          children: dto.adults != null ? children : null,
          checkinDate: checkin,
          checkoutDate: checkout,
          status: BOOKING_STATUS.HOLD,
          holdExpireAt,
          totalAmount,
          guestCount: totalGuests,
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
        void this.notifications.notifyPropertyOwner(
          propertyId,
          'Khách đặt phòng mới',
          `${booking.property.name} (${booking.property.code}) — khách ${booking.customerName || 'Ẩn danh'} (${booking.customerPhone || 'chưa có SĐT'}) giữ chỗ`,
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
              id: true, name: true, slug: true, code: true, type: true,
              cancellationPolicy: true,
              weekdayPrice: true, weekendPrice: true, holidayPrice: true,
              adultSurcharge: true, childSurcharge: true,
              standardGuests: true, standardChildren: true,
              images: { where: { isCover: true }, take: 1, select: { id: true, imageUrl: true, isCover: true, order: true } },
              owner: { select: { id: true, name: true, phone: true, bankBin: true, bankName: true, bankAccountNumber: true, bankAccountName: true } },
            },
          },
          review: { select: { id: true } },
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
      return this.toBookingResponse(booking, holdRemainingSeconds);
    });

    return {
      message: msg.bookings.myListSuccess,
      data: bookingsWithExtras,
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
          status: { in: BLOCKING_BOOKING_STATUSES },
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
        status = booking.status === BOOKING_STATUS.HOLD ? 'hold' : 'booked';
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
   * Auto-complete: booking CONFIRMED đã qua 12h trưa (giờ VN) ngày trả phòng → COMPLETED.
   * Mục đích: đóng booking khi kỳ lưu trú kết thúc để khách có thể đánh giá căn (review yêu cầu status=COMPLETED).
   * VD: booking 4/7–6/7 → hoàn thành lúc 12h trưa 6/7.
   * Chạy mỗi giờ để độ trễ tối đa ~1h sau mốc trưa.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async completeCheckedOutBookings() {
    const now = new Date();
    const threshold = new Date(now.getTime() - COMPLETE_AFTER_CHECKOUT_MS);
    const result = await this.prisma.booking.updateMany({
      where: {
        status: BOOKING_STATUS.CONFIRMED,
        checkoutDate: { lte: threshold },
      },
      data: {
        status: BOOKING_STATUS.COMPLETED,
        completedAt: now,
      },
    });
    return result.count;
  }

  /**
   * Gửi email mời khách đánh giá — kích hoạt tại mốc 12h trưa (giờ VN) ngày trả phòng
   * (checkoutDate + 5h = mốc review mở, xem COMPLETE_AFTER_CHECKOUT_MS).
   * Điều kiện: booking COMPLETED, đã qua mốc review, chưa đánh giá, chưa gửi mail, có email khách.
   * `reviewInviteSentAt` chống gửi trùng (cron chạy mỗi giờ). Fire-and-forget từng mail.
   * Áp dụng cho cả booking auto-complete lẫn owner check-in (đều COMPLETED trước mốc trưa).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendReviewInvitations() {
    const threshold = new Date(Date.now() - COMPLETE_AFTER_CHECKOUT_MS);
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BOOKING_STATUS.COMPLETED,
        checkoutDate: { lte: threshold },
        reviewInviteSentAt: null,
        review: { is: null },
        // Có email để gửi: hoặc email liên hệ trên form, hoặc có tài khoản khách (User.email luôn có).
        OR: [
          { customerEmail: { not: null } },
          { customerId: { not: null } },
        ],
      },
      select: {
        id: true,
        customerName: true,
        customerEmail: true,
        property: { select: { name: true } },
        customer: { select: { email: true, name: true } },
      },
      take: 200,
    });
    if (bookings.length === 0) return 0;

    const base = (
      this.config.get<string>('FRONTEND_BASE_URL') || 'https://halong24h.com'
    ).replace(/\/+$/, '');

    let sent = 0;
    for (const b of bookings) {
      const toEmail = b.customer?.email ?? b.customerEmail;
      if (!toEmail) continue;
      // Đánh dấu trước để chống gửi trùng nếu mail chậm / cron chạy chồng.
      await this.prisma.booking.update({
        where: { id: b.id },
        data: { reviewInviteSentAt: new Date() },
      });
      void this.email
        .sendReviewInvitation({
          to: toEmail,
          customerName: b.customer?.name ?? b.customerName ?? 'Quý khách',
          propertyName: b.property.name,
          reviewUrl: `${base}/my/bookings/${b.id}`,
          bookingCode: deriveBookingCode(b.id),
        })
        .catch(() => undefined);
      sent++;
    }
    return sent;
  }

  /**
   * Mark NO_SHOW: booking CONFIRMED đã qua checkoutDate > 24h mà không có paidAt
   * (proxy cho "khách không đến + không hoàn tất thanh toán tại chỗ").
   * Chạy mỗi ngày 03:30 (giờ server, sau khi đêm trước đã đóng sổ).
   * LƯU Ý: từ khi có completeCheckedOutBookings (auto-complete tại 12h trưa checkout),
   * mọi booking CONFIRMED đã được chuyển COMPLETED trước mốc +24h → cron này gần như không còn khớp.
   * Giữ lại làm fallback; cân nhắc chuyển NO_SHOW sang mốc theo checkin nếu cần phát hiện khách không đến.
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

  /**
   * Nhắc check-in: 15h (giờ VN) ngày nhận phòng → push owner để xác nhận khách nhận phòng + thu nốt tiền.
   * Chạy mỗi giờ, chỉ thực thi khi giờ VN == 15. Chỉ nhắc booking CONFIRMED, chưa check-in.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async remindCheckinBookings() {
    const vnHour = new Date(Date.now() + VN_OFFSET_MS).getUTCHours();
    if (vnHour !== 15) return 0;

    const todayVN = this.startOfTodayUtc();
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BOOKING_STATUS.CONFIRMED,
        checkinDate: todayVN,
        checkedInAt: null,
      },
      include: { property: { select: { id: true, name: true, code: true } } },
    });

    for (const b of bookings) {
      void this.notifications.notifyPropertyOwner(
        b.propertyId,
        'Khách nhận phòng hôm nay',
        `${b.property.name} (${b.property.code}) — xác nhận khách nhận phòng và thu nốt tiền phòng`,
        NOTIFICATION_TYPE.BOOKING,
        b.id,
        'booking',
        { pushType: 'booking_checkin_reminder', deepLink: `/bookings/${b.id}` },
      ).catch(() => undefined);
    }
    return bookings.length;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private checkBookingAccess(booking: any, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    // CUSTOMER (role=3) chỉ xem được booking của chính mình.
    if (user.role === ROLE.CUSTOMER) {
      if (booking.customerId !== user.id) {
        throw new ForbiddenException(msg.bookings.forbiddenAccess);
      }
      return;
    }
    // ADMIN/OWNER/SALE scope theo effective owner của property.
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId && booking.property?.ownerId !== effectiveOwnerId) {
      throw new ForbiddenException(msg.bookings.forbiddenAccess);
    }
  }
}
