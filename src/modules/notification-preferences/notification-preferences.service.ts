import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Messages } from '../../i18n';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Injectable()
export class NotificationPreferencesService {
  constructor(private prisma: PrismaService) {}

  private shape(r: {
    booking: boolean;
    payment: boolean;
    system: boolean;
    quietHours: boolean;
    quietFrom: string;
    quietTo: string;
    updatedAt: Date;
  }) {
    return {
      booking: r.booking,
      payment: r.payment,
      system: r.system,
      quietHours: r.quietHours,
      quietFrom: r.quietFrom,
      quietTo: r.quietTo,
      updatedAt: r.updatedAt,
    };
  }

  async get(userId: string, msg: Messages) {
    let row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!row) {
      row = await this.prisma.notificationPreference.create({
        data: { userId },
      });
    }
    return {
      message: msg.notificationPreferences.getSuccess,
      data: this.shape(row),
    };
  }

  async update(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
    msg: Messages,
  ) {
    const data = {
      ...(dto.booking !== undefined && { booking: dto.booking }),
      ...(dto.payment !== undefined && { payment: dto.payment }),
      ...(dto.system !== undefined && { system: dto.system }),
      ...(dto.quietHours !== undefined && { quietHours: dto.quietHours }),
      ...(dto.quietFrom !== undefined && { quietFrom: dto.quietFrom }),
      ...(dto.quietTo !== undefined && { quietTo: dto.quietTo }),
    };
    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return {
      message: msg.notificationPreferences.updateSuccess,
      data: this.shape(row),
    };
  }
}
