import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { CalendarGridQueryDto, PropertyGroupQueryDto, CalendarLockDto } from './dto/calendar-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';
import type { Messages } from '../../i18n';

@ApiTags('Calendar')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('calendar')
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @Get('property-groups')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Danh sách nhóm property cho calendar' })
  getPropertyGroups(
    @CurrentUser() user: any,
    @Query() query: PropertyGroupQueryDto,
    @Lang() msg: Messages,
  ) {
    return this.calendarService.getPropertyGroups(user, msg, query.category, query.ownerId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @Get('grid')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy dữ liệu lịch grid (rooms × dates)' })
  getCalendarGrid(
    @CurrentUser() user: any,
    @Query() query: CalendarGridQueryDto,
    @Lang() msg: Messages,
  ) {
    return this.calendarService.getCalendarGrid(
      query.propertyGroupId,
      query.startDate,
      query.endDate,
      user,
      msg,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @Post('lock')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Khoá phòng theo ngày (chủ nhà)' })
  lockRoom(@Body() dto: CalendarLockDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.calendarService.lockRoom(dto.roomId, dto.date, dto.status, user, msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF)
  @Post('unlock')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mở khoá phòng theo ngày (chủ nhà)' })
  unlockRoom(@Body() dto: CalendarLockDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.calendarService.unlockRoom(dto.roomId, dto.date, user, msg);
  }

  @Public()
  @Get('admin-contact')
  @ApiOperation({ summary: 'Thông tin liên hệ admin' })
  getAdminContact(@Lang() msg: Messages) {
    return this.calendarService.getAdminContact(msg);
  }
}
