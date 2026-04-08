import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Dashboard')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@Controller()
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get('dashboard/stats')
  @ApiOperation({ summary: 'KPI Dashboard' })
  getStats(@CurrentUser() user: any, @Lang() msg: Messages) {
    return this.dashboardService.getStats(user, msg);
  }

  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get('reports')
  @ApiOperation({ summary: 'Báo cáo theo tháng' })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  getReports(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
    @Lang() msg: Messages,
  ) {
    return this.dashboardService.getReports(
      user,
      msg,
      month ? parseInt(month) : undefined,
      year ? parseInt(year) : undefined,
    );
  }
}
