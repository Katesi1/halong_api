import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
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
import { GetKycQueueDto } from './dto/get-kyc-queue.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { KYC_ADMIN_FILTER, ROLE } from '../../common/constants';
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
  @ApiOperation({
    summary: 'Danh sách hồ sơ KYC (một endpoint, filter tab 0–3)',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: [0, 1, 2, 3],
    description: '0=tất cả, 1=chờ duyệt, 2=đã duyệt, 3=đã từ chối',
  })
  getQueue(@Query() query: GetKycQueueDto, @Lang() msg: Messages) {
    const filter = this.adminKycService.resolveFilter(
      query.filter,
      query.status,
    );
    if (
      filter < KYC_ADMIN_FILTER.ALL ||
      filter > KYC_ADMIN_FILTER.REJECTED
    ) {
      throw new BadRequestException(msg.adminKyc.invalidFilter);
    }
    return this.adminKycService.getQueue(
      query.page ?? 1,
      query.pageSize ?? 20,
      filter,
      query.q,
      msg,
    );
  }

  @Get('count-pending')
  @Roles(ROLE.ADMIN)
  @ApiOperation({
    summary:
      'Badge chờ duyệt (deprecated — dùng pendingCount trong GET /queue)',
  })
  countPending(@Lang() msg: Messages) {
    return this.adminKycService.countPending(msg);
  }

  @Get(':id')
  @Roles(ROLE.ADMIN)
  @ApiOperation({
    summary: 'Chi tiết hồ sơ KYC kèm 7 mục xác minh',
    description: 'Trả full submission + uploads + verificationFields (7 boolean checklist).',
  })
  getDetail(@Param('id') id: string, @Lang() msg: Messages) {
    return this.adminKycService.getDetail(id, msg);
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
