import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Messages } from '../../i18n';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateFeedbackDto, msg: Messages) {
    const fb = await this.prisma.feedback.create({
      data: {
        userId,
        category: dto.category,
        message: dto.message.trim(),
        contact: dto.contact?.trim() ?? null,
        deviceInfo: dto.deviceInfo?.trim() ?? null,
        attachments: (dto.attachments ?? []) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { message: msg.feedback.createSuccess, data: fb };
  }
}
