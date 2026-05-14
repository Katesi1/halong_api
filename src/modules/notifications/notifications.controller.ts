import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { Messages } from '../../i18n';
import { NotificationListResponse, UnreadCountResponse, MessageResponse } from '../../common/dto/api-response.dto';

@ApiTags('Notifications')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách thông báo',
    description: 'Trả về tất cả thông báo của user hiện tại, sắp xếp theo thời gian mới nhất.',
  })
  @ApiResponse({ status: 200, type: NotificationListResponse })
  findAll(@CurrentUser('id') userId: string, @Lang() msg: Messages) {
    return this.notificationsService.findAll(userId, msg);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Số thông báo chưa đọc' })
  @ApiResponse({ status: 200, type: UnreadCountResponse })
  getUnreadCount(@CurrentUser('id') userId: string, @Lang() msg: Messages) {
    return this.notificationsService.getUnreadCount(userId, msg);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo đã đọc' })
  @ApiResponse({ status: 200, type: MessageResponse })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markAsRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Lang() msg: Messages,
  ) {
    return this.notificationsService.markAsRead(id, userId, msg);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả đã đọc' })
  @ApiResponse({ status: 200, type: MessageResponse })
  markAllAsRead(@CurrentUser('id') userId: string, @Lang() msg: Messages) {
    return this.notificationsService.markAllAsRead(userId, msg);
  }
}
