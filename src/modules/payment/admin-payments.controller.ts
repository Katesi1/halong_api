import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE } from '../../common/constants';
import type { Messages } from '../../i18n';
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateReceivingBankDto } from './dto/update-receiving-bank.dto';

class AdminMarkPaidDto {
  @ApiPropertyOptional({
    description:
      'Mã tham chiếu giao dịch trong app banking (vd: "FT26060512345678"). Lưu vào referenceCode để đối soát sau.',
    example: 'FT26060512345678',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

@ApiTags('Admin Payments')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private paymentService: PaymentService) {}

  @Get()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PAYMENTS, 'canRead')
  @ApiOperation({
    summary: 'List payment sessions để đối soát thủ công',
    description:
      'Mặc định trả tất cả status. Dùng `?status=pending` để filter session chờ chuyển khoản. ' +
      '`?search=` match sessionId / planLabel / referenceCode. ' +
      'Hydrate user info (name, email, phone) để admin liên hệ nếu cần.',
  })
  @ApiQuery({ name: 'status', required: false, description: 'pending | paid | failed | expired | refunded' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date — createdAt >=' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date — createdAt <=' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query('status') status: string,
    @Query('userId') userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.adminListSessions(
      {
        status,
        userId,
        from,
        to,
        search,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      msg,
    );
  }

  @Post(':sessionId/mark-paid')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PAYMENTS, 'canUpdate')
  @ApiOperation({
    summary: 'Admin xác nhận đã nhận tiền cho session (manual reconcile)',
    description:
      'Dùng khi admin tự kiểm tra app banking thấy có giao dịch và muốn activate session tương ứng. ' +
      'Idempotent — gọi 2 lần với cùng sessionId không tạo double payment. ' +
      'Cho phép mark cả session đã expired (vì tiền có thể vào sau hạn).',
  })
  markPaid(
    @CurrentUser('id') adminId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: AdminMarkPaidDto,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.adminMarkSessionPaid(
      adminId,
      sessionId,
      dto.reference,
      msg,
    );
  }

  @Get('receiving-bank')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PAYMENTS, 'canRead')
  @ApiOperation({
    summary: 'Xem STK nhận tiền MUA GÓI (subscription) hiện hành',
    description:
      'Trả STK platform đang dùng để sinh VietQR khi OWNER mua/gia hạn gói. ' +
      '`source="db"` = admin đã cấu hình; `source="env"` = đang dùng fallback biến môi trường (chưa từng set).',
  })
  getReceivingBank(@Lang() msg: Messages) {
    return this.paymentService.adminGetReceivingBank(msg);
  }

  @Put('receiving-bank')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PAYMENTS, 'canUpdate')
  @ApiOperation({
    summary: 'Cập nhật STK nhận tiền MUA GÓI (subscription)',
    description:
      'Ghi thẳng vào STK platform (không cần duyệt — đây là tài khoản của Halong24h). ' +
      'Có hiệu lực NGAY cho các session mua gói tạo sau đó. Ghi audit log `payment.receiving_bank_update`.',
  })
  updateReceivingBank(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateReceivingBankDto,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.adminUpdateReceivingBank(adminId, dto, msg);
  }
}
