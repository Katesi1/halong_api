import {
  Injectable,
  Logger,
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../config/cloudinary.service';
import {
  detectMimeFromBuffer,
  sanitizeFilename,
  ALLOWED_MIMES,
} from './helpers/file-type.helper';
import type { Messages } from '../../i18n';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ORPHAN_TTL_HOURS = 24;

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File | undefined,
    msg: Messages,
  ) {
    if (!file) {
      throw new BadRequestException(msg.uploads.fileRequired);
    }
    if (!file.buffer || file.size === 0) {
      throw new BadRequestException(msg.uploads.fileEmpty);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException(
        msg.uploads.fileTooLarge(MAX_FILE_SIZE_BYTES / 1024 / 1024),
      );
    }

    // Magic bytes check — không tin Content-Type header (attacker fake được).
    const detectedMime = detectMimeFromBuffer(file.buffer);
    if (!detectedMime || !ALLOWED_MIMES.has(detectedMime)) {
      throw new UnsupportedMediaTypeException(msg.uploads.unsupportedType);
    }

    // Verify Content-Type khớp magic bytes — chống MIME confusion attack
    if (file.mimetype !== detectedMime) {
      this.logger.warn(
        `MIME mismatch user=${userId} declared=${file.mimetype} detected=${detectedMime}`,
      );
      // Vẫn chấp nhận, dùng detected; nhưng log để monitor
    }

    const sanitizedName = sanitizeFilename(file.originalname || 'upload');

    // Cloudinary upload
    let uploadResult;
    try {
      uploadResult = await this.cloudinary.uploadAttachment(
        { ...file, mimetype: detectedMime },
        'chat/attachments',
      );
    } catch (err) {
      this.logger.error(
        `Cloudinary upload failed user=${userId}: ${(err as Error).message}`,
      );
      throw new BadRequestException(msg.uploads.uploadFailed);
    }

    const record = await this.prisma.uploadRecord.create({
      data: {
        userId,
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        resourceType: uploadResult.resource_type,
        mimeType: detectedMime,
        originalName: sanitizedName,
        sizeBytes: file.size,
        folder: 'chat/attachments',
      },
    });

    return {
      message: msg.uploads.uploadSuccess,
      data: {
        id: record.id,
        url: record.url,
        type: record.mimeType,
        name: record.originalName,
        size: record.sizeBytes,
        expiresAt: null,
      },
    };
  }

  async delete(
    userId: string,
    uploadId: string,
    msg: Messages,
  ) {
    const record = await this.prisma.uploadRecord.findUnique({
      where: { id: uploadId },
    });
    if (!record) throw new NotFoundException(msg.uploads.notFound);
    if (record.userId !== userId) {
      throw new ForbiddenException(msg.uploads.forbidden);
    }
    if (record.attachedAt) {
      throw new BadRequestException(msg.uploads.alreadyAttached);
    }

    try {
      await this.cloudinary.deleteResource(
        record.publicId,
        record.resourceType as 'image' | 'raw',
      );
    } catch (err) {
      // Log nhưng vẫn xoá record DB
      this.logger.warn(
        `Cloudinary delete failed publicId=${record.publicId}: ${(err as Error).message}`,
      );
    }

    await this.prisma.uploadRecord.delete({ where: { id: uploadId } });
    return { message: msg.uploads.deleteSuccess, data: null };
  }

  /**
   * Đánh dấu nhiều upload đã attach vào message (gọi từ ChatService khi
   * message tạo thành công). Identify bằng URL.
   * - Chỉ đánh dấu URL thuộc sender (chống đánh cắp upload của user khác)
   * - Idempotent: gọi 2 lần với cùng URL không lỗi
   */
  async markAttached(
    userId: string,
    urls: string[],
    messageId: string,
  ): Promise<void> {
    if (!urls || urls.length === 0) return;
    const now = new Date();
    await this.prisma.uploadRecord.updateMany({
      where: {
        userId,
        url: { in: urls },
        attachedAt: null,
      },
      data: {
        attachedAt: now,
        attachedMessageId: messageId,
      },
    });
  }

  /**
   * Cron orphan cleanup: xoá UploadRecord chưa attach vào message nào trong
   * 24h. Tránh tốn storage Cloudinary do user upload rồi không gửi.
   *
   * Chạy mỗi giờ. Mỗi lần xử lý tối đa 200 record để không spike.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOrphans() {
    const cutoff = new Date(Date.now() - ORPHAN_TTL_HOURS * 60 * 60 * 1000);
    const orphans = await this.prisma.uploadRecord.findMany({
      where: {
        attachedAt: null,
        createdAt: { lt: cutoff },
      },
      take: 200,
    });
    if (orphans.length === 0) return;

    let cloudinaryDeleted = 0;
    for (const o of orphans) {
      try {
        await this.cloudinary.deleteResource(
          o.publicId,
          o.resourceType as 'image' | 'raw',
        );
        cloudinaryDeleted++;
      } catch (err) {
        this.logger.warn(
          `Orphan cleanup: Cloudinary delete failed publicId=${o.publicId}: ${(err as Error).message}`,
        );
      }
    }

    const dbDeleted = await this.prisma.uploadRecord.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });

    this.logger.log(
      `Orphan cleanup: cloudinary=${cloudinaryDeleted} db=${dbDeleted.count}`,
    );
  }

  /**
   * Xoá attachment khi message bị purge bởi chat retention cron.
   * Public method để ChatRetentionService gọi.
   */
  async deleteByMessageIds(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const records = await this.prisma.uploadRecord.findMany({
      where: { attachedMessageId: { in: messageIds } },
    });
    if (records.length === 0) return;

    for (const r of records) {
      try {
        await this.cloudinary.deleteResource(
          r.publicId,
          r.resourceType as 'image' | 'raw',
        );
      } catch (err) {
        this.logger.warn(
          `Retention cleanup: Cloudinary delete failed publicId=${r.publicId}: ${(err as Error).message}`,
        );
      }
    }
    await this.prisma.uploadRecord.deleteMany({
      where: { id: { in: records.map((r) => r.id) } },
    });
    this.logger.log(`Retention cleanup: removed ${records.length} attachments`);
  }
}
