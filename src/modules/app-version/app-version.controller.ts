import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppVersionService } from './app-version.service';
import { UpdateVersionDto } from './dto/update-version.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('App Version')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller()
export class AppVersionController {
  constructor(private appVersionService: AppVersionService) {}

  @Public()
  @Get('app/version')
  @ApiOperation({
    summary: 'Force-update check (public, gọi ở app launch)',
    description: 'Trả latest version + min supported version + store URLs. FE so sánh để hiện force/soft update dialog.',
  })
  @ApiQuery({ name: 'platform', required: false, enum: ['ios', 'android'] })
  @ApiQuery({ name: 'currentVersion', required: false, description: 'Version app hiện tại (tham khảo, không bắt buộc)' })
  getVersion(
    @Query('platform') platform: string,
    @Query('currentVersion') currentVersion: string,
    @Lang() msg: Messages,
  ) {
    return this.appVersionService.getVersion(platform, currentVersion, msg);
  }

  @Post('admin/app-version')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Admin upsert version (ADMIN only)' })
  @ApiResponse({ status: 201 })
  upsertVersion(@Body() dto: UpdateVersionDto, @Lang() msg: Messages) {
    return this.appVersionService.upsertVersion(dto, msg);
  }
}
