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
    summary: 'KPI Dashboard — tổng quan hôm nay',
    description: 'ADMIN thấy tất cả, OWNER/SALE chỉ thấy property của mình',
  })
  @ApiResponse({ status: 200, type: DashboardStatsResponse })
  getStats(@CurrentUser() user: any, @Lang() msg: Messages) {
    return this.dashboardService.getStats(user, msg);
  }

  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get('reports')
  @ApiOperation({
    summary: 'Báo cáo theo tháng',
    description: 'Mặc định tháng hiện tại. Trả thống kê booking, doanh thu, occupancy rate, recent bookings.',
  })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Tháng (1-12), mặc định tháng hiện tại' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Năm, mặc định năm hiện tại' })
  @ApiResponse({ status: 200, type: ReportsResponse })
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
