import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../config/cloudinary.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Messages } from '../../i18n';
import { ROLE, BOOKING_STATUS, NOTIFICATION_TYPE, KYC_STATUS, AUDIT_ACTION, AUDIT_TARGET_TYPE, getEffectiveOwnerId, isSaleUnassigned } from '../../common/constants';
import { NotificationsService, PushMeta } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { kycRequired } from '../../common/errors/kyc.errors';
import { assertOwnerEntitled } from '../../common/subscription';
import { buildPropertySlug, ensureUniqueSlug } from '../../common/slug';
import { PROPERTY_CARD_SELECT, toPropertyCard } from './property-card';
import { SearchPropertiesDto } from './dto/search-properties.dto';
import { FavoritesService } from './favorites.service';
import { Prisma } from '@prisma/client';

/** Giới hạn phân trang cho danh sách property nội bộ (findAll opt-in). */
const PROPERTY_LIST_DEFAULT_LIMIT = 20;
const PROPERTY_LIST_MAX_LIMIT = 100;

/**
 * Owner phải thoả 2 gate giống lúc tạo property thì property mới hiện public:
 *   - User active (chưa banned, chưa soft-delete)
 *   - kycBypass=true HOẶC (kycStatus='approved' AND subscription entitled)
 *   - Subscription entitled = active HOẶC (trial AND trialEndsAt còn hiệu lực)
 * Mirror logic `isOwnerEntitled` ở `src/common/subscription.ts` — khi owner hết
 * trial/chưa KYC thì các endpoint customer KHÔNG trả property của họ.
 */
