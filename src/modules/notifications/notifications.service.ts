import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { Messages } from '../../i18n';
import { ROLE, NOTIFICATION_TYPE } from '../../common/constants';

const TYPE_LABELS: Record<number, string> = {
  [NOTIFICATION_TYPE.BOOKING]: 'booking',
  [NOTIFICATION_TYPE.PAYMENT]: 'payment',
  [NOTIFICATION_TYPE.SYSTEM]: 'system',
};

/**
 * Optional FCM push metadata. Khi truyền pushType + deepLink, BE sẽ gửi push
 * với data shape khớp api-devices-spec.md Section 4.
 */
export interface PushMeta {
  pushType?: string;  // e.g. booking_created, payment_succeeded
  deepLink?: string;  // e.g. /bookings/abc-123
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private firebase: FirebaseService,
  ) {}

  // ─── User-facing endpoints ─────────────────────────────────────────────────

  async findAll(userId: string, msg: Messages, page?: number, limit?: number) {
    const take = Math.min(Math.max(1, Number(limit) || 50), 100);
    const currentPage = Math.max(1, Number(page) || 1);
    const skip = (currentPage - 1) * take;

    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    const data = notifications.map((n) => ({
      ...n,
      type: TYPE_LABELS[n.type] || 'system',
    }));

    return {
      message: msg.notifications.listSuccess,
      data,
      meta: { total, page: currentPage, limit: take },
    };
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

  /**
   * Tạo notification trong DB. Helper internal — không gửi push.
   */
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

  /**
   * Send FCM push tới tất cả device của user. Auto-cleanup invalid tokens.
   * Chỉ push khi push.pushType có giá trị (FE cần type + deepLink để navigate).
   * Không throw — push fail không phá business flow.
   */
  private async pushToUser(
    userId: string,
    title: string,
    body: string,
    push: PushMeta,
    targetId?: string,
  ): Promise<void> {
    if (!this.firebase.isEnabled()) return;
    if (!push.pushType) return;

    const devices = await this.prisma.userDevice.findMany({
      where: { userId },
      select: { fcmToken: true },
    });
    if (devices.length === 0) return;

    const tokens = devices.map((d) => d.fcmToken);
    const data: Record<string, string> = { type: push.pushType };
    if (push.deepLink) data.deepLink = push.deepLink;
    if (targetId) data.targetId = targetId;

    const result = await this.firebase.sendToTokens(tokens, { title, body, data });

    if (result.invalidTokens.length > 0) {
      await this.prisma.userDevice.deleteMany({
        where: { fcmToken: { in: result.invalidTokens } },
      }).catch((err) => {
        this.logger.error(`Failed to cleanup invalid tokens: ${err.message}`);
      });
    }
  }

  /** Notify owner of a property — tạo DB row + push FCM (nếu push.pushType có) */
  async notifyPropertyOwner(
    propertyId: string,
    title: string,
    subtitle: string,
    type: number,
    targetId?: string,
    targetType?: string,
    push: PushMeta = {},
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

    // Push FCM là side-effect ngoài (gọi Google, best-effort) — KHÔNG để response chờ nó.
    // DB row phía trên đã ghi đồng bộ; đó mới là dữ liệu tin cậy hiển thị ở chuông.
    void this.pushToUser(property.ownerId, title, subtitle, push, targetId).catch((err) =>
      this.logger.warn(`FCM push failed (owner ${property.ownerId}): ${err?.message}`),
    );
  }

  /**
   * Notify toàn bộ TEAM của property — owner + các SALE thuộc owner (scope owner),
   * TRỪ người vừa thao tác (actorUserId). Dùng cho sự kiện sửa phòng / khoá lịch:
   * cả team cần biết ai đổi gì, phòng nào. Tạo DB row đồng bộ + push FCM best-effort.
   */
  async notifyPropertyTeam(
    propertyId: string,
    actorUserId: string,
    title: string,
    subtitle: string,
    type: number,
    targetId?: string,
    targetType?: string,
    push: PushMeta = {},
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true },
    });
    if (!property) return;

    const sales = await this.prisma.user.findMany({
      where: { role: ROLE.SALE, ownerId: property.ownerId, isActive: true, deletedAt: null },
      select: { id: true },
    });

    // owner + sales, khử trùng, bỏ actor (không tự báo cho chính mình).
    const recipientIds = [...new Set([property.ownerId, ...sales.map((s) => s.id)])].filter(
      (id) => id !== actorUserId,
    );
    if (recipientIds.length === 0) return;

    await this.prisma.notification.createMany({
      data: recipientIds.map((userId) => ({ userId, title, subtitle, type, targetId, targetType })),
    });

    void Promise.all(
      recipientIds.map((id) => this.pushToUser(id, title, subtitle, push, targetId)),
    ).catch((err) => this.logger.warn(`FCM team push failed: ${err?.message}`));
  }

  /** Notify all admins — tạo DB row + push FCM (nếu push.pushType có) */
  async notifyAdmins(
    title: string,
    subtitle: string,
    type: number,
    targetId?: string,
    targetType?: string,
    push: PushMeta = {},
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: ROLE.ADMIN, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (admins.length === 0) return;

    // 1 INSERT batch thay vì N câu create() — tránh N+1 khi số admin tăng.
    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title,
        subtitle,
        type,
        targetId,
        targetType,
      })),
    });

    // Push FCM tách khỏi request (best-effort) — DB rows ở trên đã ghi đồng bộ.
    void Promise.all(
      admins.map((admin) => this.pushToUser(admin.id, title, subtitle, push, targetId)),
    ).catch((err) => this.logger.warn(`FCM push to admins failed: ${err?.message}`));
  }

  /** Notify a specific user — tạo DB row + push FCM (nếu push.pushType có) */
  async notifyUser(
    userId: string,
    title: string,
    subtitle: string,
    type: number,
    targetId?: string,
    targetType?: string,
    push: PushMeta = {},
  ) {
    await this.create({ userId, title, subtitle, type, targetId, targetType });
    // Push FCM tách khỏi request (best-effort) — DB row ở trên đã ghi đồng bộ.
    void this.pushToUser(userId, title, subtitle, push, targetId).catch((err) =>
      this.logger.warn(`FCM push failed (user ${userId}): ${err?.message}`),
    );
  }

  /**
   * Chỉ push FCM tới mọi device của user — KHÔNG tạo notification DB row.
   * Dùng cho chat message (volume lớn, đã có badge unread-count riêng).
   */
  async pushOnly(
    userId: string,
    title: string,
    body: string,
    push: PushMeta,
    targetId?: string,
  ): Promise<void> {
    await this.pushToUser(userId, title, body, push, targetId);
  }
}
