import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { auditContextStorage } from '../../common/als/audit-context.storage';
import type { Messages } from '../../i18n';

export interface LogEntry {
  actorId: string;
  actorRole: number;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Fire-and-forget — never throws. Audit log failures must not block business actions.
   * Callers may `await` or `void` this method.
   */
  async log(entry: LogEntry): Promise<void> {
    // Lấy IP/UA từ AsyncLocalStorage (auto-set bởi AuditContextInterceptor),
    // entry.ipAddress/userAgent ưu tiên hơn nếu caller truyền tay (vd WS gateway).
    const ctx = auditContextStorage.getStore();
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          targetLabel: entry.targetLabel ?? null,
          metadata: (entry.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          ipAddress: entry.ipAddress ?? ctx?.ipAddress ?? null,
          userAgent: entry.userAgent ?? ctx?.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Audit log failed for action=${entry.action} actor=${entry.actorId}: ${(err as Error).message}`,
      );
    }
  }

  async list(
    filters: {
      action?: string;
      targetType?: string;
      actorId?: string;
      search?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
    msg: Messages,
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (filters.action) where.action = filters.action;
    if (filters.targetType) where.targetType = filters.targetType;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.search) {
      where.OR = [
        { targetLabel: { contains: filters.search, mode: 'insensitive' } },
        { targetId: { equals: filters.search } },
      ];
    }
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) (where.createdAt as { gte?: Date }).gte = new Date(filters.from);
      if (filters.to) (where.createdAt as { lte?: Date }).lte = new Date(filters.to);
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Hydrate actor name/email
    const actorIds = Array.from(new Set(items.map((i) => i.actorId)));
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true, role: true },
    });
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    return {
      message: msg.auditLog.listSuccess,
      data: {
        items: items.map((i) => ({
          ...i,
          actor: actorMap.get(i.actorId) ?? null,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
