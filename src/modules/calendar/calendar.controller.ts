import { Controller, Get, Post, Delete, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { CalendarGridQueryDto, CalendarPropertyQueryDto, CalendarLockDto, CalendarUnlockDto } from './dto/calendar-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';
import { CalendarGridResponse, CalendarPropertyListResponse, MessageResponse, AdminContactResponse } from '../../common/dto/api-response.dto';

@ApiTags('Calendar')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get('properties')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Danh sách property cho calendar' })
  @ApiResponse({ status: 200, type: CalendarPropertyListResponse })
  getProperties(
    @CurrentUser() user: any,
    @Query() query: CalendarPropertyQueryDto,
    @Lang() msg: Messages,
  ) {
    return this.calendarService.getProperties(user, msg, query.type, query.ownerId);
  }

  @Public()
  @Get('public-grid')
  @ApiOperation({
    summary: 'Trang 1 — Lịch tổng tất cả properties (chỉ xem, không cần auth)',
    description: 'Trả lịch tất cả properties đang hoạt động. Mỗi property có mảng days[] với status từng ngày.',
  })
  @ApiResponse({ status: 200, type: CalendarGridResponse })
  getPublicGrid(
    @Query() query: CalendarGridQueryDto,
    @Lang() msg: Messages,
  ) {
    return this.calendarService.getPublicGrid(
      query.startDate,
      query.endDate,
      msg,
      query.propertyId,
      query.type,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get('grid')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Trang 2 — Lịch quản lý (OWNER/SALE thấy property của mình, ADMIN thấy tất cả)',
    description: 'Giống public-grid nhưng: cần auth, OWNER/SALE chỉ thấy property của mình, có thêm field note (tên khách).',
  })
  @ApiResponse({ status: 200, type: CalendarGridResponse })
  getCalendarGrid(
    @CurrentUser() user: any,
    @Query() query: CalendarGridQueryDto,
    @Lang() msg: Messages,
  ) {
    return this.calendarService.getCalendarGrid(
      query.startDate,
      query.endDate,
      user,
      msg,
      query.propertyId,
      query.type,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Post('lock')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Khoá ngày (chủ nhà)' })
  @ApiResponse({ status: 201, type: MessageResponse })
  lockDate(@Body() dto: CalendarLockDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.calendarService.lockDate(dto.propertyId, dto.date, dto.status, user, msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Delete('lock')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mở khoá ngày (chủ nhà)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  unlockDate(@Body() dto: CalendarUnlockDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.calendarService.unlockDate(dto.propertyId, dto.date, user, msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Patch('sold')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Đánh dấu ngày đã bán' })
  @ApiResponse({ status: 200, type: MessageResponse })
  markSold(@Body() dto: CalendarLockDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.calendarService.markSold(dto.propertyId, dto.date, user, msg);
  }

  @Public()
  @Get('admin-contact')
  @ApiOperation({ summary: 'Thông tin liên hệ admin' })
  @ApiResponse({ status: 200, type: AdminContactResponse })
  getAdminContact(@Lang() msg: Messages) {
    return this.calendarService.getAdminContact(msg);
  }
}
