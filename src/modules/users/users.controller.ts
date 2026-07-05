import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserListResponse, UserResponse, MessageResponse } from '../../common/dto/api-response.dto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { ToggleKycBypassDto } from './dto/toggle-kyc-bypass.dto';
import { SelfDeleteDto } from './dto/self-delete.dto';
import { BanUserDto, AdminResetPasswordDto, ChangeRoleDto } from './dto/admin-actions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canRead')
  @ApiOperation({ summary: 'Danh sách user (ADMIN + system SALE có users.canRead)' })
  @ApiQuery({ name: 'role', required: false, description: '0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER' })
  @ApiQuery({ name: 'withStats', required: false, description: 'true → bundle `stats.{propertyCount,bookingCount}` cho mỗi user' })
  @ApiQuery({ name: 'q', required: false, description: 'Keyword search theo name / phone / email (không phân biệt hoa thường, max 100 ký tự)' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['owner', 'system', 'all'],
    description:
      'Lọc theo SALE scope. `owner` = SALE thuộc OWNER. `system` = SALE hệ thống (admin-grade). `all` hoặc bỏ qua = không lọc. Khi truyền `owner`/`system`, BE tự ép `role=2`.',
  })
  @ApiResponse({ status: 200, type: UserListResponse })
  findAll(
    @Query('role') role: string,
    @Query('withStats') withStats: string,
    @Query('q') q: string,
    @Query('scope') scope: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.findAll(
      msg,
      role !== undefined ? parseInt(role) : undefined,
      withStats === 'true',
      q,
      scope,
    );
  }

  @Get('available-staff')
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @ApiOperation({ summary: 'Danh sách SALE chưa thuộc owner nào (Admin/Owner)' })
  @ApiResponse({ status: 200, type: UserListResponse })
  getAvailableStaff(@Lang() msg: Messages) {
    return this.usersService.getAvailableStaff(msg);
  }

  @Get('my-staff')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Danh sách nhân viên của tôi (Owner only)' })
  @ApiResponse({ status: 200, type: UserListResponse })
  getMyStaff(@CurrentUser('id') ownerId: string, @Lang() msg: Messages) {
    return this.usersService.getMyStaff(ownerId, msg);
  }

  @Delete('me')
  @ApiOperation({
    summary: 'Self-delete tài khoản (compliance Apple/Google/GDPR + NĐ 13)',
    description: 'User xoá account của chính mình. Tạo deletion request grace 30 ngày. Gửi notification + email cảnh báo có link khôi phục. Đăng nhập lại HOẶC gọi POST /users/me/restore trong grace → tự huỷ.',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  selfDelete(
    @CurrentUser('id') userId: string,
    @Body() dto: SelfDeleteDto,
    @Lang() msg: Messages,
  ) {
    return this.usersService.selfDelete(userId, dto.reason, msg);
  }

  @Get('me/deletion-status')
  @ApiOperation({
    summary: 'Trạng thái yêu cầu xoá tài khoản hiện tại',
    description: 'Trả về `{ pending, scheduledDeleteAt, daysRemaining }`. FE dùng để show banner khôi phục trong grace 30 ngày.',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  getDeletionStatus(
    @CurrentUser('id') userId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.getDeletionStatus(userId, msg);
  }

  @Post('me/restore')
  @ApiOperation({
    summary: 'Khôi phục tài khoản — huỷ yêu cầu xoá đang pending',
    description: 'User chủ động huỷ yêu cầu xoá tài khoản trong grace 30 ngày. Tạo notification + email xác nhận khôi phục. Trả 400 nếu không có pending request.',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  async restoreAccount(
    @CurrentUser('id') userId: string,
    @Lang() msg: Messages,
  ) {
    await this.usersService.cancelDeletion(userId, 'user_cancel', msg);
    return { message: msg.users.deletionRestoreSuccess, data: null };
  }

  @Get('me/bank')
  @Roles(ROLE.OWNER)
  @ApiOperation({
    summary: 'Xem tài khoản nhận tiền của tôi (OWNER)',
    description:
      'Trả `{ status, current, pending, rejectReason, submittedAt, reviewedAt }`. `current` = giá trị đã duyệt (dùng sinh VietQR); `pending` != null khi đang chờ ADMIN duyệt.',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  getMyBank(@CurrentUser('id') userId: string, @Lang() msg: Messages) {
    return this.usersService.getMyBank(userId, msg);
  }

  @Put('me/bank')
  @Roles(ROLE.OWNER)
  @ApiOperation({
    summary: 'Gửi/sửa tài khoản nhận tiền — CHỜ ADMIN DUYỆT (OWNER)',
    description:
      'Ghi vào pending, KHÔNG áp vào tài khoản đang dùng cho tới khi ADMIN duyệt. Sau khi gửi, `bankStatus="pending"`. VietQR vẫn dùng giá trị đã duyệt trước đó (nếu có).',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  submitBankChange(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateBankDto,
    @Lang() msg: Messages,
  ) {
    return this.usersService.submitBankChange(userId, dto, msg);
  }

  @Get(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @ApiOperation({ summary: 'Chi tiết user (Admin: tất cả, Owner: SALE của mình)' })
  @ApiResponse({ status: 200, type: UserResponse })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.usersService.findOne(id, user, msg);
  }

  @Post()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canCreate')
  @ApiOperation({
    summary: 'Tạo user mới (ADMIN + system SALE có users.canCreate)',
    description:
      'Truyền role=2 + scope="system" để tạo SALE hệ thống (chỉ ADMIN được tạo system SALE). ADMIN sẽ cấp quyền chi tiết qua PUT /permissions/:userId.',
  })
  @ApiResponse({ status: 201, type: UserResponse })
  create(@Body() dto: CreateUserDto, @CurrentUser() currentUser: any, @Lang() msg: Messages) {
    return this.usersService.create(dto, currentUser, msg);
  }

  @Post('my-staff')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Thêm nhân viên (SALE) vào đội của tôi — truyền email của sale' })
  @ApiResponse({ status: 201, type: UserResponse })
  addMyStaff(
    @CurrentUser('id') ownerId: string,
    @Body() dto: AddStaffDto,
    @Lang() msg: Messages,
  ) {
    return this.usersService.addMyStaff(ownerId, dto.email, msg);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật user — ADMIN sửa ai cũng được, user khác chỉ sửa chính mình' })
  @ApiResponse({ status: 200, type: UserResponse })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.usersService.update(id, dto, user, msg);
  }

  @Patch(':id/kyc-bypass')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({ summary: 'Bật/tắt quyền bỏ qua KYC cho OWNER (ADMIN + system SALE users.canUpdate)' })
  @ApiResponse({ status: 200, type: UserResponse })
  toggleKycBypass(
    @Param('id') id: string,
    @Body() dto: ToggleKycBypassDto,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.toggleKycBypass(adminId, id, dto.bypass, msg);
  }

  @Delete('my-staff/:id')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Gỡ nhân viên khỏi đội của tôi (Owner only)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  removeMyStaff(
    @Param('id') staffId: string,
    @CurrentUser('id') ownerId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.removeMyStaff(ownerId, staffId, msg);
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canDelete')
  @ApiOperation({ summary: 'Xóa user (ADMIN + system SALE users.canDelete)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  remove(@Param('id') id: string, @CurrentUser('id') currentUserId: string, @Lang() msg: Messages) {
    return this.usersService.remove(id, currentUserId, msg);
  }

  // ─── Admin moderation actions ──────────────────────────────────────────────

  @Post(':id/ban')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({ summary: 'Ban user (ADMIN + system SALE users.canUpdate)' })
  banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentUser() caller: any,
    @Lang() msg: Messages,
  ) {
    return this.usersService.banUser(caller, id, dto.reason, msg);
  }

  @Post(':id/unban')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({ summary: 'Gỡ ban user (ADMIN + system SALE users.canUpdate)' })
  unbanUser(
    @Param('id') id: string,
    @CurrentUser() caller: any,
    @Lang() msg: Messages,
  ) {
    return this.usersService.unbanUser(caller, id, msg);
  }

  @Post(':id/revoke-sessions')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({ summary: 'Thu hồi tất cả phiên đăng nhập + FCM token (ADMIN + system SALE users.canUpdate)' })
  revokeSessions(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.revokeSessions(adminId, id, msg);
  }

  @Post(':id/reset-password')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({
    summary: 'Reset password user (ADMIN + system SALE users.canUpdate)',
    description:
      'Body { newPassword? } — không truyền: BE tự sinh mật khẩu tạm và trả về 1 lần để admin gửi cho user.',
  })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.adminResetPassword(adminId, id, dto.newPassword, msg);
  }

  @Patch(':id/role')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.USERS, 'canUpdate')
  @ApiOperation({ summary: 'Đổi role user (ADMIN + system SALE users.canUpdate)' })
  changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() caller: any,
    @Lang() msg: Messages,
  ) {
    return this.usersService.changeRole(caller, id, dto.role, msg);
  }
}
