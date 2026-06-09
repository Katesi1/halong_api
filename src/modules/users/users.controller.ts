import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserListResponse, UserResponse, MessageResponse } from '../../common/dto/api-response.dto';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddStaffDto } from './dto/add-staff.dto';
import { ToggleKycBypassDto } from './dto/toggle-kyc-bypass.dto';
import { SelfDeleteDto } from './dto/self-delete.dto';
import { BanUserDto, AdminResetPasswordDto, ChangeRoleDto } from './dto/admin-actions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Danh sách user (Admin only)' })
  @ApiQuery({ name: 'role', required: false, description: '0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER' })
  @ApiQuery({ name: 'withStats', required: false, description: 'true → bundle `stats.{propertyCount,bookingCount}` cho mỗi user' })
  @ApiResponse({ status: 200, type: UserListResponse })
  findAll(
    @Query('role') role: string,
    @Query('withStats') withStats: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.findAll(
      msg,
      role !== undefined ? parseInt(role) : undefined,
      withStats === 'true',
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
    summary: 'Self-delete tài khoản (compliance Apple/Google/GDPR)',
    description: 'User xoá account của chính mình. Soft-delete + giải phóng email/phone unique. User có thể re-register ngay với email cũ.',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  selfDelete(
    @CurrentUser('id') userId: string,
    @Body() dto: SelfDeleteDto,
    @Lang() msg: Messages,
  ) {
    return this.usersService.selfDelete(userId, dto.reason, msg);
  }

  @Get(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @ApiOperation({ summary: 'Chi tiết user (Admin: tất cả, Owner: SALE của mình)' })
  @ApiResponse({ status: 200, type: UserResponse })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.usersService.findOne(id, user, msg);
  }

  @Post()
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Tạo user mới (Admin only)' })
  @ApiResponse({ status: 201, type: UserResponse })
  create(@Body() dto: CreateUserDto, @Lang() msg: Messages) {
    return this.usersService.create(dto, msg);
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
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Bật/tắt quyền bỏ qua KYC cho OWNER (Admin only)' })
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
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Xóa user (Admin only)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  remove(@Param('id') id: string, @CurrentUser('id') currentUserId: string, @Lang() msg: Messages) {
    return this.usersService.remove(id, currentUserId, msg);
  }

  // ─── Admin moderation actions ──────────────────────────────────────────────

  @Post(':id/ban')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN ban user (soft-disable + revoke sessions)' })
  banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.banUser(adminId, id, dto.reason, msg);
  }

  @Post(':id/unban')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN gỡ ban user' })
  unbanUser(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.unbanUser(adminId, id, msg);
  }

  @Post(':id/revoke-sessions')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN thu hồi tất cả phiên đăng nhập + FCM token của user' })
  revokeSessions(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.revokeSessions(adminId, id, msg);
  }

  @Post(':id/reset-password')
  @Roles(ROLE.ADMIN)
  @ApiOperation({
    summary: 'ADMIN reset password user',
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
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN đổi role user' })
  changeRole(
    @Param('id') id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser('id') adminId: string,
    @Lang() msg: Messages,
  ) {
    return this.usersService.changeRole(adminId, id, dto.role, msg);
  }
}
