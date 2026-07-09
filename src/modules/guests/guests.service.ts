import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BOOKING_STATUS, ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';
import { ListGuestsDto } from './dto/list-guests.dto';

/**
 * Guest = User role=CUSTOMER. Derived view (không có model riêng) — xem agreement
 * trong API_SPEC §25. Trade-off: không lưu walk-in chưa đăng ký.
 *
 * Label heuristic (UI hiển thị):
 *   - vip        → ≥ 5 completed bookings
 *   - regular    → ≥ 2 completed bookings (chưa đạt VIP)
 *   - new        → 0–1 completed bookings, không bị ban
 *   - restricted → user.bannedAt != null
 */
type GuestLabel = 'vip' | 'regular' | 'new' | 'restricted';

const LABEL_VIP_THRESHOLD = 5;
const LABEL_REGULAR_THRESHOLD = 2;

function deriveLabel(opts: { bannedAt: Date | null; completedCount: number }): GuestLabel {
  if (opts.bannedAt) return 'restricted';
  if (opts.completedCount >= LABEL_VIP_THRESHOLD) return 'vip';
  if (opts.completedCount >= LABEL_REGULAR_THRESHOLD) return 'regular';
  return 'new';
}

@Injectable()
export class GuestsService {
  constructor(private prisma: PrismaService) {}

  async list(dto: ListGuestsDto, msg: Messages) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: ROLE.CUSTOMER,
      deletedAt: null,
    };

    const keyword = dto.q?.trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword } },
        { email: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    if (dto.label === 'restricted') {
      where.bannedAt = { not: null };
    } else if (dto.label && dto.label !== undefined) {
      where.bannedAt = null;
    }

    const [usersRaw, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          gender: true,
          dateOfBirth: true,
          bannedAt: true,
          bannedReason: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    if (!usersRaw.length) {
      return {
        message: msg.guests.listSuccess,
        data: { items: [], total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }

    // Aggregate booking counts per user in 2 lean queries.
    const userIds = usersRaw.map((u) => u.id);
    const bookingAgg = await this.prisma.booking.groupBy({
      by: ['customerId', 'status'],
      where: { customerId: { in: userIds } },
      _count: { _all: true },
    });

    const lastBookingByUser = await this.prisma.booking.groupBy({
      by: ['customerId'],
      where: { customerId: { in: userIds } },
      _max: { createdAt: true },
    });

    const aggMap = new Map<string, { total: number; completed: number; cancelled: number }>();
    for (const row of bookingAgg) {
      if (!row.customerId) continue;
      const slot = aggMap.get(row.customerId) ?? { total: 0, completed: 0, cancelled: 0 };
      slot.total += row._count._all;
      if (row.status === BOOKING_STATUS.COMPLETED) slot.completed += row._count._all;
      if (row.status === BOOKING_STATUS.CANCELLED) slot.cancelled += row._count._all;
      aggMap.set(row.customerId, slot);
    }
    const lastMap = new Map(
      lastBookingByUser
        .filter((r) => r.customerId)
        .map((r) => [r.customerId as string, r._max.createdAt]),
    );

    let items = usersRaw.map((u) => {
      const stats = aggMap.get(u.id) ?? { total: 0, completed: 0, cancelled: 0 };
      const label = deriveLabel({ bannedAt: u.bannedAt, completedCount: stats.completed });
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        avatar: u.avatar,
        gender: u.gender,
        dateOfBirth: u.dateOfBirth,
        bannedAt: u.bannedAt,
        bannedReason: u.bannedReason,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        stats: {
          totalBookings: stats.total,
          completedBookings: stats.completed,
          cancelledBookings: stats.cancelled,
        },
        lastBookingAt: lastMap.get(u.id) ?? null,
        label,
      };
    });

    // Post-filter by label (vip/regular/new) since label depends on aggregated count.
    if (dto.label && dto.label !== 'restricted') {
      items = items.filter((i) => i.label === dto.label);
    }

    return {
      message: msg.guests.listSuccess,
      data: {
        items,
        total: dto.label && dto.label !== 'restricted' ? items.length : total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOne(id: string, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: ROLE.CUSTOMER, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        gender: true,
        dateOfBirth: true,
        bannedAt: true,
        bannedReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException(msg.guests.notFound);

    // recentBookings giới hạn 50 (mới nhất); stats phải tính trên TOÀN BỘ booking
    // để khớp với list `GET /guests` (đồng bộ, không under-report khi khách > 50 booking).
    const [bookings, statusAgg] = await Promise.all([
      this.prisma.booking.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          propertyId: true,
          checkinDate: true,
          checkoutDate: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          createdAt: true,
          property: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.booking.groupBy({
        by: ['status'],
        where: { customerId: id },
        _count: { _all: true },
      }),
    ]);

    let totalBookings = 0;
    let completedBookings = 0;
    let cancelledBookings = 0;
    for (const row of statusAgg) {
      totalBookings += row._count._all;
      if (row.status === BOOKING_STATUS.COMPLETED) completedBookings += row._count._all;
      if (row.status === BOOKING_STATUS.CANCELLED) cancelledBookings += row._count._all;
    }
    const label = deriveLabel({ bannedAt: user.bannedAt, completedCount: completedBookings });

    return {
      message: msg.guests.getSuccess,
      data: {
        ...user,
        stats: { totalBookings, completedBookings, cancelledBookings },
        lastBookingAt: bookings[0]?.createdAt ?? null,
        label,
        recentBookings: bookings,
      },
    };
  }
}
