import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';
import { DashboardStatsResponse, ReportsResponse } from '../../common/dto/api-response.dto';

@ApiTags('Dashboard')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@Controller()
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get('dashboard/stats')
  @ApiOperation({
    summary: 'KPI Dashboard — tong quan hom nay',
    description: 'ADMIN thay tat ca, OWNER/SALE chi thay property cua minh',
  })
  @ApiResponse({ status: 200, type: DashboardStatsResponse })
  getStats(@CurrentUser() user: any, @Lang() msg: Messages) {
    return this.dashboardService.getStats(user, msg);
  }

  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get('reports')
  @ApiOperation({
    summary: 'Bao cao mo rong',
    description: 'Ho tro period filter (today/week/month/year/custom). Backward-compat voi month/year cu. Tra du lieu KPI, trend, top rooms, ratings, reviews.',
  })
  @ApiQuery({ name: 'period', required: false, enum: ['today', 'week', 'month', 'year', 'custom'], description: 'Ky bao cao' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'YYYY-MM-DD (bat buoc khi period=custom)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'YYYY-MM-DD (bat buoc khi period=custom)' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Legacy: Thang (1-12)' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Legacy: Nam' })
  @ApiResponse({ status: 200, type: ReportsResponse })
  getReports(
    @CurrentUser() user: any,
    @Query('period') period: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @Lang() msg: Messages,
  ) {
    return this.dashboardService.getReports(user, msg, {
      period: period || undefined,
      from: from || undefined,
      to: to || undefined,
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
    });
  }
}
