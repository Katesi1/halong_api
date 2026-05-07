import {
  Controller,
  Get,
  Post,
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
import { AdminKycService } from './admin-kyc.service';
import { ApproveKycDto } from './dto/approve-kyc.dto';
import { RejectKycDto } from './dto/reject-kyc.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Admin KYC')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: 'Accept-Language',
  enum: ['en', 'vi'],
  required: false,
})
@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminKycController {
  constructor(private adminKycService: AdminKycService) {}

  @Get('queue')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Get KYC approval queue' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  getQueue(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('status') status: string,
    @Lang() msg: Messages,
  ) {
    return this.adminKycService.getQueue(
      parseInt(page) || 1,
      parseInt(pageSize) || 20,
      status || undefined,
      msg,
    );
  }

  @Post('submissions/:id/approve')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Approve KYC submission' })
  approve(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ApproveKycDto,
    @Lang() msg: Messages,
  ) {
    return this.adminKycService.approve(user.id, id, dto.trialDays ?? 7, msg);
  }

  @Post('submissions/:id/reject')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'Reject KYC submission' })
  reject(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RejectKycDto,
    @Lang() msg: Messages,
  ) {
    return this.adminKycService.reject(user.id, id, dto.reason, dto.items, msg);
  }
}