function ownerVisibleFilter(): Prisma.UserWhereInput {
  return {
    isActive: true,
    bannedAt: null,
    deletedAt: null,
    OR: [
      { kycBypass: true },
      {
        AND: [
          { kycStatus: 'approved' },
          {
            OR: [
              { subscriptionStatus: 'active' },
              {
                AND: [
                  { subscriptionStatus: 'trial' },
                  { trialEndsAt: { gt: new Date() } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
    private favorites: FavoritesService,
  ) {}

  async findAll(
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    includeInactive?: boolean,
    view?: string,
    moderationStatus?: 'pending' | 'approved' | 'rejected' | 'suspended',
    pagination?: { page?: number; limit?: number },
  ) {
    const effectiveOwnerId = getEffectiveOwnerId(user);
    const where: any = effectiveOwnerId
      ? { ownerId: effectiveOwnerId, deletedAt: null }
      : { deletedAt: null };

    // OWNER/SALE luôn thấy property của mình kể cả pending/rejected/suspended,
    // tránh "biến mất" sau khi tạo. ADMIN/list explicit query mới cần includeInactive.
    const scopedToSelf = user.role === ROLE.OWNER || user.role === ROLE.SALE;
    if (!includeInactive && !scopedToSelf) {
      where.isActive = true;
    }

    if (view) {
      where.view = view;
    }

    if (moderationStatus) {
      where.moderationStatus = moderationStatus;
    }

    const include = {
      owner: { select: { id: true, name: true, phone: true } },
      images: { orderBy: { order: 'asc' as const } },
      _count: { select: { bookings: true } },
    };

    // Phân trang opt-in: chỉ khi client truyền page/limit mới trả shape phân trang.
    // Không truyền → giữ nguyên hành vi cũ (trả mảng) để không phá FE hiện tại.
    if (pagination?.page !== undefined || pagination?.limit !== undefined) {
      const page = Math.max(1, pagination.page ?? 1);
      const limit = Math.min(PROPERTY_LIST_MAX_LIMIT, Math.max(1, pagination.limit ?? PROPERTY_LIST_DEFAULT_LIMIT));
      const [total, items] = await this.prisma.$transaction([
        this.prisma.property.count({ where }),
        this.prisma.property.findMany({
          where,
          include,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return {
        message: msg.properties.listSuccess,
        data: { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
      };
    }

    const properties = await this.prisma.property.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
    });

    return { message: msg.properties.listSuccess, data: properties };
  }

  async findPublic(
    msg: Messages,
    checkinDate?: string,
    checkoutDate?: string,
    guests?: number,
    minPrice?: number,
    maxPrice?: number,
    type?: number,
    view?: string,
    userId?: string | null,
  ) {
    const where: Prisma.PropertyWhereInput = { isActive: true, deletedAt: null, moderationStatus: 'approved', owner: ownerVisibleFilter() };

    if (type !== undefined) where.type = type;
    if (view) where.view = view;
    if (guests) where.maxGuests = { gte: guests };

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.weekdayPrice = {};
      if (minPrice !== undefined) (where.weekdayPrice as Prisma.FloatNullableFilter).gte = minPrice;
      if (maxPrice !== undefined) (where.weekdayPrice as Prisma.FloatNullableFilter).lte = maxPrice;
    }

    let rows = await this.prisma.property.findMany({
      where,
      select: PROPERTY_CARD_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    if (checkinDate && checkoutDate) {
      const blocked = await this.bookedPropertyIds(checkinDate, checkoutDate);
      rows = rows.filter((p) => !blocked.has(p.id));
    }

    const favoriteIds = userId
      ? await this.favorites.favoriteIdsAmong(userId, rows.map((r) => r.id))
      : undefined;

    return {
      message: msg.properties.publicListSuccess,
      data: rows.map((r) => toPropertyCard(r, favoriteIds)),
    };
  }

  async findSearch(
    dto: SearchPropertiesDto,
    userId: string | null,
    msg: Messages,
  ) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    // ?favorited=true bắt buộc auth — anonymous request → 403.
    if (dto.favorited && !userId) {
      throw new ForbiddenException(msg.common.forbidden);
    }

    const where: Prisma.PropertyWhereInput = { isActive: true, deletedAt: null, moderationStatus: 'approved', owner: ownerVisibleFilter() };

    if (dto.type !== undefined) where.type = dto.type;
    if (dto.view) where.view = dto.view;
    if (dto.guests) where.maxGuests = { gte: dto.guests };
    if (dto.bedrooms !== undefined) where.bedrooms = { gte: dto.bedrooms };
    if (dto.minRating !== undefined) where.ratingAvg = { gte: dto.minRating };
    if (dto.amenities && dto.amenities.length > 0) where.amenities = { hasEvery: dto.amenities };
    if (dto.hot) where.isHot = true;

    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      where.weekdayPrice = {};
      if (dto.minPrice !== undefined) (where.weekdayPrice as Prisma.FloatNullableFilter).gte = dto.minPrice;
      if (dto.maxPrice !== undefined) (where.weekdayPrice as Prisma.FloatNullableFilter).lte = dto.maxPrice;
    }

    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { code: { contains: dto.q, mode: 'insensitive' } },
        { address: { contains: dto.q, mode: 'insensitive' } },
      ];
    }

    // Filter ?favorited=true → giao với danh sách property user đã save.
    const favoritedIdList = dto.favorited && userId
      ? await this.favorites.allFavoriteIds(userId)
      : null;
    if (favoritedIdList) {
      if (favoritedIdList.length === 0) {
        // Không có favorite nào → trả page rỗng luôn, khỏi query property.
        return {
          message: msg.properties.publicListSuccess,
          data: { items: [], total: 0, page, limit, totalPages: 1 },
        };
      }
      where.id = { in: favoritedIdList };
    }

    let blocked: Set<string> | null = null;
    if (dto.checkinDate && dto.checkoutDate) {
      blocked = await this.bookedPropertyIds(dto.checkinDate, dto.checkoutDate);
      if (blocked.size > 0) {
        // Nếu đã có id.in (từ favorited), phải kết hợp khéo: kết quả = favoritedSet \ blocked.
        if (favoritedIdList) {
          const filtered = favoritedIdList.filter((id) => !blocked!.has(id));
          where.id = filtered.length > 0 ? { in: filtered } : { in: ['__none__'] };
        } else {
          where.id = { notIn: Array.from(blocked) };
        }
      }
    }

    const orderBy = this.searchOrderBy(dto.sort);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.property.count({ where }),
      this.prisma.property.findMany({
        where,
        select: PROPERTY_CARD_SELECT,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const favoriteIds = userId
      ? await this.favorites.favoriteIdsAmong(userId, rows.map((r) => r.id))
      : undefined;

    return {
      message: msg.properties.publicListSuccess,
      data: {
        items: rows.map((r) => toPropertyCard(r, favoriteIds)),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private searchOrderBy(
    sort: SearchPropertiesDto['sort'],
  ): Prisma.PropertyOrderByWithRelationInput | Prisma.PropertyOrderByWithRelationInput[] {
    switch (sort) {
      case 'price_asc':
        return [{ weekdayPrice: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
      case 'price_desc':
        return [{ weekdayPrice: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
      case 'rating':
        return [{ ratingAvg: 'desc' }, { reviewCount: 'desc' }, { createdAt: 'desc' }];
      case 'newest':
        return { createdAt: 'desc' };
      case 'featured':
      default:
        // Hot property pop lên đầu, sau đó rating/reviewCount/recency.
        return [
          { isHot: 'desc' },
          { ratingAvg: 'desc' },
          { reviewCount: 'desc' },
          { createdAt: 'desc' },
        ];
    }
  }

  private async bookedPropertyIds(
    checkinDate: string,
    checkoutDate: string,
  ): Promise<Set<string>> {
    const checkin = new Date(checkinDate.split('T')[0] + 'T00:00:00.000Z');
    const checkout = new Date(checkoutDate.split('T')[0] + 'T00:00:00.000Z');

    const conflicting = await this.prisma.booking.findMany({
      where: {
        status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
        checkinDate: { lt: checkout },
        checkoutDate: { gt: checkin },
      },
      select: { propertyId: true },
    });

    return new Set(conflicting.map((b) => b.propertyId));
  }

  async findOne(id: string, msg: Messages) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true, name: true, phone: true,
          },
        },
        images: { orderBy: { order: 'asc' } },
        _count: { select: { bookings: true } },
      },
    });

    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);

    return { message: msg.properties.getSuccess, data: property };
  }

  async create(dto: CreatePropertyDto, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    // SALE: assigned can CRU, unassigned cannot create
    if (user.role === ROLE.SALE) {
      if (isSaleUnassigned(user)) {
        throw new ForbiddenException(msg.properties.forbidden);
      }
      // Assigned SALE can create for their owner
    }

    // OWNER must complete KYC before managing properties
    if (user.role === ROLE.OWNER) {
      await this.checkKycApproved(user.id, msg);
    }
    // Apple IAP compliance: chặn khi trial hết hạn / chưa active.
    await assertOwnerEntitled(this.prisma, user, msg);

    const ownerId = user.role === ROLE.ADMIN && dto.ownerId
      ? dto.ownerId
      : user.role === ROLE.SALE && user.ownerId
        ? user.ownerId
        : user.id;

    if (user.role === ROLE.ADMIN && dto.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
      if (!owner) throw new NotFoundException(msg.properties.ownerNotFound);
    }

    const existing = await this.prisma.property.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(msg.properties.codeDuplicate);

    const { ownerId: _, ...createData } = dto;
    const slug = await ensureUniqueSlug(
      buildPropertySlug(dto.name, dto.code),
      async (candidate) =>
        !!(await this.prisma.property.findUnique({ where: { slug: candidate }, select: { id: true } })),
    );
    // Luồng duyệt: OWNER/SALE đăng phòng → 'pending', chờ ADMIN duyệt (không auto-approve).
    // ADMIN tạo trực tiếp → 'approved' luôn (admin chính là người duyệt).
    // isActive=true để owner coi là "đã bật", nhưng public chỉ hiện khi moderationStatus='approved'.
    const isAdminCreator = user.role === ROLE.ADMIN;
    const moderationStatus = isAdminCreator ? 'approved' : 'pending';
    const property = await this.prisma.property.create({
      data: {
        ...createData,
        slug,
        ownerId,
        moderationStatus,
        isActive: true,
      },
      include: {
        owner: { select: { id: true, name: true, phone: true } },
      },
    });

    // Chỉ ping ADMIN khi phòng đang chờ duyệt (cần họ vào xử lý).
    if (moderationStatus === 'pending') {
      await this.notifications.notifyAdmins(
        'Phòng mới chờ duyệt',
        `${property.name} (${property.code}) do ${property.owner.name} đăng — cần duyệt`,
        NOTIFICATION_TYPE.SYSTEM,
        property.id,
        'property',
        { pushType: 'property_pending_review', deepLink: `/admin/properties/${property.id}` },
      );
    }

    return {
      message: moderationStatus === 'pending'
        ? msg.properties.createPendingSuccess
        : msg.properties.createSuccess,
      data: property,
    };
  }

  /** PushMeta cho sự kiện sửa phòng — deep link tới màn property. */
  private propertyEditPush(pushType: string, propertyId: string): PushMeta {
    return { pushType, deepLink: `/host/properties/${propertyId}` };
  }

  async update(id: string, dto: UpdatePropertyDto, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    // Unassigned SALE cannot update
    if (user.role === ROLE.SALE && isSaleUnassigned(user)) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    // OWNER must complete KYC
    if (user.role === ROLE.OWNER) {
      await this.checkKycApproved(user.id, msg);
    }
    await assertOwnerEntitled(this.prisma, user, msg);

    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    if (dto.code && dto.code !== property.code) {
      const existing = await this.prisma.property.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException(msg.properties.codeDuplicate);
    }

    if (
      user.role === ROLE.OWNER &&
      dto.isActive === true &&
      property.moderationStatus === 'suspended'
    ) {
      throw new ForbiddenException(msg.properties.cannotReactivateSuspended);
    }

    const data: any = { ...dto };
    // Property bị admin reject → OWNER sửa lại thì gửi duyệt lại (về 'pending'), KHÔNG auto-approve.
    if (user.role === ROLE.OWNER && property.moderationStatus === 'rejected') {
      data.moderationStatus = 'pending';
      data.moderationRejectedReason = null;
      data.moderationReviewedAt = null;
      data.moderationReviewedBy = null;
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        images: { orderBy: { order: 'asc' } },
        _count: { select: { bookings: true } },
      },
    });

    await this.notifications.notifyPropertyTeam(
      id,
      user.id,
      'Phòng được cập nhật',
      `${updated.name} (${(updated as any).code}) đã được cập nhật`,
      NOTIFICATION_TYPE.SYSTEM,
      id,
      'property',
      this.propertyEditPush('property_updated', id),
    );

    return { message: msg.properties.updateSuccess, data: updated };
  }

  async remove(id: string, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    // Only ADMIN and OWNER can delete
    if (user.role === ROLE.SALE) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    await this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.notifications.notifyAdmins(
      'Phòng đã bị xóa',
      `${property.name} (${property.code}) đã bị vô hiệu hóa`,
      NOTIFICATION_TYPE.SYSTEM,
      id,
      'property',
    );

    return { message: msg.properties.deleteSuccess, data: null };
  }

  // ─── Prices ───────────────────────────────────────────────────────────────

  async updatePrices(
    id: string,
    dto: { weekdayPrice: number; weekendPrice: number; holidayPrice: number; adultSurcharge: number; childSurcharge: number },
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    const updated = await this.prisma.property.update({
      where: { id },
      data: dto,
      select: {
        id: true, name: true, code: true,
        weekdayPrice: true, weekendPrice: true, holidayPrice: true,
        adultSurcharge: true, childSurcharge: true,
      },
    });

    await this.notifications.notifyPropertyTeam(
      id,
      user.id,
      'Bảng giá được cập nhật',
      `${updated.name} (${updated.code}) đã cập nhật bảng giá`,
      NOTIFICATION_TYPE.SYSTEM,
      id,
      'property',
      this.propertyEditPush('property_price_updated', id),
    );

    return { message: msg.properties.updatePricesSuccess, data: updated };
  }

  // ─── Image Management ──────────────────────────────────────────────────────

  async uploadImages(
    propertyId: string,
    files: Express.Multer.File[],
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException(msg.properties.noFiles);
    }

    await this.getPropertyWithAccess(propertyId, user, msg);

    const currentCount = await this.prisma.propertyImage.count({ where: { propertyId } });
    const maxImages = 30;
    if (currentCount + files.length > maxImages) {
      throw new ConflictException(msg.properties.maxImages(maxImages));
    }

    const uploadedImages = await Promise.all(
      files.map(async (file, index) => {
        const result = await this.cloudinary.uploadImage(
          file,
          `property/${propertyId}`,
        );
        return {
          propertyId,
          imageUrl: result.secure_url,
          publicId: result.public_id,
          isCover: currentCount === 0 && index === 0,
          order: currentCount + index,
        };
      }),
    );

    const images = await this.prisma.$transaction(
      uploadedImages.map((img) => this.prisma.propertyImage.create({ data: img })),
    );

    const prop = await this.prisma.property.findUnique({ where: { id: propertyId }, select: { name: true, code: true } });
    await this.notifications.notifyPropertyTeam(
      propertyId,
      user.id,
      'Ảnh mới được tải lên',
      `${prop?.name} (${prop?.code}) — ${images.length} ảnh mới`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
      this.propertyEditPush('property_images_updated', propertyId),
    );

    return { message: msg.properties.uploadSuccess(images.length), data: images };
  }

  async deleteImage(
    propertyId: string,
    imageId: string,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const property = await this.getPropertyWithAccess(propertyId, user, msg);

    const image = await this.prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId },
    });
    if (!image) throw new NotFoundException(msg.properties.imageNotFound);

    await this.cloudinary.deleteImage(image.publicId);
    await this.prisma.propertyImage.delete({ where: { id: imageId } });

    if (image.isCover) {
      const firstImage = await this.prisma.propertyImage.findFirst({
        where: { propertyId },
        orderBy: { order: 'asc' },
      });
      if (firstImage) {
        await this.prisma.propertyImage.update({
          where: { id: firstImage.id },
          data: { isCover: true },
        });
      }
    }

    await this.notifications.notifyPropertyTeam(
      propertyId,
      user.id,
      'Ảnh đã bị xóa',
      `${(property as any).name} (${(property as any).code}): một ảnh đã bị xóa`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
      this.propertyEditPush('property_images_updated', propertyId),
    );

    return { message: msg.properties.deleteImageSuccess, data: null };
  }

  async setCoverImage(
    propertyId: string,
    imageId: string,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    await this.getPropertyWithAccess(propertyId, user, msg);

    await this.prisma.propertyImage.updateMany({
      where: { propertyId },
      data: { isCover: false },
    });

    const image = await this.prisma.propertyImage.update({
      where: { id: imageId },
      data: { isCover: true },
    });

    return { message: msg.properties.setCoverSuccess, data: image };
  }

  // ─── Public Detail (no auth, có giá, kèm host sanitized) ───────────────────

  // Endpoint cho trang chi tiết FE web khách hàng. Tra theo slug, trả full data
  // gồm giá (weekday/weekend/holiday), description/rules/services, ảnh,
  // rating breakdown, host KYC + memberSince. KHÔNG trả phone/email chủ nhà.
  async findPublicDetail(slug: string, msg: Messages) {
    const property = await this.prisma.property.findFirst({
      where: { slug, isActive: true, deletedAt: null, moderationStatus: 'approved', owner: ownerVisibleFilter() },
      select: {
        id: true,
        slug: true,
        name: true,
        code: true,
        type: true,
        view: true,
        address: true,
        city: true,
        district: true,
        latitude: true,
        longitude: true,
        mapLink: true,
        description: true,
        amenities: true,
        rules: true,
        services: true,
        bedrooms: true,
        bathrooms: true,
        standardGuests: true,
        maxGuests: true,
        floorArea: true,
        weekdayPrice: true,
        weekendPrice: true,
        holidayPrice: true,
        cancellationPolicy: true,
        checkInTime: true,
        checkOutTime: true,
        ratingAvg: true,
        reviewCount: true,
        isHot: true,
        images: {
          select: { id: true, imageUrl: true, isCover: true, order: true },
          orderBy: { order: 'asc' },
        },
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true,
            kycStatus: true,
            kycBypass: true,
            createdAt: true,
            _count: { select: { properties: { where: { isActive: true, deletedAt: null } } } },
          },
        },
      },
    });

    if (!property) throw new NotFoundException(msg.properties.notFound);

    // Rating breakdown — query 1 lần, không N+1.
    const reviews = await this.prisma.propertyReview.findMany({
      where: { propertyId: property.id, isHidden: false },
      select: {
        cleanliness: true,
        location: true,
        amenities: true,
        service: true,
        value: true,
        accuracy: true,
        avgRating: true,
      },
    });

    const totalReviews = reviews.length;
    const ratingBreakdown =
      totalReviews === 0
        ? {
            overall: 0,
            cleanliness: 0,
            location: 0,
            amenities: 0,
            service: 0,
            value: 0,
            accuracy: 0,
            count: 0,
          }
        : (() => {
            let sum = 0, c = 0, l = 0, a = 0, s = 0, v = 0, ac = 0;
            for (const r of reviews) {
              sum += r.avgRating;
              c += r.cleanliness;
              l += r.location;
              a += r.amenities;
              s += r.service;
              v += r.value;
              ac += r.accuracy;
            }
            const round = (n: number) => Math.round((n / totalReviews) * 100) / 100;
            return {
              overall: round(sum),
              cleanliness: round(c),
              location: round(l),
              amenities: round(a),
              service: round(s),
              value: round(v),
              accuracy: round(ac),
              count: totalReviews,
            };
          })();

    const memberSince = property.owner.createdAt
      ? `${property.owner.createdAt.getUTCFullYear()}-${String(
          property.owner.createdAt.getUTCMonth() + 1,
        ).padStart(2, '0')}`
      : null;

    // Build payload (omit owner internal fields).
    const { owner, ...propertyFields } = property;

    return {
      message: msg.properties.publicDetailSuccess,
      data: {
        ...propertyFields,
        rating: property.ratingAvg,
        reviewCount: property.reviewCount,
        ratingBreakdown,
        host: {
          name: owner.name,
          avatarUrl: owner.avatar,
          isKycVerified: owner.kycBypass || owner.kycStatus === 'approved',
          memberSince,
          totalProperties: owner._count.properties,
          responseRate: null,
        },
      },
    };
  }

  /**
   * Similar properties — gợi ý ở cuối trang property detail (carousel "Cơ sở khác").
   * Ưu tiên: cùng district → cùng city → cùng type. Loại bỏ chính property gốc + inactive/deleted.
   * Sort theo isHot desc → ratingAvg desc → reviewCount desc.
   */
  async findSimilarBySlug(slug: string, limit: number, msg: Messages) {
    const source = await this.prisma.property.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      select: { id: true, type: true, city: true, district: true },
    });
    if (!source) throw new NotFoundException(msg.properties.notFound);

    const safeLimit = Math.min(Math.max(1, Number(limit) || 8), 20);

    // Strategy: build OR list theo độ ưu tiên (district > city > type),
    // sort isHot/rating/reviewCount, lấy top N.
    const orFilters: any[] = [];
    if (source.district) orFilters.push({ district: source.district });
    if (source.city) orFilters.push({ city: source.city });
    orFilters.push({ type: source.type });

    const items = await this.prisma.property.findMany({
      where: {
        id: { not: source.id },
        isActive: true,
        deletedAt: null,
        moderationStatus: 'approved',
        owner: ownerVisibleFilter(),
        OR: orFilters,
      },
      select: PROPERTY_CARD_SELECT,
      orderBy: [
        { isHot: 'desc' },
        { ratingAvg: 'desc' },
        { reviewCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: safeLimit,
    });

    return {
      message: msg.properties.listSuccess,
      data: items.map((row) => toPropertyCard(row as any)),
    };
  }

  /**
   * Public list theo OWNER — dùng cho web "lịch phòng" mà OWNER share trong nhóm Zalo.
   * SALE click link không cần login. Trả tất cả property active+approved của owner,
   * kèm ownerPhone để bấm Zalo gọi nhanh. Owner banned/inactive → 404.
   */
  async findPublicByOwner(ownerId: string, msg: Messages) {
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerId, ...ownerVisibleFilter() },
      select: { id: true, name: true, phone: true, avatar: true },
    });
    if (!owner) throw new NotFoundException(msg.properties.ownerNotFound);

    const items = await this.prisma.property.findMany({
      where: {
        ownerId,
        isActive: true,
        deletedAt: null,
        moderationStatus: 'approved',
      },
      select: PROPERTY_CARD_SELECT,
      orderBy: [{ isHot: 'desc' }, { name: 'asc' }],
    });

    return {
      message: msg.properties.publicByOwnerSuccess,
      data: {
        owner: {
          id: owner.id,
          name: owner.name,
          phone: owner.phone,
          avatarUrl: owner.avatar,
        },
        items: items.map((row) => toPropertyCard(row as any)),
        total: items.length,
      },
    };
  }

  // ─── Public Share (no auth, no prices) ──────────────────────────────────────

  async findShareDetail(id: string, msg: Messages) {
    const property = await this.prisma.property.findFirst({
      where: { id, isActive: true, deletedAt: null, moderationStatus: 'approved', owner: ownerVisibleFilter() },
      select: {
        id: true,
        slug: true,
        name: true,
        code: true,
        type: true,
        view: true,
        address: true,
        city: true,
        district: true,
        latitude: true,
        longitude: true,
        mapLink: true,
        bedrooms: true,
        bathrooms: true,
        standardGuests: true,
        maxGuests: true,
        floorArea: true,
        adultSurcharge: true,
        childSurcharge: true,
        amenities: true,
        description: true,
        rules: true,
        services: true,
        cancellationPolicy: true,
        checkInTime: true,
        checkOutTime: true,
        ratingAvg: true,
        reviewCount: true,
        isHot: true,
        images: {
          select: { id: true, imageUrl: true, isCover: true, order: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(msg.properties.notFound);
    }

    return { message: msg.properties.shareSuccess, data: property };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async getPropertyWithAccess(
    id: string,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);
    return property;
  }

  private checkOwnerAccess(property: any, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId && property.ownerId !== effectiveOwnerId) {
      throw new ForbiddenException(msg.properties.forbidden);
    }
  }

  private async checkKycApproved(userId: string, msg: Messages) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true, kycBypass: true },
    });
    if (!owner) throw kycRequired(msg.kyc.propertyRequiresKyc);
    // ADMIN-granted bypass skips KYC requirement
    if (owner.kycBypass) return;
    if (owner.kycStatus !== KYC_STATUS.APPROVED) {
      throw kycRequired(msg.kyc.propertyRequiresKyc);
    }
  }

  // ─── Admin moderation ─────────────────────────────────────────────────────

  async approveProperty(
    adminId: string,
    propertyId: string,
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, name: true, moderationStatus: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        moderationStatus: 'approved',
        moderationRejectedReason: null,
        moderationReviewedAt: new Date(),
        moderationReviewedBy: adminId,
        isActive: true,
      },
    });

    await this.notifications.notifyUser(
      property.ownerId,
      'Cơ sở đã được duyệt',
      `Cơ sở ${property.name} đã được admin duyệt và hiển thị công khai.`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
      { pushType: 'property_approved', deepLink: `/host/properties/${propertyId}` },
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.PROPERTY_APPROVE,
      targetType: AUDIT_TARGET_TYPE.PROPERTY,
      targetId: propertyId,
      targetLabel: property.name,
    });

    return { message: msg.properties.approveSuccess, data: updated };
  }

  async rejectProperty(
    adminId: string,
    propertyId: string,
    reason: string,
    msg: Messages,
  ) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException(msg.properties.rejectReasonRequired);
    }
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, name: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        moderationStatus: 'rejected',
        moderationRejectedReason: reason.trim(),
        moderationReviewedAt: new Date(),
        moderationReviewedBy: adminId,
        isActive: false,
      },
    });

    await this.notifications.notifyUser(
      property.ownerId,
      'Cơ sở bị từ chối duyệt',
      `Cơ sở ${property.name} bị admin từ chối. Lý do: ${reason}`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
      { pushType: 'property_rejected', deepLink: `/host/properties/${propertyId}` },
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.PROPERTY_REJECT,
      targetType: AUDIT_TARGET_TYPE.PROPERTY,
      targetId: propertyId,
      targetLabel: property.name,
      metadata: { reason: reason.trim() },
    });

    return { message: msg.properties.rejectSuccess, data: updated };
  }

  async setHot(
    adminId: string,
    propertyId: string,
    isHot: boolean,
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true, code: true, deletedAt: true },
    });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: { isHot },
      select: { id: true, name: true, code: true, isHot: true },
    });

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.PROPERTY_SET_HOT,
      targetType: AUDIT_TARGET_TYPE.PROPERTY,
      targetId: propertyId,
      targetLabel: property.name,
      metadata: { isHot },
    });

    return {
      message: isHot ? msg.properties.setHotOnSuccess : msg.properties.setHotOffSuccess,
      data: updated,
    };
  }

  async suspendProperty(
    adminId: string,
    propertyId: string,
    reason: string | undefined,
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, name: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        moderationStatus: 'suspended',
        moderationRejectedReason: reason?.trim() ?? 'Suspended by admin',
        moderationReviewedAt: new Date(),
        moderationReviewedBy: adminId,
        isActive: false,
      },
    });

    await this.notifications.notifyUser(
      property.ownerId,
      'Cơ sở bị tạm ngưng',
      `Cơ sở ${property.name} đã bị admin tạm ngưng${reason ? `. Lý do: ${reason}` : '.'}`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
      { pushType: 'property_suspended', deepLink: `/host/properties/${propertyId}` },
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.PROPERTY_SUSPEND,
      targetType: AUDIT_TARGET_TYPE.PROPERTY,
      targetId: propertyId,
      targetLabel: property.name,
      metadata: { reason: reason?.trim() ?? null },
    });

    return { message: msg.properties.suspendSuccess, data: updated };
  }
}
