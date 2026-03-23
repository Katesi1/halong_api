import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PricesService } from './prices.service';
import { UpsertPriceDto } from './dto/upsert-price.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { Role } from '@prisma/client';
import type { Messages } from '../../i18n';

@ApiTags('Prices')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('rooms/:roomId/prices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PricesController {
  constructor(private pricesService: PricesService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy giá phòng (weekday, friday, saturday, holiday)' })
  getPrice(@Param('roomId') roomId: string, @Lang() msg: Messages) {
    return this.pricesService.getPrice(roomId, msg);
  }

  @Put()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Cập nhật/ tạo giá phòng (Admin/Owner)' })
  upsertPrice(
    @Param('roomId') roomId: string,
    @Body() dto: UpsertPriceDto,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.pricesService.upsertPrice(roomId, dto, user, msg);
  }
}
