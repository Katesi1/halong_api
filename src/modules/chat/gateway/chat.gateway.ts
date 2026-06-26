import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { isUUID } from 'class-validator';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ChatService } from '../chat.service';
import { getMessages, type Messages } from '../../../i18n';
import { NOTIFICATION_TYPE } from '../../../common/constants';

interface AuthedSocket extends Socket {
  data: {
    userId: string;
    role: number;
    ownerId?: string | null;
    locale: 'vi' | 'en';
    msg: Messages;
    tokenExpiryTimer?: NodeJS.Timeout;
  };
}

/**
 * Namespace `/chat`. Client kết nối:
 *   const socket = io('https://api.halong24h.com/chat', {
 *     auth: { token: '<accessToken>' }
 *   });
 *
 * Events client → server:
 *   - 'message:send'  { conversationId, content, attachments? }
 *   - 'read'          { conversationId }
 *   - 'typing:start'  { conversationId }
 *   - 'typing:stop'   { conversationId }
 *
 * Events server → client:
 *   - 'message:new'   { conversationId, message }
 *   - 'read:update'   { conversationId, userId, lastReadAt }
 *   - 'typing'        { conversationId, userId, typing: boolean }
 *   - 'presence'      { userId, online: boolean }
 *   - 'error'         { message }
 */
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    // Prod: phải set ALLOWED_ORIGINS; dev: cho phép mọi origin
    origin:
      process.env.NODE_ENV === 'production'
        ? allowedOrigins.length > 0
          ? allowedOrigins
          : false
        : true,
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  /** Map userId → Set<socketId>. Dùng để check online + targeted emit. */
  private onlineUsers = new Map<string, Set<string>>();

  constructor(
    private configService: ConfigService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private notifications: NotificationsService,
    @Inject(forwardRef(() => ChatService))
    private chatService: ChatService,
  ) {}

  // ─── Connection lifecycle ─────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.emit('error', { message: 'Missing token' });
        client.disconnect(true);
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify<{ sub: string; exp?: number }>(token, { secret });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, ownerId: true, isActive: true, deletedAt: true },
      });
      if (!user || !user.isActive || user.deletedAt) {
        client.emit('error', { message: 'Account disabled' });
        client.disconnect(true);
        return;
      }

      // Resolve locale từ Accept-Language header hoặc query ?lang=
      const langHeader = (client.handshake.headers['accept-language'] as string) || undefined;
      const langQuery = (client.handshake.query?.lang as string) || undefined;
      const msg = getMessages(langQuery ?? langHeader);
      const locale: 'vi' | 'en' = (langQuery ?? langHeader ?? 'vi')
        .toLowerCase()
        .startsWith('en')
        ? 'en'
        : 'vi';

      (client as AuthedSocket).data = {
        userId: user.id,
        role: user.role,
        ownerId: user.ownerId,
        locale,
        msg,
      };

      // Join personal room — dùng để emit có chủ đích cho user này
      client.join(this.userRoom(user.id));

      // Track presence
      const wasOffline = !this.isOnline(user.id);
      this.markOnline(user.id, client.id);
      if (wasOffline) {
        await this.broadcastPresence(user.id, true);
      }

      // Auto-disconnect khi access token expire — buộc FE refresh + reconnect.
      // Nếu payload không có exp (defensive), bỏ qua timer.
      if (typeof payload.exp === 'number') {
        const msUntilExpiry = payload.exp * 1000 - Date.now();
        if (msUntilExpiry <= 0) {
          client.emit('error', { code: 'tokenExpired', message: 'Token expired' });
          client.disconnect(true);
          return;
        }
        (client as AuthedSocket).data.tokenExpiryTimer = setTimeout(() => {
          client.emit('error', { code: 'tokenExpired', message: 'Token expired' });
          client.disconnect(true);
        }, msUntilExpiry);
      }

      this.logger.log(`socket connected: user=${user.id} sid=${client.id}`);
    } catch (err) {
      this.logger.warn(`socket auth failed: ${(err as Error).message}`);
      client.emit('error', { message: 'Auth failed' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const data = (client as AuthedSocket).data;
    if (!data?.userId) return;
    if (data.tokenExpiryTimer) {
      clearTimeout(data.tokenExpiryTimer);
      data.tokenExpiryTimer = undefined;
    }
    const stillOnline = this.markOffline(data.userId, client.id);
    if (!stillOnline) {
      await this.broadcastPresence(data.userId, false);
    }
    this.logger.log(`socket disconnected: user=${data.userId} sid=${client.id}`);
  }

  /** Chỉ broadcast presence tới member của các conversation chung — không leak tới user lạ. */
  private async broadcastPresence(userId: string, online: boolean) {
    const peers = await this.prisma.conversationMember.findMany({
      where: {
        userId: { not: userId },
        leftAt: null,
        conversation: { members: { some: { userId, leftAt: null } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const payload = { userId, online };
    for (const p of peers) {
      this.server.to(this.userRoom(p.userId)).emit('presence', payload);
    }
  }

  // ─── Client events ────────────────────────────────────────────────────────

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string; content: string; attachments?: any[] },
  ) {
    const { userId, msg } = client.data;
    if (!body?.conversationId || !body?.content) {
      throw new WsException(msg.chat.bookingRequired); // generic missing-field
    }
    if (!isUUID(body.conversationId)) {
      throw new WsException(msg.chat.invalidConversationId);
    }
    // Strip attachments items không có URL hợp lệ (cheap WS-side guard; REST đi qua DTO)
    let safeAttachments: Array<{ url: string; type?: string; name?: string; size?: number }> | undefined;
    if (Array.isArray(body.attachments)) {
      safeAttachments = body.attachments
        .filter((a: any) =>
          a &&
          typeof a.url === 'string' &&
          a.url.startsWith('https://') &&
          a.url.length <= 2048,
        )
        .slice(0, 5)
        .map((a: any) => ({
          url: a.url,
          type: typeof a.type === 'string' ? a.type.slice(0, 100) : undefined,
          name: typeof a.name === 'string' ? a.name.slice(0, 255) : undefined,
          size: typeof a.size === 'number' && a.size >= 0 ? a.size : undefined,
        }));
    }
    try {
      const result = await this.chatService.sendMessage(
        body.conversationId,
        userId,
        { content: body.content, attachments: safeAttachments },
        msg,
      );
      await this.broadcastMessage(
        body.conversationId,
        result.data.message,
        result.data.recipientIds,
      );
      // Ack về client gửi (xác nhận message id)
      client.emit('message:ack', { localContent: body.content, message: result.data.message });
    } catch (err: any) {
      client.emit('error', { message: err?.message ?? 'send failed' });
    }
  }

  @SubscribeMessage('read')
  async onRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    if (!body?.conversationId) return;
    try {
      const result = await this.chatService.markRead(body.conversationId, client.data.userId, client.data.msg);
      await this.broadcastRead(body.conversationId, client.data.userId, result.data.lastReadAt);
    } catch (err: any) {
      client.emit('error', { message: err?.message ?? 'read failed' });
    }
  }

  @SubscribeMessage('typing:start')
  async onTypingStart(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    await this.broadcastTyping(body?.conversationId, client.data.userId, true);
  }

  @SubscribeMessage('typing:stop')
  async onTypingStop(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    await this.broadcastTyping(body?.conversationId, client.data.userId, false);
  }

  // ─── Broadcasters (gọi từ controller hoặc internal) ──────────────────────

  /**
   * Phát message tới tất cả recipient online + FCM fallback cho ai offline.
   */
  async broadcastMessage(
    conversationId: string,
    message: {
      id: string;
      conversationId: string;
      senderId: string;
      content: string;
      attachments: any;
      isSystem: boolean;
      createdAt: Date;
    },
    recipientIds: string[],
  ) {
    const payload = { conversationId, message };

    // Lookup senderName 1 lần — dùng chung cho tất cả FCM fallback
    let senderName: string | null = null;

    for (const recipientId of recipientIds) {
      // Emit qua personal room. Nếu user có >=1 socket, message tới ngay.
      this.server.to(this.userRoom(recipientId)).emit('message:new', payload);

      // FCM fallback nếu user không có socket nào
      if (!this.isOnline(recipientId)) {
        if (senderName === null) {
          senderName = await this.getSenderName(message.senderId);
        }
        // Fire-and-forget — không block luồng chat
        void this.notifications
          .notifyUser(
            recipientId,
            senderName,
            message.content.slice(0, 120),
            NOTIFICATION_TYPE.SYSTEM,
            conversationId,
            'conversation',
            {
              pushType: 'chat_message',
              deepLink: `/conversations/${conversationId}`,
            },
          )
          .catch((err) => {
            this.logger.warn(`FCM fallback failed for user=${recipientId}: ${err.message}`);
          });
      }
    }

    // Sender cũng được emit để các tab/device khác của họ đồng bộ
    this.server.to(this.userRoom(message.senderId)).emit('message:new', payload);
  }

  async broadcastMessageEdit(
    conversationId: string,
    message: { id: string; conversationId: string; content: string; editedAt: Date },
    recipientIds: string[],
  ) {
    // `recipientIds` đã exclude sender. Sender nhận response REST đồng bộ rồi.
    // Sync multi-tab sender → có thể thêm sau bằng cách emit cả user room sender.
    const payload = { conversationId, message };
    for (const rid of recipientIds) {
      this.server.to(this.userRoom(rid)).emit('message:edit', payload);
    }
  }

  async broadcastMessageDelete(
    conversationId: string,
    messageId: string,
    recipientIds: string[],
  ) {
    const payload = { conversationId, messageId };
    for (const rid of recipientIds) {
      this.server.to(this.userRoom(rid)).emit('message:delete', payload);
    }
  }

  async broadcastRead(conversationId: string, userId: string, lastReadAt: Date) {
    // Chỉ broadcast tới member ACTIVE (leftAt = null)
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });
    const payload = { conversationId, userId, lastReadAt };
    for (const m of members) {
      this.server.to(this.userRoom(m.userId)).emit('read:update', payload);
    }
  }

  async broadcastTyping(conversationId: string | undefined, userId: string, typing: boolean) {
    if (!conversationId) return;
    // Verify user IS a real member (không bypass ADMIN ở đây vì admin không nên typing)
    const senderMember = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { leftAt: true },
    });
    if (!senderMember || senderMember.leftAt) return;

    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: userId }, leftAt: null },
      select: { userId: true },
    });
    const payload = { conversationId, userId, typing };
    for (const m of members) {
      this.server.to(this.userRoom(m.userId)).emit('typing', payload);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private extractToken(client: Socket): string | null {
    // 1. socket.io auth (recommended)
    const authToken = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (authToken) return authToken;
    // 2. Authorization header fallback
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return null;
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private markOnline(userId: string, socketId: string) {
    let set = this.onlineUsers.get(userId);
    if (!set) {
      set = new Set();
      this.onlineUsers.set(userId, set);
    }
    set.add(socketId);
  }

  /** @returns true nếu user vẫn còn socket khác online, false nếu đã offline hẳn */
  private markOffline(userId: string, socketId: string): boolean {
    const set = this.onlineUsers.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.onlineUsers.delete(userId);
      return false;
    }
    return true;
  }

  isOnline(userId: string): boolean {
    return (this.onlineUsers.get(userId)?.size ?? 0) > 0;
  }

  private async getSenderName(senderId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });
    // Push notification title — không biết locale của recipient từ chỗ này,
    // dùng tiếng Việt làm mặc định (đa số user). FCM message body sẽ là content gốc.
    return u?.name ? `Tin nhắn từ ${u.name}` : 'Bạn có tin nhắn mới';
  }
}
