import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Messages } from '../../i18n';
import { UpdateConsentsDto } from './dto/update-consents.dto';

@Injectable()
export class ConsentsService {
  constructor(private prisma: PrismaService) {}

  private shape(r: { kyc: boolean; marketing: boolean; updatedAt: Date }) {
    return { kyc: r.kyc, marketing: r.marketing, updatedAt: r.updatedAt };
  }

  async get(userId: string, msg: Messages) {
    let row = await this.prisma.userConsent.findUnique({ where: { userId } });
    if (!row) {
      row = await this.prisma.userConsent.create({
        data: { userId },
      });
    }
    return { message: msg.consents.getSuccess, data: this.shape(row) };
  }

  async update(userId: string, dto: UpdateConsentsDto, msg: Messages) {
    // kyc is server-locked; only marketing is updatable
    const row = await this.prisma.userConsent.upsert({
      where: { userId },
      create: { userId, marketing: dto.marketing },
      update: { marketing: dto.marketing },
    });
    return { message: msg.consents.updateSuccess, data: this.shape(row) };
  }
}
