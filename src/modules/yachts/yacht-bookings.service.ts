import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { ChatService } from '../chat/chat.service';
import {
  BLOCKING_YACHT_STATUSES,
  NOTIFICATION_TYPE,
  ROLE,
  USER_SCOPE,
  YACHT_BOOKING_STATUS,
  isAdminOrSystemSale,
} from '../../common/constants';
import { resolveNightlyRate } from '../bookings/booking-pricing';
import {
  buildVietQrPayload,
  sanitizeTransferContent,
} from '../payment/helpers/vietqr.helper';
import type { Messages } from '../../i18n';
import { deriveYachtCode, parseUtcDate, startOfTodayVN } from './yacht.helpers';
import { CreateYachtBookingDto } from './dto/create-yacht-booking.dto';
import { MarkYachtPaidDto } from './dto/mark-yacht-paid.dto';

type CallerUser = { id: string; role: number; scope?: string | null };

const RECEIVING_BANK_ID = 'default';

// Đánh giá mở sau 12h trưa (giờ VN) ngày kết thúc hành trình. checkoutDate lưu 00:00Z → +5h.
const REVIEW_UNLOCK_AFTER_CHECKOUT_MS = (12 - 7) * 60 * 60 * 1000;

/** Bảng giá dùng cho compute — map từ Yacht sang shape PropertyPricing. */
const YACHT_PRICING_SELECT = {
  weekdayPrice: true,
  weekendPrice: true,
  holidayPrice: true,
  weekdayChildPrice: true,
  weekendChildPrice: true,
  holidayChildPrice: true,
} satisfies Prisma.YachtSelect;

@Injectable()
export class YachtBookingsService {
  private readonly logger = new Logger(YachtBookingsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private email: EmailService,
    private chat: ChatService,
    private config: ConfigService,
  ) {}

  // ─── Tạo đơn ──────────────────────────────────────────────────────────────

