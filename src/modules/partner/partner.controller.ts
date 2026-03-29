import {
  Controller, Get, Post, Param, Query, Body, UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PartnerService } from './partner.service';
import { CreatePartnerBookingDto } from './dto/create-partner-booking.dto';
import { PartnerApiKeyGuard } from '../../common/guards/partner-api-key.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Partner')
@ApiSecurity('partner-key')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('partner')
@Public()
@UseGuards(PartnerApiKeyGuard)
export class PartnerController {
  constructor(private partnerService: PartnerService) {}

  @Get('rooms')
  @ApiOperation({ summary: 'Danh sách phòng (header: X-Partner-Key)' })
  getRooms(
    @Query('propertyId') propertyId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.partnerService.getRooms({
      propertyId,
      page: parseInt(page ?? '1'),
      limit: parseInt(limit ?? '20'),
    }, msg);
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: 'Chi tiết phòng' })
  getRoomDetail(@Param('id') id: string, @Lang() msg: Messages) {
    return this.partnerService.getRoomDetail(id, msg);
  }

  @Get('rooms/:id/availability')
  @ApiOperation({ summary: 'Tình trạng phòng theo tháng (year, month)' })
  getAvailability(
    @Param('id') id: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Lang() msg: Messages,
  ) {
    const now = new Date();
    return this.partnerService.getRoomAvailability(
      id,
      parseInt(year ?? String(now.getFullYear())),
      parseInt(month ?? String(now.getMonth() + 1)),
      msg,
    );
  }

  @Post('bookings')
  @ApiOperation({ summary: 'Tạo booking qua partner' })
  createBooking(@Body() dto: CreatePartnerBookingDto, @Lang() msg: Messages) {
    return this.partnerService.createBooking(dto, msg);
  }

  @Post('bookings/:id/cancel')
  @ApiOperation({ summary: 'Hủy booking' })
  cancelBooking(@Param('id') id: string, @Lang() msg: Messages) {
    return this.partnerService.cancelBooking(id, msg);
  }
}
