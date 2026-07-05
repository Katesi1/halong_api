import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MessageResponse } from '../../common/dto/api-response.dto';
import { UsersService } from './users.service';
import { RejectBankDto } from './dto/reject-bank.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE } from '../../common/constants';
import type { Messages } from '../../i18n';

/**
 * Admin duyệt tài khoản nhận tiền của OWNER.
 * Queue riêng /admin/bank-accounts + approve/reject theo userId.
 * Auth: ADMIN hoặc system SALE có quyền `users` tương ứng.
 */
@ApiTags('Admin - Bank Accounts')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminBankController {
  constructor(private usersService: UsersService) {}

  @Get('bank-accounts')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canRead')
  @ApiOperation({
    summary: 'Danh sách yêu cầu duyệt tài khoản nhận tiền (ADMIN + system SALE users.canRead)',
    description:
      'Response kèm `pendingCount` (badge). Mỗi item: `{ id, name, email, phone, avatar, status, current, pending, rejectReason, submittedAt, reviewedAt }`.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected', 'all'], description: 'Mặc định pending' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Mặc định 20, tối đa 100' })
  @ApiResponse({ status: 200, type: MessageResponse })
  listBankAccounts(
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.adminListBankAccounts(
      msg,
      status,
      page !== undefined ? parseInt(page) : undefined,
      limit !== undefined ? parseInt(limit) : undefined,
    );
  }

  @Post('users/:id/bank/approve')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({
    summary: 'Duyệt tài khoản nhận tiền của OWNER (ADMIN + system SALE users.canUpdate)',
    description: 'Copy giá trị pending → tài khoản đang dùng (bank* live). 400 nếu không có yêu cầu đang chờ.',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  approveBank(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.adminApproveBank(adminId, id, msg);
  }

  @Post('users/:id/bank/reject')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({
    summary: 'Từ chối tài khoản nhận tiền của OWNER (ADMIN + system SALE users.canUpdate)',
    description: 'Giữ nguyên tài khoản đã duyệt trước đó (nếu có), xoá pending, lưu lý do. 400 nếu không có yêu cầu đang chờ.',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  rejectBank(
    @Param('id') id: string,
    @Body() dto: RejectBankDto,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.adminRejectBank(adminId, id, dto.reason, msg);
  }
}