  /**
   * Tạo đơn đặt du thuyền (status PENDING).
   * - Customer tự đặt: customerId = user.id, contact fallback từ profile.
   * - Staff (ADMIN/SALE hệ thống) đặt hộ: saleId = user.id, customerId từ dto (nếu có).
   */
  async createBooking(
    dto: CreateYachtBookingDto,
    user: CallerUser,
    msg: Messages,
    opts: { asStaff: boolean },
  ) {
    const yacht = await this.prisma.yacht.findUnique({
      where: { id: dto.yachtId },
      select: { id: true, name: true, isActive: true, deletedAt: true, maxGuests: true, ...YACHT_PRICING_SELECT },
    });
    if (!yacht || !yacht.isActive || yacht.deletedAt) {
      throw new NotFoundException(msg.yachtBookings.yachtNotFound);
    }

    const checkin = parseUtcDate(dto.checkinDate);
    // Tour trong ngày: bỏ trống checkoutDate → = ngày đi (1 buổi, không qua đêm).
    const checkout = dto.checkoutDate ? parseUtcDate(dto.checkoutDate) : checkin;
    if (checkout < checkin) throw new BadRequestException(msg.yachtBookings.checkoutBeforeCheckin);
    if (checkin < startOfTodayVN()) throw new BadRequestException(msg.yachtBookings.checkinInPast);

    const adults = dto.adults;
    const children = dto.children ?? 0;
    if (adults + children > yacht.maxGuests) {
      throw new BadRequestException(msg.yachtBookings.guestExceedsMax);
    }

    const totalAmount = this.computeTotal(yacht, checkin, checkout, adults, children);

    // Resolve thông tin khách.
    let customerId: string | null = null;
    let customerName = dto.customerName ?? null;
    let customerPhone = dto.customerPhone ?? null;
    let customerEmail = dto.customerEmail ?? null;

    if (opts.asStaff) {
      customerId = dto.customerId ?? null;
    } else {
      customerId = user.id;
      const profile = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true, phone: true, email: true },
      });
      customerName = customerName ?? profile?.name ?? null;
      customerPhone = customerPhone ?? profile?.phone ?? null;
      customerEmail = customerEmail ?? profile?.email ?? null;
    }

    // Conflict check + create trong 1 transaction (Serializable) — chặn double-booking.
    const booking = await this.prisma.$transaction(
      async (tx) => {
        const conflict = await tx.yachtBooking.findFirst({
          where: {
            yachtId: yacht.id,
            status: { in: [...BLOCKING_YACHT_STATUSES] },
            checkinDate: { lt: checkout },
            checkoutDate: { gt: checkin },
          },
          select: { id: true },
        });
        if (conflict) throw new ConflictException(msg.yachtBookings.yachtNotAvailable);

        return tx.yachtBooking.create({
          data: {
            yachtId: yacht.id,
            saleId: opts.asStaff ? user.id : null,
            customerId,
            customerName,
            customerPhone,
            customerEmail,
            adults,
            children,
            guestCount: adults + children,
            checkinDate: checkin,
            checkoutDate: checkout,
            status: YACHT_BOOKING_STATUS.PENDING,
            totalAmount,
            notes: dto.notes ?? null,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Side-effects (ngoài transaction): hội thoại khách ↔ hệ thống + thông báo.
    await this.seedConversation(booking.id, customerId, yacht.name);
    void this.notifySystemTeam(
      'Đơn đặt du thuyền mới',
      `${yacht.name} — ${customerName ?? 'khách'} (${deriveYachtCode(booking.id)})`,
      booking.id,
    ).catch((e) => this.logger.warn(`notifySystemTeam failed: ${e?.message}`));

    return { message: msg.yachtBookings.createSuccess, data: this.toResponse(booking, yacht.name) };
  }

  // ─── Danh sách / chi tiết ──────────────────────────────────────────────────

  async listAll(
    user: CallerUser,
    msg: Messages,
    filters: { status?: number; page?: number; limit?: number },
  ) {
    if (!isAdminOrSystemSale(user)) throw new ForbiddenException(msg.yachtBookings.forbidden);

    const where: Prisma.YachtBookingWhereInput = {};
    if (filters.status !== undefined) where.status = filters.status;

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

    const [total, items] = await this.prisma.$transaction([
      this.prisma.yachtBooking.count({ where }),
      this.prisma.yachtBooking.findMany({
        where,
        include: { yacht: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      message: msg.yachtBookings.listSuccess,
      data: {
        items: items.map((b) => this.toResponse(b, b.yacht.name)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async listMy(user: CallerUser, msg: Messages, page?: number, limit?: number) {
    const p = Math.max(1, page ?? 1);
    const l = Math.min(50, Math.max(1, limit ?? 20));
    const where: Prisma.YachtBookingWhereInput = { customerId: user.id };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.yachtBooking.count({ where }),
      this.prisma.yachtBooking.findMany({
        where,
        include: { yacht: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
    ]);

    // Batch: đơn nào đã đánh giá → set canReview=false, hasReview=true.
    const reviewedIds = new Set(
      (
        await this.prisma.yachtReview.findMany({
          where: { bookingId: { in: items.map((i) => i.id) } },
          select: { bookingId: true },
        })
      ).map((r) => r.bookingId),
    );

    return {
      message: msg.yachtBookings.myListSuccess,
      data: {
        items: items.map((b) => this.toResponse(b, b.yacht.name, reviewedIds.has(b.id))),
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
      },
    };
  }

  async findOne(id: string, user: CallerUser, msg: Messages) {
    const booking = await this.loadOrThrow(id, msg);
    this.assertAccess(booking, user, msg);
    const [yacht, review] = await Promise.all([
      this.prisma.yacht.findUnique({
        where: { id: booking.yachtId },
        select: { name: true, code: true, departurePoint: true, durationText: true, itinerary: true },
      }),
      this.prisma.yachtReview.findUnique({ where: { bookingId: id }, select: { id: true } }),
    ]);

    // Thông tin thanh toán VietQR cho khách — chỉ khi đã xác nhận + chưa thanh toán.
    let payment: Awaited<ReturnType<YachtBookingsService['buildPaymentInfo']>> | null = null;
    if (
      booking.status === YACHT_BOOKING_STATUS.CONFIRMED &&
      !booking.paidAt &&
      booking.totalAmount &&
      booking.totalAmount > 0
    ) {
      payment = await this.buildPaymentInfo(booking.totalAmount, deriveYachtCode(id));
    }

    return {
      message: msg.yachtBookings.getSuccess,
      data: { ...this.toResponse(booking, yacht?.name ?? null, !!review), yacht, payment },
    };
  }

  // ─── Lifecycle: confirm → paid → cancel ────────────────────────────────────

  /** Xác nhận đơn (PENDING → CONFIRMED) + sinh VietQR để khách thanh toán FULL. */
  async confirm(id: string, user: CallerUser, msg: Messages) {
    if (!isAdminOrSystemSale(user)) throw new ForbiddenException(msg.yachtBookings.forbidden);
    const booking = await this.loadOrThrow(id, msg);
    if (booking.status !== YACHT_BOOKING_STATUS.PENDING) {
      throw new BadRequestException(msg.yachtBookings.onlyConfirmPending);
    }

    const yacht = await this.prisma.yacht.findUnique({
      where: { id: booking.yachtId },
      select: { name: true, ...YACHT_PRICING_SELECT },
    });
    if (!yacht) throw new NotFoundException(msg.yachtBookings.yachtNotFound);

    const totalAmount = this.computeTotal(
      yacht,
      booking.checkinDate,
      booking.checkoutDate,
      booking.adults ?? booking.guestCount,
      booking.children ?? 0,
    );
    if (totalAmount == null || totalAmount <= 0) {
      throw new BadRequestException(msg.yachtBookings.priceNotConfigured);
    }

    const updated = await this.prisma.yachtBooking.update({
      where: { id },
      data: {
        status: YACHT_BOOKING_STATUS.CONFIRMED,
        totalAmount,
        confirmedAt: new Date(),
        confirmedBy: user.id,
      },
    });

    const code = deriveYachtCode(id);
    const payment = await this.buildPaymentInfo(totalAmount, code);

    void this.postSystem(
      id,
      `Đơn ${code} đã được xác nhận. Vui lòng thanh toán ${totalAmount.toLocaleString('vi-VN')} đ để hoàn tất. Nội dung CK: ${payment.content}`,
    );
    if (booking.customerId) {
      void this.notifications.notifyUser(
        booking.customerId,
        'Đơn du thuyền đã được xác nhận',
        `${yacht.name} — vui lòng thanh toán để nhận mã đặt chỗ`,
        NOTIFICATION_TYPE.BOOKING,
        id,
        'yachtBooking',
      );
    }

    return {
      message: msg.yachtBookings.confirmSuccess,
      data: { ...this.toResponse(updated, yacht.name), payment },
    };
  }

  /** Ghi nhận thanh toán FULL (CONFIRMED → PAID) → gửi mã code + thông tin qua email. */
  async markPaid(id: string, dto: MarkYachtPaidDto, user: CallerUser, msg: Messages) {
    if (!isAdminOrSystemSale(user)) throw new ForbiddenException(msg.yachtBookings.forbidden);
    const booking = await this.loadOrThrow(id, msg);
    if (booking.status !== YACHT_BOOKING_STATUS.CONFIRMED) {
      throw new BadRequestException(msg.yachtBookings.onlyPayConfirmed);
    }

    const paidAmount = dto.amount ?? booking.totalAmount ?? 0;
    if (paidAmount <= 0) throw new BadRequestException(msg.yachtBookings.paidAmountRequired);

    const updated = await this.prisma.yachtBooking.update({
      where: { id },
      data: { status: YACHT_BOOKING_STATUS.PAID, paidAmount, paidAt: new Date() },
    });

    const yacht = await this.prisma.yacht.findUnique({
      where: { id: booking.yachtId },
      select: { name: true, departurePoint: true },
    });
    const code = deriveYachtCode(id);

    // Gửi email mã code + thông tin cho khách (fire-and-forget).
    const toEmail = booking.customerEmail;
    if (toEmail) {
      void this.email
        .sendYachtBookingConfirmed({
          to: toEmail,
          customerName: booking.customerName ?? 'Quý khách',
          yachtName: yacht?.name ?? 'Du thuyền',
          bookingCode: code,
          checkinDate: booking.checkinDate,
          checkoutDate: booking.checkoutDate,
          paidAmount,
          totalAmount: booking.totalAmount ?? paidAmount,
          departurePoint: yacht?.departurePoint ?? null,
        })
        .catch((e) => this.logger.warn(`sendYachtBookingConfirmed failed: ${e?.message}`));
    }

    void this.postSystem(
      id,
      `Đã ghi nhận thanh toán đủ. Mã đặt du thuyền của bạn: ${code}. Thông tin chi tiết đã được gửi qua email.`,
    );
    if (booking.customerId) {
      void this.notifications.notifyUser(
        booking.customerId,
        'Thanh toán du thuyền thành công',
        `Mã đặt chỗ: ${code}`,
        NOTIFICATION_TYPE.PAYMENT,
        id,
        'yachtBooking',
      );
    }

    return {
      message: msg.yachtBookings.markPaidSuccess,
      data: { ...this.toResponse(updated, yacht?.name ?? null), bookingCode: code },
    };
  }

  /** Huỷ đơn. Staff huỷ mọi đơn chưa thanh toán; customer chỉ huỷ đơn PENDING của mình. */
  async cancel(id: string, reason: string | undefined, user: CallerUser, msg: Messages) {
    const booking = await this.loadOrThrow(id, msg);
    const staff = isAdminOrSystemSale(user);

    if (!staff) {
      if (booking.customerId !== user.id) throw new ForbiddenException(msg.yachtBookings.forbiddenAccess);
      if (booking.status !== YACHT_BOOKING_STATUS.PENDING) {
        throw new BadRequestException(msg.yachtBookings.cannotCancelPaid);
      }
    }
    if (booking.status === YACHT_BOOKING_STATUS.CANCELLED) {
      throw new BadRequestException(msg.yachtBookings.alreadyCancelled);
    }
    if (booking.status === YACHT_BOOKING_STATUS.PAID || booking.status === YACHT_BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException(msg.yachtBookings.cannotCancelPaid);
    }

    const updated = await this.prisma.yachtBooking.update({
      where: { id },
      data: {
        status: YACHT_BOOKING_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledByUserId: user.id,
        cancelledByRole: user.role,
        cancelledReason: reason ?? null,
      },
    });

    void this.postSystem(id, `Đơn ${deriveYachtCode(id)} đã được huỷ.${reason ? ` Lý do: ${reason}` : ''}`);
    return { message: msg.yachtBookings.cancelSuccess, data: this.toResponse(updated, null) };
  }

  // ─── Cron ────────────────────────────────────────────────────────────────────

  /** Tự chuyển đơn PAID → COMPLETED sau khi qua 12h trưa ngày kết thúc hành trình. */
  @Cron(CronExpression.EVERY_HOUR)
  async completeYachtBookings() {
    const threshold = new Date(Date.now() - REVIEW_UNLOCK_AFTER_CHECKOUT_MS);
    const res = await this.prisma.yachtBooking.updateMany({
      where: { status: YACHT_BOOKING_STATUS.PAID, checkoutDate: { lte: threshold } },
      data: { status: YACHT_BOOKING_STATUS.COMPLETED },
    });
    if (res.count > 0) this.logger.log(`Auto-completed ${res.count} yacht booking(s)`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async loadOrThrow(id: string, msg: Messages) {
    const booking = await this.prisma.yachtBooking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException(msg.yachtBookings.notFound);
    return booking;
  }

  private assertAccess(
    booking: { customerId: string | null },
    user: CallerUser,
    msg: Messages,
  ): void {
    if (isAdminOrSystemSale(user)) return;
    if (booking.customerId === user.id) return;
    throw new ForbiddenException(msg.yachtBookings.forbiddenAccess);
  }

  /**
   * Tính giá tour du thuyền — BÁN THEO ĐẦU NGƯỜI, giá người lớn ≠ trẻ em, theo ngày đi (tour trong ngày).
   * total = adults × giá người lớn(ngày) + children × giá trẻ em(ngày).
   * Chưa cấu hình giá người lớn → null. Chưa cấu hình giá trẻ em → trẻ em tính 0 (miễn phí).
   */
  private computeTotal(
    pricing: {
      weekdayPrice: number | null;
      weekendPrice: number | null;
      holidayPrice: number | null;
      weekdayChildPrice: number | null;
      weekendChildPrice: number | null;
      holidayChildPrice: number | null;
    },
    checkin: Date,
    _checkout: Date, // không dùng — tour trong ngày, tính theo ngày đi (checkin)
    adults: number,
    children: number,
  ): number | null {
    const adultRate = resolveNightlyRate(checkin, {
      weekdayPrice: pricing.weekdayPrice,
      weekendPrice: pricing.weekendPrice,
      holidayPrice: pricing.holidayPrice,
    }).amount;
    if (adultRate == null) return null;
    const childRate =
      resolveNightlyRate(checkin, {
        weekdayPrice: pricing.weekdayChildPrice,
        weekendPrice: pricing.weekendChildPrice,
        holidayPrice: pricing.holidayChildPrice,
      }).amount ?? 0;
    return Math.round(adults * adultRate + children * childRate);
  }

  /** STK nhận tiền nền tảng (singleton 'default') — fallback ENV BANK_* nếu chưa cấu hình. */
  private async buildPaymentInfo(amount: number, code: string) {
    const row = await this.prisma.paymentBankAccount.findUnique({ where: { id: RECEIVING_BANK_ID } });
    const bankBin = row?.bankBin ?? this.config.get<string>('BANK_BIN', '970436');
    const bankName = row?.bankName ?? this.config.get<string>('BANK_NAME', 'Vietcombank');
    const accountNumber = row?.bankAccountNumber ?? this.config.get<string>('BANK_ACCOUNT_NUMBER', '0011004567890');
    const accountName = row?.bankAccountName ?? this.config.get<string>('BANK_ACCOUNT_NAME', 'CONG TY HALONG24H');
    const content = sanitizeTransferContent(code);
    const qrCode = buildVietQrPayload({ bankBin, accountNumber, amount, content });
    return { bankBin, bankName, accountNumber, accountName, amount, content, qrCode };
  }

  /** Notify toàn bộ ADMIN + SALE hệ thống (đơn du thuyền là cấp hệ thống). */
  private async notifySystemTeam(title: string, subtitle: string, targetId: string) {
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ role: ROLE.ADMIN }, { role: ROLE.SALE, scope: USER_SCOPE.SYSTEM }],
      },
      select: { id: true },
    });
    if (recipients.length === 0) return;
    await this.prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        title,
        subtitle,
        type: NOTIFICATION_TYPE.BOOKING,
        targetId,
        targetType: 'yachtBooking',
      })),
    });
  }

  /** Idempotent tạo hội thoại khách ↔ hệ thống + tin nhắn hệ thống chào. */
  private async seedConversation(bookingId: string, customerId: string | null, yachtName: string) {
    if (!customerId) return;
    try {
      const conv = await this.chat.getOrCreateYachtConversation(bookingId, customerId);
      if (conv) {
        await this.chat.postSystemMessage(
          conv.id,
          `Bạn đã đặt du thuyền ${yachtName} (mã ${deriveYachtCode(bookingId)}). Hệ thống sẽ sớm liên hệ xác nhận. Bạn có thể nhắn tin trực tiếp tại đây nếu cần hỗ trợ.`,
        );
      }
    } catch (e) {
      this.logger.warn(`seedConversation failed for ${bookingId}: ${(e as Error).message}`);
    }
  }

  private async postSystem(bookingId: string, content: string) {
    try {
      const conv = await this.prisma.conversation.findFirst({
        where: { type: 'yacht', bookingId },
        select: { id: true },
      });
      if (conv) await this.chat.postSystemMessage(conv.id, content);
    } catch (e) {
      this.logger.warn(`postSystem failed for ${bookingId}: ${(e as Error).message}`);
    }
  }

  private toResponse(
    b: {
      id: string;
      yachtId: string;
      saleId: string | null;
      customerId: string | null;
      customerName: string | null;
      customerPhone: string | null;
      customerEmail: string | null;
      adults: number | null;
      children: number | null;
      guestCount: number;
      checkinDate: Date;
      checkoutDate: Date;
      status: number;
      totalAmount: number | null;
      paidAmount: number | null;
      paidAt: Date | null;
      confirmedAt: Date | null;
      cancelledReason: string | null;
      notes: string | null;
      createdAt: Date;
    },
    yachtName: string | null,
    reviewed = false,
  ) {
    const total = b.totalAmount ?? null;
    const paid = b.paidAmount ?? 0;
    const reviewUnlockAt = new Date(b.checkoutDate.getTime() + REVIEW_UNLOCK_AFTER_CHECKOUT_MS);
    const reviewable =
      b.status === YACHT_BOOKING_STATUS.PAID || b.status === YACHT_BOOKING_STATUS.COMPLETED;
    return {
      id: b.id,
      code: deriveYachtCode(b.id),
      yachtId: b.yachtId,
      yachtName,
      saleId: b.saleId,
      customerId: b.customerId,
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      customerEmail: b.customerEmail,
      adults: b.adults,
      children: b.children,
      guestCount: b.guestCount,
      checkinDate: b.checkinDate,
      checkoutDate: b.checkoutDate,
      status: b.status,
      totalAmount: total,
      paidAmount: paid,
      remainingAmount: total != null ? Math.max(0, total - paid) : null,
      paidAt: b.paidAt,
      confirmedAt: b.confirmedAt,
      cancelledReason: b.cancelledReason,
      notes: b.notes,
      createdAt: b.createdAt,
      // Đánh giá: mở sau khi qua ngày kết thúc hành trình + đã thanh toán + chưa đánh giá.
      hasReview: reviewed,
      reviewUnlockAt,
      canReview: reviewable && Date.now() >= reviewUnlockAt.getTime() && !reviewed,
    };
  }
}
