import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Messages } from '../../i18n';
import { PROPERTY_CARD_SELECT, toPropertyCard } from './property-card';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  // Idempotent: gọi 2 lần không lỗi, vẫn trả isFavorited=true.
  async add(userId: string, propertyId: string, msg: Messages) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    await this.prisma.userFavoriteProperty.upsert({
      where: { userId_propertyId: { userId, propertyId } },
      create: { userId, propertyId },
      update: {},
    });

    return { message: msg.favorites.addSuccess, data: { propertyId, isFavorited: true } };
  }

  // Idempotent: xoá row không tồn tại không lỗi.
  async remove(userId: string, propertyId: string, msg: Messages) {
    await this.prisma.userFavoriteProperty.deleteMany({
      where: { userId, propertyId },
    });

    return { message: msg.favorites.removeSuccess, data: { propertyId, isFavorited: false } };
  }

  async list(userId: string, page: number, limit: number, msg: Messages) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));

    const where: Prisma.UserFavoritePropertyWhereInput = {
      userId,
      property: { isActive: true, deletedAt: null },
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.userFavoriteProperty.count({ where }),
      this.prisma.userFavoriteProperty.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        select: {
          createdAt: true,
          property: { select: PROPERTY_CARD_SELECT },
        },
      }),
    ]);

    // Mỗi card luôn isFavorited=true vì đây là list favorites của chính user.
    const favoriteIds = new Set(rows.map((r) => r.property.id));

    return {
      message: msg.favorites.listSuccess,
      data: {
        items: rows.map((r) => toPropertyCard(r.property, favoriteIds)),
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  // Trả Set propertyId user đã favorite trong subset cho trước.
  // Dùng ở list/search để populate isFavorited mà không N+1.
  async favoriteIdsAmong(userId: string, propertyIds: string[]): Promise<Set<string>> {
    if (!userId || propertyIds.length === 0) return new Set();
    const rows = await this.prisma.userFavoriteProperty.findMany({
      where: { userId, propertyId: { in: propertyIds } },
      select: { propertyId: true },
    });
    return new Set(rows.map((r) => r.propertyId));
  }

  // Trả full Set propertyId user đã favorite. Dùng cho filter ?favorited=true.
  async allFavoriteIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userFavoriteProperty.findMany({
      where: { userId },
      select: { propertyId: true },
    });
    return rows.map((r) => r.propertyId);
  }
}
