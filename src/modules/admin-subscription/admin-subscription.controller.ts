import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdminSubscriptionService } from './admin-subscription.service';
import { GrantTrialDto } from './dto/grant-trial.dto';
import { SetPriceDto } from './dto/set-price.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { FreezeDto } from './dto/freeze.dto';
import { ListSubscriptionsDto } from './dto/list-subscriptions.dto';
import { CreateCallLogDto } from './dto/call-log.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, isSaleUnassigned, PERMISSION_MODULE } from '../../common/constants';
import { BadRequestException } from '@nestjs/common';
import type { Messages } from '../../i18n';

@ApiTags('Admin Subscription')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AdminSubscriptionController {
  constructor(private adminSubService: AdminSubscriptionService) {}

  // ─── Aggregate / list (no user id in path) ───────────────────────────────
  @Get('admin/subscriptions')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canRead')
  @ApiOperation({ summary: 'List subscriptions across the platform' })
  list(@Query() query: ListSubscriptionsDto, @Lang() msg: Messages) {
    return this.adminSubService.list(query, msg);
  }

  @Get('admin/subscriptions/count-overdue')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canRead')
  @ApiOperation({ summary: 'Count subscriptions in past_due status (sidebar badge)' })
  countOverdue(@Lang() msg: Messages) {
    return this.adminSubService.countOverdue(msg);
  }

  @Get('admin/subscriptions/sum-paid')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canRead')
  @ApiOperation({ summary: 'Sum of paid amounts within a date range' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date (inclusive)' })
  sumPaid(
    @Query('from') from: string,
    @Query('to') to: string,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.sumPaid(from, to, msg);
  }

  // ─── Per-user operations ─────────────────────────────────────────────────
  @Get('admin/users/:id/subscription')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canRead')
  @ApiOperation({ summary: 'Get subscription snapshot for a user' })
  getSubscription(@Param('id') id: string, @Lang() msg: Messages) {
    return this.adminSubService.getSubscription(id, msg);
  }

  @Post('admin/users/:id/trial')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canUpdate')
  @ApiOperation({
    summary: 'Grant or extend trial (any positive days) for an OWNER',
    description:
      'Nếu OWNER đang trong trial chưa hết hạn → cộng thêm `days` ngày vào trialEndsAt. Nếu chưa có hoặc đã hết → bắt đầu trial mới từ thời điểm hiện tại.',
  })
  grantTrial(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Body() dto: GrantTrialDto,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.grantTrial(
      admin.id,
      id,
      dto.days,
      dto.planId,
      dto.cycle,
      dto.rooms,
      dto.reason,
      msg,
    );
  }

  @Delete('admin/users/:id/trial')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canDelete')
  @ApiOperation({ summary: 'Revoke active trial' })
  revokeTrial(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Query('reason') reason: string,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.revokeTrial(admin.id, id, reason, msg);
  }

  @Patch('admin/users/:id/subscription/price')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canUpdate')
  @ApiOperation({
    summary: 'Set or clear custom subscription price for an OWNER',
    description:
      'priceOverride = số VND/kỳ. Truyền null để xoá override và quay lại giá niêm yết của plan.',
  })
  setPrice(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Body() dto: SetPriceDto,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.setPrice(admin.id, id, dto.priceOverride, dto.reason, msg);
  }

  @Post('admin/users/:id/subscription/mark-paid')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canUpdate')
  @ApiOperation({
    summary: 'Record an offline / manual payment and extend the subscription period',
  })
  markPaid(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Body() dto: MarkPaidDto,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.markPaid(admin.id, id, dto, msg);
  }

  @Post('admin/users/:id/subscription/freeze')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canUpdate')
  @ApiOperation({ summary: 'Freeze a subscription (block host without cancelling)' })
  freeze(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Body() dto: FreezeDto,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.freeze(admin.id, id, dto.reason, msg);
  }

  @Post('admin/users/:id/subscription/unfreeze')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canUpdate')
  @ApiOperation({ summary: 'Unfreeze a subscription' })
  unfreeze(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.unfreeze(admin.id, id, msg);
  }

  // ─── Owner self view ─────────────────────────────────────────────────────
  @Get('subscriptions/me')
  @Roles(ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Owner/Sale view their own subscription' })
  getMine(
    @CurrentUser() user: { id: string; role: number; ownerId?: string | null },
    @Lang() msg: Messages,
  ) {
    if (isSaleUnassigned(user)) {
      throw new BadRequestException(msg.users.saleNotAssigned);
    }
    const targetId = user.ownerId ?? user.id;
    return this.adminSubService.getMine(targetId, msg);
  }

  @Get('subscriptions/me/invoices')
  @Roles(ROLE.OWNER, ROLE.SALE)
  @ApiOperation({
    summary: 'Owner/Sale list their own subscription invoices',
    description: 'Lịch sử thanh toán/hóa đơn gói cước. Source: PaymentSession (kind in subscription | renew | upgrade | refund). Newest first.',
  })
  getMyInvoices(
    @CurrentUser() user: { id: string; role: number; ownerId?: string | null },
    @Lang() msg: Messages,
  ) {
    if (isSaleUnassigned(user)) {
      throw new BadRequestException(msg.users.saleNotAssigned);
    }
    const targetId = user.ownerId ?? user.id;
    return this.adminSubService.getMyInvoices(targetId, msg);
  }

  // ─── Admin call logs (chase overdue payments) ───────────────────────────
  @Post('admin/subscriptions/:id/call-log')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canCreate')
  @ApiOperation({
    summary: 'Record a "called user" note for chasing payment',
    description: 'Param :id là userId của OWNER bị quá hạn. Body { note } ≥ 3 ký tự.',
  })
  createCallLog(
    @CurrentUser() admin: { id: string },
    @Param('id') userId: string,
    @Body() dto: CreateCallLogDto,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.createCallLog(admin.id, userId, dto.note, msg);
  }

  @Get('admin/subscriptions/:id/call-log')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.SUBSCRIPTIONS, 'canRead')
  @ApiOperation({ summary: 'List call notes for a user (newest first)' })
  listCallLogs(@Param('id') userId: string, @Lang() msg: Messages) {
    return this.adminSubService.listCallLogs(userId, msg);
  }
}
