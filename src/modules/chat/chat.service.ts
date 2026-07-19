import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  ROLE,
  CONVERSATION_TYPE,
  CONVERSATION_MEMBER_ROLE,
  CHAT_LIMITS,
  SYSTEM_SALE_CONVERSATION_TYPES,
  isSystemSale,
} from '../../common/constants';
import type { Messages } from '../../i18n';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private uploadsService: UploadsService,
  ) {}

  /**
   * Resolve role label trong conversation từ ROLE numeric của user.
   * Dùng khi auto-add member lúc create conversation.
   */
  private roleLabel(role: number): string {
    switch (role) {
      case ROLE.ADMIN:
        return CONVERSATION_MEMBER_ROLE.ADMIN;
      case ROLE.OWNER:
        return CONVERSATION_MEMBER_ROLE.OWNER;
      case ROLE.SALE:
        return CONVERSATION_MEMBER_ROLE.SALE;
      default:
        return CONVERSATION_MEMBER_ROLE.CUSTOMER;
    }
  }

  /**
   * Get-or-create conversation cho một booking (idempotent).
   * Members tự động: owner của property + customer của booking.
   */
  async createOrGet(
    caller: { id: string; role: number; ownerId?: string | null; scope?: string | null },
    dto: CreateConversationDto,
    msg: Messages,
  ) {
    if (dto.type === CONVERSATION_TYPE.BOOKING) {
      if (!dto.bookingId) {
        throw new BadRequestException(msg.chat.bookingRequired);
      }
      const booking = await this.prisma.booking.findUnique({
        where: { id: dto.bookingId },
        select: {
          id: true,
          customerId: true,
          propertyId: true,
          property: { select: { ownerId: true } },
        },
      });
      if (!booking) throw new NotFoundException(msg.bookings.notFound);

      // ACL: caller phải là owner/sale của property hoặc customer booking, hoặc admin
      const isOwner = booking.property.ownerId === caller.id;
      const isSale = caller.role === ROLE.SALE && caller.ownerId === booking.property.ownerId;
      const isCustomer = booking.customerId === caller.id;
      const isAdmin = caller.role === ROLE.ADMIN;
      if (!isOwner && !isSale && !isCustomer && !isAdmin) {
        throw new ForbiddenException(msg.chat.notMember);
      }

      // Idempotent: trả conversation đã có
      const existing = await this.prisma.conversation.findFirst({
        where: { type: CONVERSATION_TYPE.BOOKING, bookingId: dto.bookingId },
      });
      if (existing) {
        return { message: msg.chat.conversationGetSuccess, data: existing };
      }

      // Members: owner + customer (sale skipped trong booking conversation; sale gọi sẽ
      // được add nếu user là sale; admin không add làm member, chỉ moderate được)
      const memberData: Prisma.ConversationMemberCreateManyConversationInput[] = [];
      memberData.push({ userId: booking.property.ownerId, role: CONVERSATION_MEMBER_ROLE.OWNER });
      if (booking.customerId) {
        memberData.push({ userId: booking.customerId, role: CONVERSATION_MEMBER_ROLE.CUSTOMER });
      }
      // Nếu caller là sale → add làm sale member
      if (isSale && !memberData.find((m) => m.userId === caller.id)) {
        memberData.push({ userId: caller.id, role: CONVERSATION_MEMBER_ROLE.SALE });
      }

      // App-level race protection: nếu 2 caller tạo cùng lúc cho cùng booking, request
      // thua sẽ catch error và re-fetch conversation đã được tạo.
      try {
        const created = await this.prisma.conversation.create({
          data: {
            type: CONVERSATION_TYPE.BOOKING,
            bookingId: booking.id,
            propertyId: booking.propertyId,
            subject: dto.subject ?? null,
            members: { createMany: { data: memberData } },
          },
        });
        return { message: msg.chat.conversationCreateSuccess, data: created };
      } catch (err: any) {
        // Race: ai đó vừa create xong → trả conversation hiện có
        const recheck = await this.prisma.conversation.findFirst({
          where: { type: CONVERSATION_TYPE.BOOKING, bookingId: dto.bookingId },
        });
        if (recheck) {
          return { message: msg.chat.conversationGetSuccess, data: recheck };
        }
        throw err;
      }
    }

    // Hội thoại du thuyền (khách ↔ hệ thống về 1 đơn du thuyền).
    if (dto.type === CONVERSATION_TYPE.YACHT) {
      if (!dto.bookingId) throw new BadRequestException(msg.chat.bookingRequired);
      const booking = await this.prisma.yachtBooking.findUnique({
        where: { id: dto.bookingId },
        select: { id: true, customerId: true },
      });
      if (!booking) throw new NotFoundException(msg.yachtBookings.notFound);

      // ACL: khách chủ đơn, ADMIN, hoặc SALE hệ thống.
      const isCustomer = booking.customerId === caller.id;
      if (!isCustomer && caller.role !== ROLE.ADMIN && !isSystemSale(caller)) {
        throw new ForbiddenException(msg.chat.notMember);
      }
      if (!booking.customerId) throw new BadRequestException(msg.chat.notMember);

      const conv = await this.getOrCreateYachtConversation(booking.id, booking.customerId);
      return { message: msg.chat.conversationGetSuccess, data: conv };
    }

    // Other conversation types
    const created = await this.prisma.conversation.create({
      data: {
        type: dto.type,
        subject: dto.subject ?? null,
        members: {
          create: { userId: caller.id, role: this.roleLabel(caller.role) },
        },
      },
    });
    return { message: msg.chat.conversationCreateSuccess, data: created };
  }

  /**
   * Idempotent tạo hội thoại du thuyền cho 1 đơn (type='yacht', bookingId=yachtBookingId).
   * Member duy nhất là khách; ADMIN + SALE hệ thống truy cập qua bypass (không làm member).
   * Gọi từ YachtBookingsService khi tạo đơn.
   */
  async getOrCreateYachtConversation(
    yachtBookingId: string,
    customerId: string,
  ): Promise<{ id: string; type: string; bookingId: string | null }> {
    const existing = await this.prisma.conversation.findFirst({
      where: { type: CONVERSATION_TYPE.YACHT, bookingId: yachtBookingId },
      select: { id: true, type: true, bookingId: true },
    });
    if (existing) return existing;

    try {
      const created = await this.prisma.conversation.create({
        data: {
          type: CONVERSATION_TYPE.YACHT,
          bookingId: yachtBookingId,
          members: { create: { userId: customerId, role: CONVERSATION_MEMBER_ROLE.CUSTOMER } },
        },
        select: { id: true, type: true, bookingId: true },
      });
      return created;
    } catch {
      const recheck = await this.prisma.conversation.findFirst({
        where: { type: CONVERSATION_TYPE.YACHT, bookingId: yachtBookingId },
        select: { id: true, type: true, bookingId: true },
      });
      if (recheck) return recheck;
      throw new Error('Failed to create yacht conversation');
    }
  }

  /**
   * Chèn tin nhắn hệ thống (isSystem=true) + denormalize conversation.lastMessage*.
   * Dùng cho các mốc vòng đời đơn du thuyền (đặt / xác nhận / thanh toán / huỷ).
   */
  async postSystemMessage(conversationId: string, content: string): Promise<void> {
    const trimmed = content.trim().slice(0, CHAT_LIMITS.MESSAGE_MAX_LENGTH);
    if (!trimmed) return;
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    if (!conv) return;

    const now = new Date();
    const recipientIds = conv.members.filter((m) => !m.leftAt).map((m) => m.userId);
    await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, senderId: 'system', content: trimmed, isSystem: true },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now, lastMessagePreview: trimmed.slice(0, 120), lastSenderId: null },
      }),
      this.prisma.conversationMember.updateMany({
        where: { conversationId, userId: { in: recipientIds.length ? recipientIds : ['__none__'] } },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);
  }

  /** List conversations user tham gia, sort by lastMessageAt desc */
  async listConversations(
    caller: { id: string; role: number },
    filters: { role?: 'owner' | 'customer'; page?: number; limit?: number },
    msg: Messages,
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ConversationWhereInput = {
      members: {
        some: {
          userId: caller.id,
          leftAt: null,
          ...(filters.role ? { role: filters.role } : {}),
        },
      },
      archivedAt: null,
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: {
          members: {
            select: {
              userId: true,
              role: true,
              lastReadAt: true,
              unreadCount: true,
            },
          },
        },
      }),
    ]);

    // Hydrate user info cho members
    const userIds = Array.from(new Set(items.flatMap((c) => c.members.map((m) => m.userId))));
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const hydrated = items.map((c) => ({
      ...c,
      members: c.members.map((m) => ({ ...m, user: userMap.get(m.userId) ?? null })),
      myUnread: c.members.find((m) => m.userId === caller.id)?.unreadCount ?? 0,
    }));

    return {
      message: msg.chat.conversationListSuccess,
      data: { items: hydrated, total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * ADMIN + SALE hệ thống xem hội thoại du thuyền — toàn bộ, hoặc lọc theo 1 khách
   * (customerId) để xem "toàn bộ tin nhắn của user đó với hệ thống".
   */
  async listYachtConversations(
    caller: { id: string; role: number; scope?: string | null },
    filters: { customerId?: string; page?: number; limit?: number },
    msg: Messages,
  ) {
    if (caller.role !== ROLE.ADMIN && !isSystemSale(caller)) {
      throw new ForbiddenException(msg.chat.notMember);
    }
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20));

    const where: Prisma.ConversationWhereInput = {
      type: CONVERSATION_TYPE.YACHT,
      ...(filters.customerId
        ? { members: { some: { userId: filters.customerId, role: CONVERSATION_MEMBER_ROLE.CUSTOMER } } }
        : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: { members: { select: { userId: true, role: true, unreadCount: true } } },
      }),
    ]);

    const userIds = Array.from(new Set(items.flatMap((c) => c.members.map((m) => m.userId))));
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const hydrated = items.map((c) => ({
      ...c,
      members: c.members.map((m) => ({ ...m, user: userMap.get(m.userId) ?? null })),
    }));

    return {
      message: msg.chat.conversationListSuccess,
      data: { items: hydrated, total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Detail 1 conversation kèm members */
  async getConversation(
    id: string,
    caller: { id: string; role: number; scope?: string | null },
    msg: Messages,
  ) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!conv) throw new NotFoundException(msg.chat.conversationNotFound);
    this.assertMember(conv.members, caller, conv.type, msg);

    const userIds = conv.members.map((m) => m.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return {
      message: msg.chat.conversationGetSuccess,
      data: {
        ...conv,
        members: conv.members.map((m) => ({ ...m, user: userMap.get(m.userId) ?? null })),
      },
    };
  }

  /** Cursor-based pagination: lấy `limit` tin trước `cursor` (id của tin cũ hơn) */
  async listMessages(
    conversationId: string,
    caller: { id: string; role: number; scope?: string | null },
    cursor: string | undefined,
    limit: number | undefined,
    msg: Messages,
  ) {
    await this.assertCallerIsMember(conversationId, caller, msg);

    const take = Math.min(
      CHAT_LIMITS.PAGE_MAX,
      Math.max(1, limit ?? CHAT_LIMITS.PAGE_DEFAULT),
    );

    // Nếu cursor được truyền: verify message tồn tại trước (tránh Prisma P2025 → 500).
    // Cursor không hợp lệ → coi như đọc từ đầu (graceful degrade).
    let effectiveCursor: string | undefined = cursor;
    if (cursor) {
      const exists = await this.prisma.message.findUnique({
        where: { id: cursor },
        select: { id: true },
      });
      if (!exists) effectiveCursor = undefined;
    }

    const items = await this.prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take,
      ...(effectiveCursor ? { cursor: { id: effectiveCursor }, skip: 1 } : {}),
    });

    const nextCursor = items.length === take ? items[items.length - 1].id : null;

    return {
      message: msg.chat.messageListSuccess,
      data: {
        items: items.reverse(), // oldest first cho UI
        nextCursor,
      },
    };
  }

  /**
   * Gửi message — gọi từ cả REST controller và WS gateway.
   * Cập nhật conversation.lastMessage* và tăng unreadCount cho member khác.
   * Trả về message + recipientIds (gateway sẽ broadcast + FCM fallback).
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto,
    msg: Messages,
    senderCtx?: { role: number; scope?: string | null },
  ): Promise<{
    message: string;
    data: {
      message: {
        id: string;
        conversationId: string;
        senderId: string;
        content: string;
        attachments: any;
        isSystem: boolean;
        createdAt: Date;
      };
      recipientIds: string[];
    };
  }> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    if (!conv) throw new NotFoundException(msg.chat.conversationNotFound);

    const senderMember = conv.members.find((m) => m.userId === senderId && !m.leftAt);
    if (!senderMember) {
      // ADMIN + SALE hệ thống được trả lời hội thoại du thuyền/support dù không là member.
      const canModerate =
        !!senderCtx &&
        (senderCtx.role === ROLE.ADMIN ||
          (isSystemSale(senderCtx) && SYSTEM_SALE_CONVERSATION_TYPES.includes(conv.type)));
      if (!canModerate) throw new ForbiddenException(msg.chat.notMember);
    }

    const content = dto.content.trim();
    if (!content) throw new BadRequestException(msg.chat.messageEmpty);
    if (content.length > CHAT_LIMITS.MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(msg.chat.messageTooLong(CHAT_LIMITS.MESSAGE_MAX_LENGTH));
    }

    const preview = content.slice(0, 120);
    const now = new Date();

    const recipientIds = conv.members
      .filter((m) => m.userId !== senderId && !m.leftAt)
      .map((m) => m.userId);

    // Transaction: tạo message + denorm conversation + bump unread cho recipients
    const [created] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId,
          content,
          attachments: (dto.attachments as unknown as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: now,
          lastMessagePreview: preview,
          lastSenderId: senderId,
        },
      }),
      this.prisma.conversationMember.updateMany({
        where: {
          conversationId,
          userId: { in: recipientIds.length ? recipientIds : ['__none__'] },
        },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);

    // Đánh dấu các upload đã được attach (chỉ áp dụng nếu sender thực sự sở
    // hữu upload — service tự filter theo userId). Fire-and-forget, không
    // block message send.
    if (dto.attachments && dto.attachments.length > 0) {
      const urls = dto.attachments
        .map((a) => a?.url)
        .filter((u): u is string => typeof u === 'string');
      if (urls.length > 0) {
        void this.uploadsService
          .markAttached(senderId, urls, created.id)
          .catch((err) => {
            // Log nhưng không throw — message đã lưu, attachment tracking là phụ
            // eslint-disable-next-line no-console
            console.warn(
              `markAttached failed for message=${created.id}: ${err.message}`,
            );
          });
      }
    }

    return {
      message: msg.chat.messageSendSuccess,
      data: {
        message: {
          id: created.id,
          conversationId: created.conversationId,
          senderId: created.senderId,
          content: created.content,
          attachments: created.attachments,
          isSystem: created.isSystem,
          createdAt: created.createdAt,
        },
        recipientIds,
      },
    };
  }

  /** Đánh dấu đã đọc — set lastReadAt + clear unreadCount */
  async markRead(conversationId: string, userId: string, msg: Messages) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member || member.leftAt) throw new ForbiddenException(msg.chat.notMember);

    const now = new Date();
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now, unreadCount: 0 },
    });

    return { message: msg.chat.readSuccess, data: { conversationId, lastReadAt: now } };
  }

  /** Tổng unread của user (tất cả conversation) */
  async getUnreadCount(userId: string, msg: Messages) {
    const agg = await this.prisma.conversationMember.aggregate({
      where: { userId, leftAt: null },
      _sum: { unreadCount: true },
    });
    return {
      message: msg.chat.unreadCountSuccess,
      data: { count: agg._sum.unreadCount ?? 0 },
    };
  }

  /**
   * Edit message — chỉ sender mới sửa được, trong 15 phút sau khi gửi.
   * System messages (isSystem=true) không sửa được.
   * Trả về message đã cập nhật + danh sách recipient để gateway broadcast.
   */
  async editMessage(
    messageId: string,
    userId: string,
    newContent: string,
    msg: Messages,
  ): Promise<{
    message: string;
    data: {
      message: { id: string; conversationId: string; content: string; editedAt: Date };
      recipientIds: string[];
    };
  }> {
    const trimmed = newContent.trim();
    if (!trimmed) throw new BadRequestException(msg.chat.messageEmpty);
    if (trimmed.length > CHAT_LIMITS.MESSAGE_MAX_LENGTH) {
      throw new BadRequestException(msg.chat.messageTooLong(CHAT_LIMITS.MESSAGE_MAX_LENGTH));
    }

    const existing = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { members: true } } },
    });
    if (!existing || existing.deletedAt) throw new NotFoundException(msg.chat.messageNotFound);
    if (existing.isSystem) throw new ForbiddenException(msg.chat.cannotEditSystem);
    if (existing.senderId !== userId) throw new ForbiddenException(msg.chat.onlySenderCanEdit);

    const EDIT_WINDOW_MS = 15 * 60 * 1000;
    if (Date.now() - existing.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new BadRequestException(msg.chat.editWindowExpired);
    }

    const now = new Date();
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { content: trimmed, editedAt: now },
    });

    const recipientIds = existing.conversation.members
      .filter((m) => m.userId !== userId && !m.leftAt)
      .map((m) => m.userId);

    return {
      message: msg.chat.editSuccess,
      data: {
        message: {
          id: updated.id,
          conversationId: updated.conversationId,
          content: updated.content,
          editedAt: updated.editedAt!,
        },
        recipientIds,
      },
    };
  }

  /**
   * Soft-delete message — sender hoặc admin có thể xoá. ADMIN xoá bất cứ tin nào
   * (moderation). Sender chỉ xoá tin mình gửi.
   */
  async deleteMessage(
    messageId: string,
    caller: { id: string; role: number },
    msg: Messages,
  ): Promise<{
    message: string;
    data: { messageId: string; conversationId: string; recipientIds: string[] };
  }> {
    const existing = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { members: true } } },
    });
    if (!existing || existing.deletedAt) throw new NotFoundException(msg.chat.messageNotFound);
    if (existing.isSystem) throw new ForbiddenException(msg.chat.cannotEditSystem);

    const isAdmin = caller.role === ROLE.ADMIN;
    if (!isAdmin && existing.senderId !== caller.id) {
      throw new ForbiddenException(msg.chat.onlySenderCanDelete);
    }

    await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    const recipientIds = existing.conversation.members
      .filter((m) => m.userId !== caller.id && !m.leftAt)
      .map((m) => m.userId);

    return {
      message: msg.chat.deleteSuccess,
      data: { messageId, conversationId: existing.conversationId, recipientIds },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Public — gateway gọi để verify caller có quyền join vào room conversation.
   * ADMIN luôn được phép moderate.
   */
  async assertCallerIsMember(
    conversationId: string,
    caller: { id: string; role: number; scope?: string | null },
    msg: Messages,
  ) {
    if (caller.role === ROLE.ADMIN) return;
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: caller.id } },
    });
    if (member && !member.leftAt) return;
    // SALE hệ thống được đọc hội thoại du thuyền/support dù không là member.
    if (isSystemSale(caller)) {
      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true },
      });
      if (conv && SYSTEM_SALE_CONVERSATION_TYPES.includes(conv.type)) return;
    }
    throw new ForbiddenException(msg.chat.notMember);
  }

  private assertMember(
    members: Array<{ userId: string; leftAt: Date | null }>,
    caller: { id: string; role: number; scope?: string | null },
    convType: string,
    msg: Messages,
  ) {
    if (caller.role === ROLE.ADMIN) return;
    const m = members.find((mm) => mm.userId === caller.id && !mm.leftAt);
    if (m) return;
    if (isSystemSale(caller) && SYSTEM_SALE_CONVERSATION_TYPES.includes(convType)) return;
    throw new ForbiddenException(msg.chat.notMember);
  }
}
