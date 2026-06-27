import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { ResolveDisputeDto, RejectDisputeDto } from './dto/resolve-dispute.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Disputes')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DisputesController {
  constructor(private disputesService: DisputesService) {}

  // ─── Open (any authenticated) ─────────────────────────────────────────────
  @Post('disputes')
  @ApiOperation({
    summary: 'Mở dispute từ booking',
    description: 'OWNER/SALE của property hoặc CUSTOMER của booking. ADMIN luôn được.',
  })
  open(
    @Body() dto: OpenDisputeDto,
    @CurrentUser() user: { id: string; role: number; ownerId?: string | null },
    @Lang() msg: Messages,
  ) {
    return this.disputesService.open(user, dto, msg);
  }

  // ─── Admin endpoints ──────────────────────────────────────────────────────
  @Get('admin/disputes')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.DISPUTES, 'canRead')
  @ApiOperation({ summary: 'List disputes (ADMIN)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query('status') status: string,
    @Query('type') type: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.disputesService.list(
      {
        status,
        type,
        search,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      msg,
    );
  }

  @Get('admin/disputes/count-active')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.DISPUTES, 'canRead')
  @ApiOperation({ summary: 'Count pending + investigating disputes (sidebar badge)' })
  countActive(@Lang() msg: Messages) {
    return this.disputesService.countActive(msg);
  }

  @Get('admin/disputes/:id')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.DISPUTES, 'canRead')
  @ApiOperation({ summary: 'Chi tiết dispute kèm property/booking/parties' })
  findOne(@Param('id') id: string, @Lang() msg: Messages) {
    return this.disputesService.findOne(id, msg);
  }

  @Post('admin/disputes/:id/investigate')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.DISPUTES, 'canUpdate')
  @ApiOperation({ summary: 'Chuyển dispute sang trạng thái đang điều tra' })
  investigate(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string; role: number },
    @Lang() msg: Messages,
  ) {
    return this.disputesService.investigate(admin.id, admin.role, id, msg);
  }

  @Post('admin/disputes/:id/resolve')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.DISPUTES, 'canUpdate')
  @ApiOperation({ summary: 'Đóng dispute với phán quyết (kèm refundAmount nếu có)' })
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser() admin: { id: string; role: number },
    @Lang() msg: Messages,
  ) {
    return this.disputesService.resolve(admin.id, admin.role, id, dto, msg);
  }

  @Post('admin/disputes/:id/reject')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.DISPUTES, 'canUpdate')
  @ApiOperation({ summary: 'Bác dispute' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectDisputeDto,
    @CurrentUser() admin: { id: string; role: number },
    @Lang() msg: Messages,
  ) {
    return this.disputesService.reject(admin.id, admin.role, id, dto, msg);
  }
}
