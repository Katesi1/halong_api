import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { Role } from '@prisma/client';
import type { Messages } from '../../i18n';

@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách booking', description: 'Có thể lọc theo roomId' })
  findAll(@CurrentUser() user: any, @Query('roomId') roomId: string, @Lang() msg: Messages) {
    return this.bookingsService.findAll(user, msg, roomId);
  }

  @Get('calendar/:roomId')
  @ApiOperation({ summary: 'Lịch đặt phòng theo tháng (year, month query)' })
  getCalendar(
    @Param('roomId') roomId: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Lang() msg: Messages,
  ) {
    const now = new Date();
    return this.bookingsService.getRoomCalendar(
      roomId,
      parseInt(year) || now.getFullYear(),
      parseInt(month) || now.getMonth() + 1,
      msg,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết booking' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.findOne(id, user, msg);
  }

  @Post('hold')
  @Roles(Role.ADMIN, Role.SALE)
  @ApiOperation({ summary: 'Giữ phòng (Admin/Sale)' })
  holdRoom(@Body() dto: CreateBookingDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.holdRoom(dto, user, msg);
  }

  @Patch(':id/confirm')
  @Roles(Role.ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Xác nhận booking (Admin/Owner)' })
  confirmBooking(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.confirmBooking(id, user, msg);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Hủy booking' })
  cancelBooking(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.cancelBooking(id, user, msg);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật booking' })
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.update(id, dto, user, msg);
  }
}
