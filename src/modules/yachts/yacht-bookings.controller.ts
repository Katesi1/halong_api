import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { YachtBookingsService } from './yacht-bookings.service';
import { CreateYachtBookingDto } from './dto/create-yacht-booking.dto';
import { MarkYachtPaidDto } from './dto/mark-yacht-paid.dto';
import { CancelYachtBookingDto } from './dto/cancel-yacht-booking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

type CallerUser = { id: string; role: number; scope?: string | null };

@ApiTags('Yacht Bookings')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('yacht-bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class YachtBookingsController {
  constructor(private service: YachtBookingsService) {}

  @Post('customer')
  @ApiOperation({ summary: 'Khách đặt du thuyền (tạo đơn PENDING + mở kênh nhắn tin)' })
  createCustomer(
    @Body() dto: CreateYachtBookingDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.service.createBooking(dto, user, msg, { asStaff: false });
  }

  @Get('my')
  @ApiOperation({ summary: 'Danh sách đơn du thuyền của khách hiện tại' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listMy(
    @CurrentUser() user: CallerUser,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.service.listMy(
      user,
      msg,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Post()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Staff (ADMIN/SALE hệ thống) tạo đơn hộ khách' })
  createStaff(
    @Body() dto: CreateYachtBookingDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.service.createBooking(dto, user, msg, { asStaff: true });
  }

  @Get()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Danh sách toàn bộ đơn du thuyền (ADMIN + SALE hệ thống)' })
  @ApiQuery({ name: 'status', required: false, type: Number, description: '0=PENDING,1=CONFIRMED,2=PAID,3=COMPLETED,4=CANCELLED' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listAll(
    @CurrentUser() user: CallerUser,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.service.listAll(user, msg, {
      status: status !== undefined && status !== '' ? parseInt(status, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết đơn (khách chủ đơn hoặc ADMIN/SALE hệ thống)' })
  findOne(@Param('id') id: string, @CurrentUser() user: CallerUser, @Lang() msg: Messages) {
    return this.service.findOne(id, user, msg);
  }

  @Patch(':id/confirm')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Xác nhận đơn → sinh VietQR cho khách thanh toán FULL' })
  confirm(@Param('id') id: string, @CurrentUser() user: CallerUser, @Lang() msg: Messages) {
    return this.service.confirm(id, user, msg);
  }

  @Patch(':id/paid')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Ghi nhận thanh toán FULL → gửi mã code + thông tin qua email' })
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkYachtPaidDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.service.markPaid(id, dto, user, msg);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Huỷ đơn (staff huỷ đơn chưa thanh toán; khách huỷ đơn PENDING của mình)' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelYachtBookingDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.service.cancel(id, dto.reason, user, msg);
  }
}
