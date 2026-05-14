import {
  Controller, Get, Post, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Staff')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('staff')
export class StaffController {
  constructor(private staffService: StaffService) {}

  // ─── OWNER endpoints (auth required) ──────────────────────────────────────

  @Post('invites')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'OWNER tạo invite cho nhân viên' })
  @ApiResponse({ status: 201, description: 'Invite created and email sent (or queued)' })
  @ApiResponse({ status: 403, description: 'Không phải OWNER / chưa KYC / không có subscription' })
  @ApiResponse({ status: 409, description: 'Email đã có tài khoản hoặc đã có invite pending' })
  createInvite(
    @CurrentUser('id') ownerId: string,
    @Body() dto: CreateInviteDto,
    @Lang() msg: Messages,
  ) {
    return this.staffService.createInvite(ownerId, dto, msg);
  }

  @Get('invites')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'OWNER list invite của mình' })
  @ApiQuery({ name: 'status', required: false, description: 'pending | accepted | expired | cancelled | all' })
  listInvites(
    @CurrentUser('id') ownerId: string,
    @Query('status') status: string,
    @Lang() msg: Messages,
  ) {
    return this.staffService.listInvites(ownerId, status, msg);
  }

  @Delete('invites/:id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'OWNER huỷ invite chưa accept' })
  cancelInvite(
    @CurrentUser('id') ownerId: string,
    @Param('id') inviteId: string,
    @Lang() msg: Messages,
  ) {
    return this.staffService.cancelInvite(ownerId, inviteId, msg);
  }

  @Get()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'OWNER list nhân viên hiện tại' })
  @ApiQuery({ name: 'isActive', required: false, description: 'true | false | all (default true)' })
  listStaff(
    @CurrentUser('id') ownerId: string,
    @Query('isActive') isActive: string,
    @Lang() msg: Messages,
  ) {
    return this.staffService.listStaff(ownerId, isActive ?? 'true', msg);
  }

  @Delete(':userId')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'OWNER soft-delete nhân viên (revoke session)' })
  removeStaff(
    @CurrentUser('id') ownerId: string,
    @Param('userId') staffId: string,
    @Lang() msg: Messages,
  ) {
    return this.staffService.removeStaff(ownerId, staffId, msg);
  }

  // ─── Public endpoints ─────────────────────────────────────────────────────

  @Get('invites/verify/:token')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 req / phút / IP
  @ApiOperation({ summary: 'Verify invite token (public, dùng cho màn AcceptInvite)', description: 'Param có thể là token đầy đủ (64 hex) hoặc short code (HL-XXXXXX)' })
  @ApiResponse({ status: 200, description: 'Token hợp lệ — trả thông tin OWNER + homestay' })
  @ApiResponse({ status: 404, description: 'Token không tồn tại' })
  @ApiResponse({ status: 410, description: 'Token đã hết hạn / đã dùng / đã huỷ' })
  verifyInvite(@Param('token') token: string, @Lang() msg: Messages) {
    return this.staffService.verifyInvite(token, msg);
  }

  @Post('invites/accept')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept invite — tạo SALE account mới', description: 'method=google (kèm idToken) hoặc method=password (kèm name, password, phone?)' })
  @ApiResponse({ status: 200, description: 'Tạo user SALE thành công, trả tokens' })
  @ApiResponse({ status: 401, description: 'Google idToken không hợp lệ' })
  @ApiResponse({ status: 403, description: 'Email Google không khớp với invite email' })
  @ApiResponse({ status: 409, description: 'Email đã có tài khoản' })
  @ApiResponse({ status: 410, description: 'Token đã hết hạn / dùng / huỷ' })
  acceptInvite(@Body() dto: AcceptInviteDto, @Lang() msg: Messages) {
    return this.staffService.acceptInvite(dto, msg);
  }
}
