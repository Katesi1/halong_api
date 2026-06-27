import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { CreateBillingPlanDto } from './dto/create-billing-plan.dto';
import { UpdateBillingPlanDto } from './dto/update-billing-plan.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { ROLE, PERMISSION_MODULE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Billing')
@ApiHeader({
  name: 'Accept-Language',
  enum: ['en', 'vi'],
  required: false,
})
@Controller()
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Public()
  @Get('billing/plans')
  @ApiOperation({ summary: 'Get billing plans (public, active only)' })
  getPlans(@Lang() msg: Messages) {
    return this.billingService.getPlans(msg);
  }

  // ─── Admin CRUD ────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.BILLING, 'canRead')
  @ApiBearerAuth('access-token')
  @Get('admin/billing-plans')
  @ApiOperation({ summary: 'Admin: list all billing plans (incl. inactive)' })
  adminList(@Lang() msg: Messages) {
    return this.billingService.adminList(msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.BILLING, 'canCreate')
  @ApiBearerAuth('access-token')
  @Post('admin/billing-plans')
  @ApiOperation({ summary: 'Admin: create new billing plan' })
  adminCreate(@Body() dto: CreateBillingPlanDto, @Lang() msg: Messages) {
    return this.billingService.adminCreate(dto, msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.BILLING, 'canUpdate')
  @ApiBearerAuth('access-token')
  @Put('admin/billing-plans/:id')
  @ApiOperation({ summary: 'Admin: update a billing plan' })
  adminUpdate(
    @Param('id') id: string,
    @Body() dto: UpdateBillingPlanDto,
    @Lang() msg: Messages,
  ) {
    return this.billingService.adminUpdate(id, dto, msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.BILLING, 'canDelete')
  @ApiBearerAuth('access-token')
  @Delete('admin/billing-plans/:id')
  @ApiOperation({
    summary:
      'Admin: delete a billing plan. Hard delete if no references; soft delete (active=false) if subscriptions/payments still reference it.',
  })
  adminDelete(@Param('id') id: string, @Lang() msg: Messages) {
    return this.billingService.adminDelete(id, msg);
  }
}
