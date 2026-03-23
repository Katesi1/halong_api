import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { CustomerHoldBookingDto } from './dto/customer-hold-booking.dto';
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

  // ─── Staff/Admin Endpoints ────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Danh sách booking (Staff/Admin)', description: 'Có thể lọc theo roomId' })
  findAll(@CurrentUser() user: any, @Query('roomId') roomId: string, @Lang() msg: Messages) {
    return this.bookingsService.findAll(user, msg, roomId);
  }

  @Get('calendar/:roomId')
  @Roles(Role.ADMIN, Role.STAFF)
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
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Chi tiết booking' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.findOne(id, user, msg);
  }

  @Post('hold')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Giữ phòng (Admin/Staff) — hold 30 phút' })
  holdRoom(@Body() dto: CreateBookingDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.holdRoom(dto, user, msg);
  }

  @Patch(':id/confirm')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Xác nhận booking (Admin/Staff)' })
  confirmBooking(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.confirmBooking(id, user, msg);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Hủy booking (Staff)' })
  cancelBooking(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.cancelBooking(id, user, msg);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Cập nhật booking' })
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.update(id, dto, user, msg);
  }

  // ─── Customer Endpoints ───────────────────────────────────────────────────

  @Post('customer-hold')
  @ApiOperation({ summary: 'Customer đặt phòng — hold 24 giờ' })
  customerHold(@Body() dto: CustomerHoldBookingDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.customerHold(dto, user, msg);
  }

  @Get('my')
  @ApiOperation({ summary: 'Booking của customer hiện tại' })
  @ApiQuery({ name: 'status', required: false, enum: ['HOLD', 'CONFIRMED', 'CANCELLED', 'COMPLETED'] })
  getMyBookings(@CurrentUser() user: any, @Query('status') status: string, @Lang() msg: Messages) {
    return this.bookingsService.getMyBookings(user, msg, status);
  }

  @Patch(':id/customer-cancel')
  @ApiOperation({ summary: 'Customer huỷ booking (chỉ HOLD)' })
  customerCancel(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.customerCancel(id, user, msg);
  }
}
