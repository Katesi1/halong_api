import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Notification Preferences')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/me/notification-preferences')
export class NotificationPreferencesController {
  constructor(private service: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy notification preferences' })
  get(@CurrentUser() user: { id: string }, @Lang() msg: Messages) {
    return this.service.get(user.id, msg);
  }

  @Put()
  @ApiOperation({ summary: 'Cập nhật notification preferences' })
  update(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateNotificationPreferencesDto,
    @Lang() msg: Messages,
  ) {
    return this.service.update(user.id, dto, msg);
  }
}
