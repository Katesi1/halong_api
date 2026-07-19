import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NOTIFICATION_TYPE,
  YACHT_BOOKING_STATUS,
  isAdminOrSystemSale,
} from '../../common/constants';
import type { Messages } from '../../i18n';
import { CreateYachtReviewDto } from './dto/create-yacht-review.dto';
import { HideYachtReviewDto, ReplyYachtReviewDto } from './dto/yacht-review-moderation.dto';

type CallerUser = { id: string; role: number; scope?: string | null };

// Đánh giá mở sau 12h trưa (giờ VN) ngày kết thúc hành trình. checkoutDate lưu 00:00Z ngày VN → +5h.
const REVIEW_UNLOCK_AFTER_CHECKOUT_MS = (12 - 7) * 60 * 60 * 1000;

/** Trạng thái đơn cho phép đánh giá (đã thanh toán / đã hoàn tất). */
const REVIEWABLE_STATUSES = [YACHT_BOOKING_STATUS.PAID, YACHT_BOOKING_STATUS.COMPLETED];

@Injectable()
export class YachtReviewsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Mốc thời gian mở đánh giá cho 1 đơn (checkout + 12h trưa VN). */
  static reviewUnlockAt(checkoutDate: Date): Date {
    return new Date(checkoutDate.getTime() + REVIEW_UNLOCK_AFTER_CHECKOUT_MS);
  }

  async createReview(
    yachtId: string,
    dto: CreateYachtReviewDto,
    user: CallerUser,
    msg: Messages,
  ) {
    const yacht = await this.prisma.yacht.findFirst({
      where: { id: yachtId, deletedAt: null },
      select: { id: true, name: true, code: true },
    });
    if (!yacht) throw new NotFoundException(msg.yachts.notFound);

    const booking = await this.prisma.yachtBooking.findUnique({
      where: { id: dto.bookingId },
      select: { id: true, yachtId: true, customerId: true, status: true, checkoutDate: true },
    });
    if (!booking || booking.yachtId !== yachtId || booking.customerId !== user.id) {
      throw new ForbiddenException(msg.yachtReviews.notYourBooking);
    }
    if (!REVIEWABLE_STATUSES.includes(booking.status as (typeof REVIEWABLE_STATUSES)[number])) {
      throw new BadRequestException(msg.yachtReviews.notReviewable);
    }
    if (Date.now() < YachtReviewsService.reviewUnlockAt(booking.checkoutDate).getTime()) {
      throw new BadRequestException(msg.yachtReviews.reviewNotYetAllowed);
    }

    const existing = await this.prisma.yachtReview.findUnique({
      where: { bookingId: dto.bookingId },
      select: { id: true },
    });
    if (existing) throw new ConflictException(msg.yachtReviews.alreadyReviewed);

    const avgRating =
      Math.round(
        ((dto.cleanliness + dto.location + dto.amenities + dto.service + dto.value + dto.accuracy) / 6) * 100,
      ) / 100;

    const review = await this.prisma.yachtReview.create({
      data: {
        yachtId,
        bookingId: dto.bookingId,
        customerId: user.id,
        cleanliness: dto.cleanliness,
        location: dto.location,
        amenities: dto.amenities,
        service: dto.service,
        value: dto.value,
        accuracy: dto.accuracy,
        avgRating,
        comment: dto.comment ?? null,
        photos: (dto.photos as unknown as Prisma.InputJsonValue) ?? [],
      },
      select: { id: true, yachtId: true, avgRating: true, createdAt: true },
    });

    await this.recomputeYachtRating(yachtId);

    void this.notifications
      .notifyUser(
        booking.customerId,
        'Cảm ơn đánh giá của bạn',
        `${yacht.name} — ${avgRating}★`,
        NOTIFICATION_TYPE.SYSTEM,
        review.id,
        'yachtReview',
      )
      .catch(() => undefined);

    return { message: msg.yachtReviews.createSuccess, data: review };
  }

  /** Recompute yacht.ratingAvg + reviewCount từ review đang hiển thị. */
  private async recomputeYachtRating(yachtId: string): Promise<void> {
    const agg = await this.prisma.yachtReview.aggregate({
      where: { yachtId, isHidden: false },
      _avg: { avgRating: true },
      _count: { _all: true },
    });
    await this.prisma.yacht.update({
      where: { id: yachtId },
      data: {
        ratingAvg: Math.round((agg._avg.avgRating ?? 0) * 100) / 100,
        reviewCount: agg._count._all,
      },
    });
  }

  async listReviews(
    yachtId: string,
    msg: Messages,
    page = 1,
    pageSize = 20,
    sort: 'newest' | 'oldest' | 'highest' | 'lowest' = 'newest',
    minRating?: number,
  ) {
    const yacht = await this.prisma.yacht.findFirst({
      where: { id: yachtId, deletedAt: null },
      select: { id: true },
    });
    if (!yacht) throw new NotFoundException(msg.yachts.notFound);

    const where: Prisma.YachtReviewWhereInput = { yachtId, isHidden: false };
    if (minRating) where.avgRating = { gte: minRating };

    const orderBy: Prisma.YachtReviewOrderByWithRelationInput =
      sort === 'oldest'
        ? { createdAt: 'asc' }
        : sort === 'highest'
          ? { avgRating: 'desc' }
          : sort === 'lowest'
            ? { avgRating: 'asc' }
            : { createdAt: 'desc' };

    const [allReviews, total, items] = await Promise.all([
      this.prisma.yachtReview.findMany({
        where: { yachtId, isHidden: false },
        select: {
          avgRating: true,
          cleanliness: true,
          location: true,
          amenities: true,
          service: true,
          value: true,
          accuracy: true,
        },
      }),
      this.prisma.yachtReview.count({ where }),
      this.prisma.yachtReview.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const summary = this.buildSummary(allReviews);

    // Hydrate tên khách (customerId lỏng, không FK → query User riêng).
    const customerIds = Array.from(new Set(items.map((r) => r.customerId)));
    const users = await this.prisma.user.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, avatar: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = {
      summary,
      items: items.map((r) => ({
        id: r.id,
        customer: {
          id: r.customerId,
          name: userMap.get(r.customerId)?.name ?? null,
          avatar: userMap.get(r.customerId)?.avatar ?? null,
        },
        cleanliness: r.cleanliness,
        location: r.location,
        amenities: r.amenities,
        service: r.service,
        value: r.value,
        accuracy: r.accuracy,
        avgRating: r.avgRating,
        comment: r.comment,
        photos: r.photos ?? [],
        reply: r.reply,
        replyAt: r.replyAt,
        createdAt: r.createdAt,
      })),
      page,
      pageSize,
      total,
    };
    return { message: msg.yachtReviews.listSuccess, data };
  }

  private buildSummary(
    reviews: Array<{
      avgRating: number;
      cleanliness: number;
      location: number;
      amenities: number;
      service: number;
      value: number;
      accuracy: number;
    }>,
  ) {
    const totalReviews = reviews.length;
    if (totalReviews === 0) {
      return {
        avgRating: 0,
        totalReviews: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        breakdown: { cleanliness: 0, location: 0, amenities: 0, service: 0, value: 0, accuracy: 0 },
      };
    }
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sumAvg = 0, sumC = 0, sumL = 0, sumA = 0, sumS = 0, sumV = 0, sumAc = 0;
    for (const r of reviews) {
      const star = Math.floor(r.avgRating);
      if (star >= 1 && star <= 5) distribution[star as 1 | 2 | 3 | 4 | 5]++;
      sumAvg += r.avgRating;
      sumC += r.cleanliness; sumL += r.location; sumA += r.amenities;
      sumS += r.service; sumV += r.value; sumAc += r.accuracy;
    }
    const round = (n: number) => Math.round((n / totalReviews) * 100) / 100;
    return {
      avgRating: round(sumAvg),
      totalReviews,
      distribution,
      breakdown: {
        cleanliness: round(sumC), location: round(sumL), amenities: round(sumA),
        service: round(sumS), value: round(sumV), accuracy: round(sumAc),
      },
    };
  }

  async replyReview(reviewId: string, dto: ReplyYachtReviewDto, user: CallerUser, msg: Messages) {
    if (!isAdminOrSystemSale(user)) throw new ForbiddenException(msg.yachtReviews.forbidden);
    const review = await this.prisma.yachtReview.findUnique({
      where: { id: reviewId },
      select: { id: true },
    });
    if (!review) throw new NotFoundException(msg.yachtReviews.notFound);
    await this.prisma.yachtReview.update({
      where: { id: reviewId },
      data: { reply: dto.reply, replyAt: new Date() },
    });
    return { message: msg.yachtReviews.replySuccess, data: null };
  }

  async hideReview(reviewId: string, dto: HideYachtReviewDto, user: CallerUser, msg: Messages) {
    if (!isAdminOrSystemSale(user)) throw new ForbiddenException(msg.yachtReviews.forbidden);
    const review = await this.prisma.yachtReview.findUnique({
      where: { id: reviewId },
      select: { id: true, yachtId: true },
    });
    if (!review) throw new NotFoundException(msg.yachtReviews.notFound);
    await this.prisma.yachtReview.update({
      where: { id: reviewId },
      data: { isHidden: true, hiddenReason: dto.reason ?? null },
    });
    await this.recomputeYachtRating(review.yachtId);
    return { message: msg.yachtReviews.hideSuccess, data: null };
  }

  async restoreReview(reviewId: string, user: CallerUser, msg: Messages) {
    if (!isAdminOrSystemSale(user)) throw new ForbiddenException(msg.yachtReviews.forbidden);
    const review = await this.prisma.yachtReview.findUnique({
      where: { id: reviewId },
      select: { id: true, yachtId: true, isHidden: true },
    });
    if (!review) throw new NotFoundException(msg.yachtReviews.notFound);
    if (!review.isHidden) throw new BadRequestException(msg.yachtReviews.notHidden);
    await this.prisma.yachtReview.update({
      where: { id: reviewId },
      data: { isHidden: false, hiddenReason: null },
    });
    await this.recomputeYachtRating(review.yachtId);
    return { message: msg.yachtReviews.restoreSuccess, data: null };
  }

  async adminList(
    user: CallerUser,
    filters: { status?: 'visible' | 'hidden' | 'all'; page?: number; pageSize?: number },
    msg: Messages,
  ) {
    if (!isAdminOrSystemSale(user)) throw new ForbiddenException(msg.yachtReviews.forbidden);
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

    const where: Prisma.YachtReviewWhereInput = {};
    if (filters.status === 'visible') where.isHidden = false;
    else if (filters.status === 'hidden') where.isHidden = true;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.yachtReview.count({ where }),
      this.prisma.yachtReview.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { yacht: { select: { id: true, name: true, code: true } } },
      }),
    ]);

    return {
      message: msg.yachtReviews.listSuccess,
      data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
