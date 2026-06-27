import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { SetPermissionsDto } from './dto/set-permissions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  @Get(':userId')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canRead')
  @ApiOperation({ summary: 'Lấy quyền của user (ADMIN + system SALE users.canRead)' })
  @ApiResponse({ status: 200, description: 'Danh sách quyền theo module' })
  getUserPermissions(@Param('userId') userId: string, @Lang() msg: Messages) {
    return this.permissionsService.getUserPermissions(userId, msg);
  }

  @Put(':userId')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({
    summary: 'Cấp / thu hồi quyền cho user SALE (ADMIN + system SALE users.canUpdate)',
    description:
      'Bulk upsert quyền CRUD cho từng module. Owner-scope: 4 module CRUD truyền thống. Admin-scope: chỉ apply cho SALE hệ thống (scope=system). ' +
      'Mặc định owner-scope canRead=true; admin-scope mặc định false (phải cấp tường minh).',
  })
  @ApiResponse({ status: 200, description: 'Quyền đã được cập nhật' })
  setUserPermissions(
    @Param('userId') userId: string,
    @Body() dto: SetPermissionsDto,
    @Lang() msg: Messages,
  ) {
    return this.permissionsService.setUserPermissions(userId, dto.permissions, msg);
  }
}
