import {
  Controller, Get, Post, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SystemStaffService } from './system-staff.service';
import { CreateSystemInviteDto } from './dto/create-system-invite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('System Staff (Admin-grade SALE)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/system-staff')
export class SystemStaffController {
  constructor(private service: SystemStaffService) {}

  @Post('invites')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canCreate')
  @ApiOperation({
    summary: 'Tạo invite SALE hệ thống',
    description:
      'Reuse bảng staff_invites với scope="system". Sau khi accept user mới sẽ có role=SALE, scope=system, ownerId=null. ' +
      'ADMIN cấp quyền chi tiết qua PUT /permissions/:userId. ' +
      'Verify + accept dùng chung endpoint /staff/invites/verify/:token + /staff/invites/accept.',
  })
  createInvite(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateSystemInviteDto,
    @Lang() msg: Messages,
  ) {
    return this.service.createInvite(adminId, dto, msg);
  }

  @Get('invites')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canRead')
  @ApiOperation({ summary: 'List system-staff invites (mặc định mọi status)' })
  @ApiQuery({ name: 'status', required: false, description: 'pending | accepted | expired | cancelled | all' })
  listInvites(@Query('status') status: string, @Lang() msg: Messages) {
    return this.service.listInvites(status, msg);
  }

  @Delete('invites/:id')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({ summary: 'Huỷ invite SALE hệ thống đang pending' })
  cancelInvite(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Lang() msg: Messages,
  ) {
    return this.service.cancelInvite(adminId, id, msg);
  }

  @Get()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canRead')
  @ApiOperation({ summary: 'List SALE hệ thống (kèm permissions per user)' })
  @ApiQuery({ name: 'isActive', required: false, description: 'true | false | all (default all)' })
  list(@Query('isActive') isActive: string, @Lang() msg: Messages) {
    return this.service.listStaff(isActive, msg);
  }

  @Delete(':userId')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canDelete')
  @ApiOperation({ summary: 'Gỡ SALE hệ thống (soft-disable + revoke sessions)' })
  remove(
    @CurrentUser('id') adminId: string,
    @Param('userId') staffId: string,
    @Lang() msg: Messages,
  ) {
    return this.service.removeStaff(adminId, staffId, msg);
  }
}
