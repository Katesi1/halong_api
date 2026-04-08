import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Messages } from '../../i18n';
import { NOTIFICATION_TYPE } from '../../common/constants';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, msg: Messages) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return { message: msg.notifications.listSuccess, data: notifications };
  }

  async getUnreadCount(userId: string, msg: Messages) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { message: msg.notifications.unreadCountSuccess, data: { count } };
  }

  async markAsRead(id: string, userId: string, msg: Messages) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException(msg.notifications.notFound);

    await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return { message: msg.notifications.markReadSuccess, data: null };
  }

  async markAllAsRead(userId: string, msg: Messages) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { message: msg.notifications.markAllReadSuccess, data: null };
  }

  // Helper method to create notifications (used by other services)
  async create(data: {
    userId: string;
    title: string;
    subtitle?: string;
    type: number;
    targetId?: string;
    targetType?: string;
  }) {
    return this.prisma.notification.create({ data });
  }
}
