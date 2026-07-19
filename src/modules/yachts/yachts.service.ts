import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../config/cloudinary.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BLOCKING_YACHT_STATUSES,
  NOTIFICATION_TYPE,
  isAdminOrSystemSale,
} from '../../common/constants';
import { slugify, ensureUniqueSlug } from '../../common/slug';
import { resolveNightlyRate } from '../bookings/booking-pricing';
import type { Messages } from '../../i18n';
import { CreateYachtDto } from './dto/create-yacht.dto';
import { UpdateYachtDto } from './dto/update-yacht.dto';
import { UpdateYachtPricesDto } from './dto/update-yacht-prices.dto';
import { SearchYachtsDto } from './dto/search-yachts.dto';

type CallerUser = { id: string; role: number; scope?: string | null };

const MAX_IMAGES = 30;

/** Field set trả cho admin/system-sale (full). */
const YACHT_INCLUDE = {
  images: { orderBy: [{ isCover: 'desc' as const }, { order: 'asc' as const }] },
} satisfies Prisma.YachtInclude;

@Injectable()
export class YachtsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private notifications: NotificationsService,
  ) {}

  /** Chỉ ADMIN hoặc SALE hệ thống được quản lý du thuyền. */
  private assertCanManage(user: CallerUser, msg: Messages): void {
    if (!isAdminOrSystemSale(user)) {
      throw new ForbiddenException(msg.yachts.forbidden);
    }
  }

  private async loadYachtOrThrow(id: string, msg: Messages) {
    const yacht = await this.prisma.yacht.findUnique({ where: { id }, include: YACHT_INCLUDE });
    if (!yacht || yacht.deletedAt) throw new NotFoundException(msg.yachts.notFound);
    return yacht;
  }

  // ─── CRUD (ADMIN + SALE hệ thống) ──────────────────────────────────────────

  async create(dto: CreateYachtDto, user: CallerUser, msg: Messages) {
    this.assertCanManage(user, msg);

    const code = dto.code.trim();
    const dup = await this.prisma.yacht.findUnique({ where: { code } });
    if (dup) throw new ConflictException(msg.yachts.codeDuplicate);

    const slug = await ensureUniqueSlug(
      slugify(`${dto.name}-${code}`) || `yacht-${code.toLowerCase()}`,
      async (candidate) => !!(await this.prisma.yacht.findUnique({ where: { slug: candidate } })),
    );

    const yacht = await this.prisma.yacht.create({
      data: {
        createdById: user.id,
        name: dto.name.trim(),
        code,
        slug,
        description: dto.description ?? null,
        cabins: dto.cabins ?? 1,
        standardGuests: dto.standardGuests ?? 2,
        standardChildren: dto.standardChildren ?? 0,
        maxGuests: dto.maxGuests ?? 2,
        lengthMeters: dto.lengthMeters ?? null,
        shipType: dto.shipType ?? null,
        departurePoint: dto.departurePoint ?? null,
        durationText: dto.durationText ?? null,
        itinerary: (dto.itinerary as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        amenities: dto.amenities ?? [],
        services: dto.services ?? [],
        rules: dto.rules ?? null,
        cancellationPolicy: dto.cancellationPolicy ?? 0,
        checkInTime: dto.checkInTime ?? '12:00',
        checkOutTime: dto.checkOutTime ?? '11:00',
        weekdayPrice: dto.weekdayPrice ?? null,
        weekendPrice: dto.weekendPrice ?? null,
        holidayPrice: dto.holidayPrice ?? null,
        weekdayChildPrice: dto.weekdayChildPrice ?? null,
        weekendChildPrice: dto.weekendChildPrice ?? null,
        holidayChildPrice: dto.holidayChildPrice ?? null,
      },
      include: YACHT_INCLUDE,
    });

    return { message: msg.yachts.createSuccess, data: yacht };
  }

  async update(id: string, dto: UpdateYachtDto, user: CallerUser, msg: Messages) {
    this.assertCanManage(user, msg);
    await this.loadYachtOrThrow(id, msg);

    const data: Prisma.YachtUpdateInput = {};
    // Copy các field vô hướng nếu được truyền.
    const scalarKeys: (keyof UpdateYachtDto)[] = [
      'name', 'description', 'cabins', 'standardGuests', 'standardChildren', 'maxGuests',
      'lengthMeters', 'shipType', 'departurePoint', 'durationText', 'amenities', 'services',
      'rules', 'cancellationPolicy', 'checkInTime', 'checkOutTime', 'weekdayPrice',
      'weekendPrice', 'holidayPrice', 'weekdayChildPrice', 'weekendChildPrice',
      'holidayChildPrice', 'isActive',
    ];
    for (const key of scalarKeys) {
      if (dto[key] !== undefined) (data as Record<string, unknown>)[key] = dto[key];
    }
    if (dto.itinerary !== undefined) {
      data.itinerary = (dto.itinerary as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull;
    }

    const yacht = await this.prisma.yacht.update({ where: { id }, data, include: YACHT_INCLUDE });
    return { message: msg.yachts.updateSuccess, data: yacht };
  }

  async remove(id: string, user: CallerUser, msg: Messages) {
    this.assertCanManage(user, msg);
    await this.loadYachtOrThrow(id, msg);
    await this.prisma.yacht.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { message: msg.yachts.deleteSuccess, data: null };
  }

  async findAll(
    user: CallerUser,
    msg: Messages,
    opts: { includeInactive?: boolean; page?: number; limit?: number },
  ) {
    this.assertCanManage(user, msg);
    const where: Prisma.YachtWhereInput = { deletedAt: null };
    if (!opts.includeInactive) where.isActive = true;

    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

    const [total, items] = await this.prisma.$transaction([
      this.prisma.yacht.count({ where }),
      this.prisma.yacht.findMany({
        where,
        include: YACHT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      message: msg.yachts.listSuccess,
      data: { items, total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: CallerUser, msg: Messages) {
    this.assertCanManage(user, msg);
    const yacht = await this.loadYachtOrThrow(id, msg);
    return { message: msg.yachts.getSuccess, data: yacht };
  }

  // ─── Public ────────────────────────────────────────────────────────────────

  async findPublic(dto: SearchYachtsDto, msg: Messages) {
    const page = Math.max(1, dto.page ?? 1);
    const limit = Math.min(50, Math.max(1, dto.limit ?? 20));

    const where: Prisma.YachtWhereInput = { isActive: true, deletedAt: null };
    if (dto.q) where.name = { contains: dto.q, mode: 'insensitive' };
    if (dto.minPrice != null || dto.maxPrice != null) {
      where.weekdayPrice = {
        ...(dto.minPrice != null ? { gte: dto.minPrice } : {}),
        ...(dto.maxPrice != null ? { lte: dto.maxPrice } : {}),
      };
    }

    let orderBy: Prisma.YachtOrderByWithRelationInput = { createdAt: 'desc' };
    if (dto.sort === 'price_asc') orderBy = { weekdayPrice: 'asc' };
    else if (dto.sort === 'price_desc') orderBy = { weekdayPrice: 'desc' };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.yacht.count({ where }),
      this.prisma.yacht.findMany({
        where,
        include: YACHT_INCLUDE,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      message: msg.yachts.publicListSuccess,
      data: {
        items: items.map((y) => this.toPublicCard(y)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicDetail(slug: string, msg: Messages) {
    const yacht = await this.prisma.yacht.findUnique({ where: { slug }, include: YACHT_INCLUDE });
    if (!yacht || !yacht.isActive || yacht.deletedAt) {
      throw new NotFoundException(msg.yachts.notFound);
    }
    return { message: msg.yachts.publicDetailSuccess, data: yacht };
  }

  private toPublicCard(y: {
    id: string;
    name: string;
    slug: string;
    code: string;
    departurePoint: string | null;
    durationText: string | null;
    maxGuests: number;
    weekdayPrice: number | null;
    ratingAvg: number;
    reviewCount: number;
    images: Array<{ imageUrl: string; isCover: boolean }>;
  }) {
    const cover = y.images.find((i) => i.isCover) ?? y.images[0] ?? null;
    return {
      id: y.id,
      name: y.name,
      slug: y.slug,
      code: y.code,
      departurePoint: y.departurePoint,
      durationText: y.durationText,
      maxGuests: y.maxGuests,
      minPrice: y.weekdayPrice,
      ratingAvg: y.ratingAvg,
      reviewCount: y.reviewCount,
      coverImageUrl: cover?.imageUrl ?? null,
    };
  }

  // ─── Pricing ───────────────────────────────────────────────────────────────

  async updatePrices(id: string, dto: UpdateYachtPricesDto, user: CallerUser, msg: Messages) {
    this.assertCanManage(user, msg);
    await this.loadYachtOrThrow(id, msg);
    const yacht = await this.prisma.yacht.update({
      where: { id },
      data: {
        weekdayPrice: dto.weekdayPrice,
        weekendPrice: dto.weekendPrice,
        holidayPrice: dto.holidayPrice,
        weekdayChildPrice: dto.weekdayChildPrice ?? null,
        weekendChildPrice: dto.weekendChildPrice ?? null,
        holidayChildPrice: dto.holidayChildPrice ?? null,
      },
      select: {
        id: true,
        name: true,
        code: true,
        weekdayPrice: true,
        weekendPrice: true,
        holidayPrice: true,
        weekdayChildPrice: true,
        weekendChildPrice: true,
        holidayChildPrice: true,
      },
    });
    return { message: msg.yachts.updatePricesSuccess, data: yacht };
  }

  // ─── Images ────────────────────────────────────────────────────────────────

  async uploadImages(id: string, files: Express.Multer.File[], user: CallerUser, msg: Messages) {
    this.assertCanManage(user, msg);
    if (!files || files.length === 0) throw new BadRequestException(msg.yachts.noFiles);
    await this.loadYachtOrThrow(id, msg);

    const currentCount = await this.prisma.yachtImage.count({ where: { yachtId: id } });
    if (currentCount + files.length > MAX_IMAGES) {
      throw new BadRequestException(msg.yachts.maxImages(MAX_IMAGES));
    }

    const uploaded = await Promise.all(
      files.map(async (file, index) => {
        const result = await this.cloudinary.uploadImage(file, `yacht/${id}`);
        return {
          yachtId: id,
          imageUrl: result.secure_url,
          publicId: result.public_id,
          isCover: currentCount === 0 && index === 0,
          order: currentCount + index,
        };
      }),
    );

    await this.prisma.$transaction(
      uploaded.map((data) => this.prisma.yachtImage.create({ data })),
    );

    const yacht = await this.loadYachtOrThrow(id, msg);
    return { message: msg.yachts.uploadSuccess(files.length), data: yacht };
  }

  async deleteImage(id: string, imageId: string, user: CallerUser, msg: Messages) {
    this.assertCanManage(user, msg);
    await this.loadYachtOrThrow(id, msg);

    const image = await this.prisma.yachtImage.findFirst({ where: { id: imageId, yachtId: id } });
    if (!image) throw new NotFoundException(msg.yachts.imageNotFound);

    await this.cloudinary.deleteImage(image.publicId).catch(() => undefined);
    await this.prisma.yachtImage.delete({ where: { id: imageId } });

    // Nếu xoá ảnh cover → set ảnh còn lại đầu tiên làm cover.
    if (image.isCover) {
      const next = await this.prisma.yachtImage.findFirst({
        where: { yachtId: id },
        orderBy: { order: 'asc' },
      });
      if (next) {
        await this.prisma.yachtImage.update({ where: { id: next.id }, data: { isCover: true } });
      }
    }

    return { message: msg.yachts.deleteImageSuccess, data: null };
  }

  async setCoverImage(id: string, imageId: string, user: CallerUser, msg: Messages) {
    this.assertCanManage(user, msg);
    await this.loadYachtOrThrow(id, msg);

    const image = await this.prisma.yachtImage.findFirst({ where: { id: imageId, yachtId: id } });
    if (!image) throw new NotFoundException(msg.yachts.imageNotFound);

    await this.prisma.$transaction([
      this.prisma.yachtImage.updateMany({ where: { yachtId: id }, data: { isCover: false } }),
      this.prisma.yachtImage.update({ where: { id: imageId }, data: { isCover: true } }),
    ]);

    return { message: msg.yachts.setCoverSuccess, data: null };
  }

  // ─── Calendar (public availability grid) ────────────────────────────────────

  async getCalendar(id: string, year: number, month: number, msg: Messages) {
    const yacht = await this.prisma.yacht.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        deletedAt: true,
        weekdayPrice: true,
        weekendPrice: true,
        holidayPrice: true,
        weekdayChildPrice: true,
        weekendChildPrice: true,
        holidayChildPrice: true,
      },
    });
    if (!yacht || !yacht.isActive || yacht.deletedAt) {
      throw new NotFoundException(msg.yachts.notFound);
    }

    // Range [first-of-month, first-of-next-month) theo UTC.
    const rangeStart = new Date(Date.UTC(year, month - 1, 1));
    const rangeEnd = new Date(Date.UTC(year, month, 1));

    const [bookings, locks] = await this.prisma.$transaction([
      this.prisma.yachtBooking.findMany({
        where: {
          yachtId: id,
          status: { in: [...BLOCKING_YACHT_STATUSES] },
          checkinDate: { lt: rangeEnd },
          checkoutDate: { gt: rangeStart },
        },
        select: {
          id: true,
          status: true,
          checkinDate: true,
          checkoutDate: true,
          customerName: true,
        },
      }),
      this.prisma.yachtCalendarLock.findMany({
        where: { yachtId: id, date: { gte: rangeStart, lt: rangeEnd } },
      }),
    ]);

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lockByDay = new Map(locks.map((l) => [l.date.toISOString().slice(0, 10), l]));

    const days: Array<{
      date: string;
      status: string;
      price: number | null; // giá NGƯỜI LỚN/khách theo ngày
      childPrice: number | null; // giá TRẺ EM/khách theo ngày (null = miễn phí)
      priceType: string;
      bookingId: string | null;
      note: string | null;
    }> = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(Date.UTC(year, month - 1, d));
      const key = date.toISOString().slice(0, 10);
      let status = 'available';
      let bookingId: string | null = null;
      let note: string | null = null;

      if (lockByDay.has(key)) status = 'locked';

      const covering = bookings.find((b) => b.checkinDate <= date && b.checkoutDate > date);
      if (covering) {
        status = covering.status === 0 || covering.status === 1 ? 'hold' : 'booked';
        bookingId = covering.id;
        note = covering.customerName ?? null;
      }

      // Giá theo ngày (holiday > weekend > weekday) — người lớn + trẻ em (per-person).
      const rate = resolveNightlyRate(date, {
        weekdayPrice: yacht.weekdayPrice,
        weekendPrice: yacht.weekendPrice,
        holidayPrice: yacht.holidayPrice,
      });
      const childRate = resolveNightlyRate(date, {
        weekdayPrice: yacht.weekdayChildPrice,
        weekendPrice: yacht.weekendChildPrice,
        holidayPrice: yacht.holidayChildPrice,
      });

      days.push({
        date: key,
        status,
        price: rate.amount,
        childPrice: childRate.amount,
        priceType: rate.type,
        bookingId,
        note,
      });
    }

    return {
      message: msg.yachts.calendarSuccess,
      data: { yacht: { id: yacht.id, name: yacht.name, code: yacht.code }, year, month, days },
    };
  }
}
