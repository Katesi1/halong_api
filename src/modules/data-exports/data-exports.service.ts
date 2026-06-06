import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Messages } from '../../i18n';

@Injectable()
export class DataExportsService {
  constructor(private prisma: PrismaService) {}

  private shape(r: {
    id: string;
    status: string;
    requestedAt: Date;
    downloadUrl: string | null;
    expiresAt: Date | null;
  }) {
    return {
      id: r.id,
      status: r.status,
      requestedAt: r.requestedAt,
      downloadUrl: r.downloadUrl,
      expiresAt: r.expiresAt,
    };
  }

  async create(userId: string, msg: Messages) {
    const existing = await this.prisma.dataExportRequest.findFirst({
      where: { userId, status: { in: ['pending', 'processing'] } },
      orderBy: { requestedAt: 'desc' },
    });
    if (existing) {
      return {
        message: msg.dataExports.createSuccess,
        data: this.shape(existing),
      };
    }
    const created = await this.prisma.dataExportRequest.create({
      data: { userId, status: 'pending' },
    });
    return {
      message: msg.dataExports.createSuccess,
      data: this.shape(created),
    };
  }

  async list(userId: string, msg: Messages) {
    const items = await this.prisma.dataExportRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });

    // Lazy expire — flip ready→expired if past expiresAt
    const now = new Date();
    const expiredIds = items
      .filter(
        (i) =>
          i.status === 'ready' && i.expiresAt && i.expiresAt.getTime() < now.getTime(),
      )
      .map((i) => i.id);
    if (expiredIds.length > 0) {
      await this.prisma.dataExportRequest.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'expired' },
      });
      for (const i of items) {
        if (expiredIds.includes(i.id)) i.status = 'expired';
      }
    }

    return {
      message: msg.dataExports.listSuccess,
      data: { items: items.map((i) => this.shape(i)) },
    };
  }
}
