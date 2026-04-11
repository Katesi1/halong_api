import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Messages } from '../../i18n';
import { ROLE, NOTIFICATION_TYPE } from '../../common/constants';

const TYPE_LABELS: Record<number, string> = {
  [NOTIFICATION_TYPE.BOOKING]: 'booking',
  [NOTIFICATION_TYPE.PAYMENT]: 'payment',
  [NOTIFICATION_TYPE.SYSTEM]: 'system',
};

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, msg: Messages) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const data = notifications.map(n => ({
      ...n,
      type: TYPE_LABELS[n.type] || 'system',
    }));

    return { message: msg.notifications.listSuccess, data };
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

  // ─── Helper: tạo notification ──────────────────────────────────────────────

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

  // Notify owner of a property
  async notifyPropertyOwner(
    propertyId: string,
    title: string,
    subtitle: string,
    type: number,
    targetId?: string,
    targetType?: string,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true },
    });
    if (!property) return;

    await this.create({
      userId: property.ownerId,
      title,
      subtitle,
      type,
      targetId,
      targetType,
    });
  }

  // Notify all admins
  async notifyAdmins(
    title: string,
    subtitle: string,
    type: number,
    targetId?: string,
    targetType?: string,
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: ROLE.ADMIN, isActive: true },
      select: { id: true },
    });

    await Promise.all(
      admins.map(admin =>
        this.create({ userId: admin.id, title, subtitle, type, targetId, targetType }),
      ),
    );
  }

  // Notify a specific user
  async notifyUser(
    userId: string,
    title: string,
    subtitle: string,
    type: number,
    targetId?: string,
    targetType?: string,
  ) {
    await this.create({ userId, title, subtitle, type, targetId, targetType });
  }
}
