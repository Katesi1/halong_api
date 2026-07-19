import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Messages } from '../../i18n';
import { BOOKING_STATUS, ROLE, NOTIFICATION_TYPE, AUDIT_ACTION, AUDIT_TARGET_TYPE, getEffectiveOwnerId } from '../../common/constants';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { HideReviewDto } from './dto/hide-review.dto';

// Đánh giá chỉ mở sau 12h trưa (giờ VN) ngày trả phòng — dù booking đã COMPLETED sớm do check-in.
// checkoutDate lưu 00:00Z của ngày trả VN → mốc = checkoutDate + 12h - 7h = +5h.
const REVIEW_UNLOCK_AFTER_CHECKOUT_MS = (12 - 7) * 60 * 60 * 1000; // 5h

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notifications: NotificationsService,
  ) {}

  async createReview(
    propertyId: string,
    dto: CreateReviewDto,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    // Check property exists
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: { id: true, ownerId: true, name: true, code: true },
    });
    if (!property) throw new NotFoundException(msg.reviews.propertyNotFound);

    // Check booking belongs to customer and is for this property
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      select: { id: true, customerId: true, propertyId: true, status: true, checkoutDate: true },
    });

    if (!booking || booking.propertyId !== propertyId) {
      throw new ForbiddenException(msg.reviews.notYourBooking);
    }
    if (booking.customerId !== user.id) {
      throw new ForbiddenException(msg.reviews.notYourBooking);
    }
    if (booking.status !== BOOKING_STATUS.COMPLETED) {
      throw new BadRequestException(msg.reviews.bookingNotCompleted);
    }
    // COMPLETED có thể xảy ra sớm do owner check-in — chỉ cho đánh giá SAU 12h trưa ngày trả phòng.
    const reviewUnlockAt = booking.checkoutDate.getTime() + REVIEW_UNLOCK_AFTER_CHECKOUT_MS;
    if (Date.now() < reviewUnlockAt) {
      throw new BadRequestException(msg.reviews.reviewNotYetAllowed);
    }

    // Check if already reviewed
    const existing = await this.prisma.propertyReview.findUnique({
      where: { bookingId: dto.bookingId },
      select: { id: true },
    });
    if (existing) throw new ConflictException(msg.reviews.alreadyReviewed);

    const avgRating = Math.round(
      ((dto.cleanliness + dto.location + dto.amenities + dto.service + dto.value + dto.accuracy) / 6) * 100,
    ) / 100;

    const review = await this.prisma.propertyReview.create({
      data: {
        propertyId,
        bookingId: dto.bookingId,
        customerId: user.id,
        cleanliness: dto.cleanliness,
        location: dto.location,
        amenities: dto.amenities,
        service: dto.service,
        value: dto.value,
        accuracy: dto.accuracy,
        avgRating,
        comment: dto.comment,
        photos: dto.photos || [],
      },
      select: {
        id: true,
        propertyId: true,
        avgRating: true,
        createdAt: true,
      },
    });

    await this.recomputePropertyRating(propertyId);

    // Báo cho owner (chuông + push FCM) — best-effort, không chặn response.
    // DB row ghi đồng bộ trong notifyPropertyOwner; push là side-effect ngoài.
    void this.notifications.notifyPropertyOwner(
      propertyId,
      'Đánh giá mới',
      `${property.name} (${property.code}) — khách vừa đánh giá ${avgRating}★`,
      NOTIFICATION_TYPE.SYSTEM,
      review.id,
      'review',
      { pushType: 'review_created', deepLink: `/properties/${propertyId}/reviews` },
    ).catch(() => undefined);

    return { message: msg.reviews.createSuccess, data: review };
  }

  // Recompute property.ratingAvg + reviewCount from visible reviews.
  // Called on every review state change (create / hide / restore).
  private async recomputePropertyRating(propertyId: string): Promise<void> {
    const agg = await this.prisma.propertyReview.aggregate({
      where: { propertyId, isHidden: false },
      _avg: { avgRating: true },
      _count: { _all: true },
    });
    const avg = agg._avg.avgRating ?? 0;
    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ratingAvg: Math.round(avg * 100) / 100,
        reviewCount: agg._count._all,
      },
    });
  }

  async listReviews(
    propertyId: string,
    msg: Messages,
    page = 1,
    pageSize = 20,
    sort = 'newest',
    minRating?: number,
  ) {
    // Check property exists
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: { id: true },
    });
    if (!property) throw new NotFoundException(msg.reviews.propertyNotFound);

    // Build where clause
    const where: any = {
      propertyId,
      isHidden: false,
    };
    if (minRating) {
      where.avgRating = { gte: minRating };
    }

    // Sort
    let orderBy: any;
    switch (sort) {
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'highest':
        orderBy = { avgRating: 'desc' };
        break;
      case 'lowest':
        orderBy = { avgRating: 'asc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    // Get summary aggregate (all visible reviews, ignoring pagination filters)
    const summaryWhere = { propertyId, isHidden: false };
    const [allReviews, total] = await Promise.all([
      this.prisma.propertyReview.findMany({
        where: summaryWhere,
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
      this.prisma.propertyReview.count({ where }),
    ]);

    // Build summary
    const totalReviews = allReviews.length;
    let summary: any = null;
    if (totalReviews > 0) {
      const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      let sumAvg = 0;
      let sumC = 0, sumL = 0, sumA = 0, sumS = 0, sumV = 0, sumAc = 0;

      for (const r of allReviews) {
        const star = Math.floor(r.avgRating);
        if (star >= 1 && star <= 5) distribution[star as 1 | 2 | 3 | 4 | 5]++;
        sumAvg += r.avgRating;
        sumC += r.cleanliness;
        sumL += r.location;
        sumA += r.amenities;
        sumS += r.service;
        sumV += r.value;
        sumAc += r.accuracy;
      }

      summary = {
        avgRating: Math.round((sumAvg / totalReviews) * 100) / 100,
        totalReviews,
        distribution,
        breakdown: {
          cleanliness: Math.round((sumC / totalReviews) * 100) / 100,
          location: Math.round((sumL / totalReviews) * 100) / 100,
          amenities: Math.round((sumA / totalReviews) * 100) / 100,
          service: Math.round((sumS / totalReviews) * 100) / 100,
          value: Math.round((sumV / totalReviews) * 100) / 100,
          accuracy: Math.round((sumAc / totalReviews) * 100) / 100,
        },
      };
    } else {
      summary = {
        avgRating: 0,
        totalReviews: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        breakdown: {
          cleanliness: 0, location: 0, amenities: 0,
          service: 0, value: 0, accuracy: 0,
        },
      };
    }

    // Get paginated items
    const items = await this.prisma.propertyReview.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        cleanliness: true,
        location: true,
        amenities: true,
        service: true,
        value: true,
        accuracy: true,
        avgRating: true,
        comment: true,
        photos: true,
        ownerReply: true,
        ownerReplyAt: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const data = {
      summary,
      items: items.map((item) => ({
        id: item.id,
        customer: {
          id: item.customer.id,
          name: item.customer.name,
          avatar: null,
        },
        cleanliness: item.cleanliness,
        location: item.location,
        amenities: item.amenities,
        service: item.service,
        value: item.value,
        accuracy: item.accuracy,
        avgRating: item.avgRating,
        comment: item.comment,
        photos: item.photos || [],
        ownerReply: item.ownerReply,
        ownerReplyAt: item.ownerReplyAt,
        createdAt: item.createdAt,
      })),
      page,
      pageSize,
      total,
    };

    return { message: msg.reviews.listSuccess, data };
  }

  async replyReview(
    propertyId: string,
    reviewId: string,
    dto: ReplyReviewDto,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    const review = await this.prisma.propertyReview.findUnique({
      where: { id: reviewId },
      select: { id: true, propertyId: true, property: { select: { ownerId: true } } },
    });

    if (!review || review.propertyId !== propertyId) {
      throw new NotFoundException(msg.reviews.notFound);
    }

    // Only owner of property or ADMIN can reply
    if (user.role !== ROLE.ADMIN && review.property.ownerId !== user.id) {
      throw new ForbiddenException(msg.reviews.forbidden);
    }

    await this.prisma.propertyReview.update({
      where: { id: reviewId },
      data: {
        ownerReply: dto.reply,
        ownerReplyAt: new Date(),
      },
    });

    return { message: msg.reviews.replySuccess, data: null };
  }

  async hideReview(
    reviewId: string,
    dto: HideReviewDto,
    msg: Messages,
  ) {
    const review = await this.prisma.propertyReview.findUnique({
      where: { id: reviewId },
      select: { id: true, propertyId: true },
    });
    if (!review) throw new NotFoundException(msg.reviews.notFound);

    await this.prisma.propertyReview.update({
      where: { id: reviewId },
      data: {
        isHidden: true,
        hiddenReason: dto.reason || null,
      },
    });

    await this.recomputePropertyRating(review.propertyId);

    return { message: msg.reviews.hideSuccess, data: null };
  }

  async hideReviewAsAdmin(
    adminId: string,
    reviewId: string,
    dto: HideReviewDto,
    msg: Messages,
  ) {
    const result = await this.hideReview(reviewId, dto, msg);
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.REVIEW_HIDE,
      targetType: AUDIT_TARGET_TYPE.REVIEW,
      targetId: reviewId,
      metadata: { reason: dto.reason ?? null },
    });
    return result;
  }

  async restoreReviewAsAdmin(adminId: string, reviewId: string, msg: Messages) {
    const result = await this.restoreReview(reviewId, msg);
    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.REVIEW_RESTORE,
      targetType: AUDIT_TARGET_TYPE.REVIEW,
      targetId: reviewId,
    });
    return result;
  }

  async restoreReview(reviewId: string, msg: Messages) {
    const review = await this.prisma.propertyReview.findUnique({
      where: { id: reviewId },
      select: { id: true, isHidden: true, propertyId: true },
    });
    if (!review) throw new NotFoundException(msg.reviews.notFound);
    if (!review.isHidden) {
      throw new BadRequestException(msg.reviews.notHidden);
    }

    await this.prisma.propertyReview.update({
      where: { id: reviewId },
      data: { isHidden: false, hiddenReason: null },
    });

    await this.recomputePropertyRating(review.propertyId);

    return { message: msg.reviews.restoreSuccess, data: null };
  }

  async adminListReviews(
    filters: {
      status?: 'visible' | 'hidden' | 'all';
      rating?: number;
      search?: string;
      page?: number;
      pageSize?: number;
    },
    msg: Messages,
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (filters.status === 'visible') where.isHidden = false;
    else if (filters.status === 'hidden') where.isHidden = true;
    // 'all' (or undefined) → no filter
    if (filters.rating) where.avgRating = { gte: filters.rating, lt: filters.rating + 1 };
    if (filters.search) {
      where.OR = [
        { comment: { contains: filters.search, mode: 'insensitive' } },
        { property: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.propertyReview.count({ where }),
      this.prisma.propertyReview.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { id: true, name: true, code: true } },
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return {
      message: msg.reviews.listSuccess,
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async adminGetReview(reviewId: string, msg: Messages) {
    const review = await this.prisma.propertyReview.findUnique({
      where: { id: reviewId },
      include: {
        property: { select: { id: true, name: true, code: true, type: true, ownerId: true } },
        customer: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
        booking: {
          select: {
            id: true,
            checkinDate: true,
            checkoutDate: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
          },
        },
      },
    });
    if (!review) throw new NotFoundException(msg.reviews.notFound);
    return { message: msg.reviews.getSuccess, data: review };
  }

  async countFlagged(msg: Messages) {
    // "Flagged" = currently hidden (moderated). FE uses this for sidebar badge.
    const count = await this.prisma.propertyReview.count({ where: { isHidden: true } });
    return { message: msg.reviews.countFlaggedSuccess, data: { count } };
  }
}
