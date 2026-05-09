import { Controller, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { SetPermissionsDto } from './dto/set-permissions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  @Get(':userId')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Lấy quyền của user (Admin only)' })
  @ApiResponse({ status: 200, description: 'Danh sách quyền theo module' })
  getUserPermissions(@Param('userId') userId: string, @Lang() msg: Messages) {
    return this.permissionsService.getUserPermissions(userId, msg);
  }

  @Put(':userId')
  @Roles(ROLE.ADMIN)
  @ApiOperation({
    summary: 'Cấp / thu hồi quyền cho user (Admin only)',
    description: 'Bulk upsert quyền CRUD cho từng module. Mặc định: chỉ Read. Admin cấp thêm Create/Update/Delete.',
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
