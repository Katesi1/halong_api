import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BookingListResponse, BookingResponse, MessageResponse } from '../../common/dto/api-response.dto';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { CustomerHoldBookingDto } from './dto/customer-hold-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
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
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Danh sách booking (Staff/Admin)' })
  @ApiQuery({ name: 'propertyId', required: false })
  @ApiQuery({ name: 'status', required: false, description: '0=HOLD, 1=CONFIRMED, 2=CANCELLED, 3=COMPLETED' })
  @ApiResponse({ status: 200, type: BookingListResponse })
  findAll(
    @CurrentUser() user: any,
    @Query('propertyId') propertyId: string,
    @Query('status') status: string,
    @Lang() msg: Messages,
  ) {
    return this.bookingsService.findAll(
      user, msg, propertyId,
      status !== undefined ? parseInt(status) : undefined,
    );
  }

  @Get('my-bookings')
  @ApiOperation({ summary: 'Booking của customer hiện tại' })
  @ApiQuery({ name: 'status', required: false, description: '0=HOLD, 1=CONFIRMED, 2=CANCELLED, 3=COMPLETED' })
  @ApiResponse({ status: 200, type: BookingListResponse })
  getMyBookings(@CurrentUser() user: any, @Query('status') status: string, @Lang() msg: Messages) {
    return this.bookingsService.getMyBookings(
      user, msg,
      status !== undefined ? parseInt(status) : undefined,
    );
  }

  @Get(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Chi tiết booking' })
  @ApiResponse({ status: 200, type: BookingResponse })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.findOne(id, user, msg);
  }

  @Post('hold')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Giữ chỗ (Admin/Staff) — hold 30 phút' })
  @ApiResponse({ status: 201, type: BookingResponse })
  holdProperty(@Body() dto: CreateBookingDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.holdProperty(dto, user, msg);
  }

  @Patch(':id/confirm')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Xác nhận booking (Admin/Staff)' })
  @ApiResponse({ status: 200, type: BookingResponse })
  confirmBooking(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.confirmBooking(id, user, msg);
  }

  @Patch(':id/cancel')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Hủy booking (Staff)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  cancelBooking(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.cancelBooking(id, user, msg);
  }

  @Put(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Cập nhật booking' })
  @ApiResponse({ status: 200, type: BookingResponse })
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.update(id, dto, user, msg);
  }

  // ─── Customer Endpoints ───────────────────────────────────────────────────

  @Post('customer-hold')
  @ApiOperation({ summary: 'Customer đặt chỗ — hold 24 giờ' })
  @ApiResponse({ status: 201, type: BookingResponse })
  customerHold(@Body() dto: CustomerHoldBookingDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.customerHold(dto, user, msg);
  }

  @Patch(':id/customer-cancel')
  @ApiOperation({ summary: 'Customer huỷ booking (chỉ HOLD)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  customerCancel(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.bookingsService.customerCancel(id, user, msg);
  }
}
