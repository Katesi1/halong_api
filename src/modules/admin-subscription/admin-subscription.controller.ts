import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminSubscriptionService } from './admin-subscription.service';
import { GrantTrialDto } from './dto/grant-trial.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Admin Subscription')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('admin/users/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminSubscriptionController {
  constructor(private adminSubService: AdminSubscriptionService) {}

  @Get('subscription')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Get subscription snapshot for a user' })
  getSubscription(@Param('id') id: string, @Lang() msg: Messages) {
    return this.adminSubService.getSubscription(id, msg);
  }

  @Post('trial')
  @Roles(ROLE.ADMIN)
  @ApiOperation({
    summary: 'Grant or extend trial (30/60/90 days) for an OWNER',
    description:
      'Nếu OWNER đang trong trial chưa hết hạn → cộng thêm `days` ngày vào trialEndsAt. Nếu chưa có hoặc đã hết → bắt đầu trial mới từ thời điểm hiện tại.',
  })
  grantTrial(
    @CurrentUser() admin: any,
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

  @Delete('trial')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Revoke active trial' })
  revokeTrial(
    @CurrentUser() admin: any,
    @Param('id') id: string,
    @Query('reason') reason: string,
    @Lang() msg: Messages,
  ) {
    return this.adminSubService.revokeTrial(admin.id, id, reason, msg);
  }
}
