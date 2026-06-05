import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { CHAT_LIMITS } from '../../common/constants';

@Injectable()
export class ChatRetentionService {
  private readonly logger = new Logger(ChatRetentionService.name);

  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
  ) {}

  /**
   * Mỗi ngày 03:00 — xoá messages cũ hơn RETENTION_DAYS, bỏ qua conversations
   * đang có dispute (hasDispute=true).
   *
   * Conversations vẫn giữ — chỉ messages bị purge. Snapshot
   * `lastMessagePreview` vẫn còn cho inbox UI.
   *
   * Attachment Cloudinary cũng bị xoá đồng bộ để tránh tốn storage.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldMessages() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CHAT_LIMITS.RETENTION_DAYS);

    try {
      // Lấy messageId trước khi xoá để clean attachments
      const oldMessages = await this.prisma.message.findMany({
        where: {
          createdAt: { lt: cutoff },
          conversation: { hasDispute: false },
        },
        select: { id: true },
      });

      if (oldMessages.length === 0) return;

      const messageIds = oldMessages.map((m) => m.id);

      // 1. Xoá attachment Cloudinary + UploadRecord
      try {
        await this.uploadsService.deleteByMessageIds(messageIds);
      } catch (err) {
        this.logger.warn(
          `Attachment cleanup failed: ${(err as Error).message}`,
        );
        // Vẫn tiếp tục xoá message — đỡ leak data trong DB
      }

      // 2. Xoá messages
      const result = await this.prisma.message.deleteMany({
        where: { id: { in: messageIds } },
      });

      this.logger.log(
        `Chat retention: purged ${result.count} messages + attachments older than ${CHAT_LIMITS.RETENTION_DAYS} days`,
      );
    } catch (err) {
      this.logger.error(`Chat retention failed: ${(err as Error).message}`);
    }
  }
}
