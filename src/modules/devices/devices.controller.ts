import {
  Controller, Get, Post, Delete,
  Body, Param, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';
import { MessageResponse } from '../../common/dto/api-response.dto';

@ApiTags('Devices')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Register FCM device token sau login', description: 'Idempotent — gọi nhiều lần với cùng token cũng OK. Token đã tồn tại sẽ chuyển ownership.' })
  @ApiResponse({ status: 200, description: 'Device registered' })
  @ApiResponse({ status: 400, description: 'Thiếu fcmToken hoặc platform invalid' })
  register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceDto,
    @Lang() msg: Messages,
  ) {
    return this.devicesService.register(userId, dto, msg);
  }

  @Delete(':token')
  @ApiOperation({ summary: 'Unregister FCM token (gọi khi logout)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  unregister(
    @CurrentUser('id') userId: string,
    @Param('token') token: string,
    @Lang() msg: Messages,
  ) {
    return this.devicesService.unregister(userId, token, msg);
  }

  @Get()
  @ApiOperation({ summary: 'List devices của user (cho UX "Quản lý thiết bị đăng nhập")' })
  list(@CurrentUser('id') userId: string, @Lang() msg: Messages) {
    return this.devicesService.list(userId, msg);
  }
}
