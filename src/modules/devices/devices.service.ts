import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { Messages } from '../../i18n';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Register/update FCM token cho user. Idempotent — nếu token đã tồn tại,
   * upsert để chuyển ownership (logout-login user khác cùng device).
   */
  async register(userId: string, dto: RegisterDeviceDto, msg: Messages) {
    const data = {
      userId,
      fcmToken: dto.fcmToken,
      platform: dto.platform,
      deviceModel: dto.deviceModel || null,
      osVersion: dto.osVersion || null,
      appVersion: dto.appVersion || null,
      locale: dto.locale || null,
      lastActiveAt: new Date(),
    };

    const device = await this.prisma.userDevice.upsert({
      where: { fcmToken: dto.fcmToken },
      create: data,
      update: {
        userId,
        platform: dto.platform,
        deviceModel: data.deviceModel,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
        locale: data.locale,
        lastActiveAt: data.lastActiveAt,
      },
    });

    return {
      message: msg.devices.registerSuccess,
      data: {
        id: device.id,
        platform: device.platform,
        lastActiveAt: device.lastActiveAt,
      },
    };
  }

  async unregister(userId: string, fcmToken: string, msg: Messages) {
    await this.prisma.userDevice.deleteMany({
      where: { userId, fcmToken },
    });
    return { message: msg.devices.unregisterSuccess, data: null };
  }

  async list(userId: string, msg: Messages) {
    const devices = await this.prisma.userDevice.findMany({
      where: { userId },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        platform: true,
        deviceModel: true,
        osVersion: true,
        appVersion: true,
        locale: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
    return { message: msg.devices.listSuccess, data: devices };
  }
}
