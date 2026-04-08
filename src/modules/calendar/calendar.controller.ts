import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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

@ApiTags('Calendar')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.STAFF)
  @Get('properties')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Danh sách property cho calendar' })
  getProperties(
    @CurrentUser() user: any,
    @Query() query: CalendarPropertyQueryDto,
    @Lang() msg: Messages,
  ) {
    return this.calendarService.getProperties(user, msg, query.type, query.ownerId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.STAFF)
  @Get('grid')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy dữ liệu lịch grid (property × dates)' })
  getCalendarGrid(
    @CurrentUser() user: any,
    @Query() query: CalendarGridQueryDto,
    @Lang() msg: Messages,
  ) {
    return this.calendarService.getCalendarGrid(
      query.propertyId,
      query.startDate,
      query.endDate,
      user,
      msg,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.STAFF)
  @Post('lock')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Khoá ngày (chủ nhà)' })
  lockDate(@Body() dto: CalendarLockDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.calendarService.lockDate(dto.propertyId, dto.date, dto.status, user, msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.STAFF)
  @Post('unlock')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mở khoá ngày (chủ nhà)' })
  unlockDate(@Body() dto: CalendarUnlockDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.calendarService.unlockDate(dto.propertyId, dto.date, user, msg);
  }

  @Public()
  @Get('admin-contact')
  @ApiOperation({ summary: 'Thông tin liên hệ admin' })
  getAdminContact(@Lang() msg: Messages) {
    return this.calendarService.getAdminContact(msg);
  }
}
