import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatGateway } from './gateway/chat.gateway';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ChatController {
  constructor(
    private chatService: ChatService,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List conversations của user hiện tại' })
  @ApiQuery({ name: 'role', required: false, description: 'owner | customer (filter theo role trong conversation)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @CurrentUser() user: { id: string; role: number },
    @Query('role') role: 'owner' | 'customer',
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.chatService.listConversations(
      user,
      {
        role,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      msg,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Tổng số tin chưa đọc của user (badge)' })
  getUnreadCount(@CurrentUser() user: { id: string }, @Lang() msg: Messages) {
    return this.chatService.getUnreadCount(user.id, msg);
  }

  @Get('yacht')
  @ApiOperation({
    summary: 'ADMIN/SALE hệ thống: danh sách hội thoại du thuyền (khách ↔ hệ thống)',
    description: 'Truyền ?customerId= để xem toàn bộ hội thoại của 1 khách với hệ thống.',
  })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listYacht(
    @CurrentUser() user: { id: string; role: number; scope?: string | null },
    @Query('customerId') customerId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.chatService.listYachtConversations(
      user,
      {
        customerId: customerId || undefined,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      msg,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Tạo (hoặc lấy) conversation', description: 'Idempotent với type=booking|yacht + bookingId' })
  create(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: { id: string; role: number; ownerId?: string | null; scope?: string | null },
    @Lang() msg: Messages,
  ) {
    return this.chatService.createOrGet(user, dto, msg);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết conversation kèm members' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: number; scope?: string | null },
    @Lang() msg: Messages,
  ) {
    return this.chatService.getConversation(id, user, msg);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'List messages (cursor-based pagination, oldest-first khi return)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Message id để paginate lùi' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Mặc định 50, max 100' })
  listMessages(
    @Param('id') conversationId: string,
    @Query('cursor') cursor: string,
    @Query('limit') limit: string,
    @CurrentUser() user: { id: string; role: number; scope?: string | null },
    @Lang() msg: Messages,
  ) {
    return this.chatService.listMessages(
      conversationId,
      user,
      cursor,
      limit ? parseInt(limit) : undefined,
      msg,
    );
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Gửi tin nhắn (REST fallback khi WS không khả dụng)',
    description: 'Khuyến nghị dùng WebSocket "message:send" event để có real-time. REST sẽ trigger broadcast tới các client đang kết nối WS.',
  })
  async sendMessage(
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: { id: string; role: number; scope?: string | null },
    @Lang() msg: Messages,
  ) {
    const result = await this.chatService.sendMessage(conversationId, user.id, dto, msg, {
      role: user.role,
      scope: user.scope,
    });
    // Broadcast qua WS + FCM fallback
    await this.chatGateway.broadcastMessage(conversationId, result.data.message, result.data.recipientIds);
    return result;
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu hội thoại đã đọc (clear unreadCount)' })
  async markRead(
    @Param('id') conversationId: string,
    @CurrentUser() user: { id: string },
    @Lang() msg: Messages,
  ) {
    const result = await this.chatService.markRead(conversationId, user.id, msg);
    await this.chatGateway.broadcastRead(conversationId, user.id, result.data.lastReadAt);
    return result;
  }

  @Patch('messages/:messageId')
  @ApiOperation({
    summary: 'Sửa tin nhắn (chỉ sender, trong 15 phút sau gửi)',
    description: 'Broadcast sự kiện `message:edit` tới các member khác qua WS.',
  })
  async editMessage(
    @Param('messageId') messageId: string,
    @Body() dto: EditMessageDto,
    @CurrentUser() user: { id: string },
    @Lang() msg: Messages,
  ) {
    const result = await this.chatService.editMessage(messageId, user.id, dto.content, msg);
    await this.chatGateway.broadcastMessageEdit(
      result.data.message.conversationId,
      result.data.message,
      result.data.recipientIds,
    );
    return result;
  }

  @Delete('messages/:messageId')
  @ApiOperation({
    summary: 'Xoá tin nhắn (sender hoặc admin)',
    description: 'Soft-delete. Broadcast `message:delete` tới các member khác.',
  })
  async deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser() user: { id: string; role: number },
    @Lang() msg: Messages,
  ) {
    const result = await this.chatService.deleteMessage(messageId, user, msg);
    await this.chatGateway.broadcastMessageDelete(
      result.data.conversationId,
      result.data.messageId,
      result.data.recipientIds,
    );
    return result;
  }
}
