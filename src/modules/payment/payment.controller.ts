import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Headers,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { RenewPaymentDto } from './dto/renew-payment.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

function getClientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return xff || req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

@ApiTags('Payment')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: 'Accept-Language',
  enum: ['en', 'vi'],
  required: false,
})
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('initiate')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Create payment session (subscription)' })
  initiate(
    @CurrentUser() user: any,
    @Body() dto: InitiatePaymentDto,
    @Req() req: Request,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.initiate(user, dto, getClientIp(req), msg);
  }

  @Post('renew')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Create renewal payment session' })
  renew(
    @CurrentUser() user: any,
    @Body() dto: RenewPaymentDto,
    @Req() req: Request,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.renew(user, dto.method, getClientIp(req), msg);
  }

  @Get('history')
  @Roles(ROLE.OWNER, ROLE.ADMIN)
  @ApiOperation({ summary: 'List payment history of current user' })
  history(
    @CurrentUser() user: any,
    @Query() query: HistoryQueryDto,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.getHistory(
      user,
      query.limit ?? 50,
      query.cursor,
      msg,
    );
  }

  @Get(':sessionId/status')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Check payment status' })
  getStatus(
    @CurrentUser() user: any,
    @Param('sessionId') sessionId: string,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.getStatus(user, sessionId, msg);
  }

  @Post(':sessionId/refund')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Request refund' })
  refund(
    @CurrentUser() user: any,
    @Param('sessionId') sessionId: string,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.refund(user, sessionId, msg);
  }

  @Public()
  @Post('vnpay/ipn')
  @HttpCode(200)
  @ApiOperation({ summary: 'VNPay IPN webhook (public, HMAC-verified)' })
  vnpayIpn(@Body() payload: Record<string, string>, @Req() req: Request) {
    // VNPay can send query string or form body — merge both
    const merged = { ...(req.query as Record<string, string>), ...(payload || {}) };
    return this.paymentService.handleVnpayWebhook(merged);
  }

  @Public()
  @Post('bank-webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bank reconciliation webhook (Casso/Sepay)' })
  bankWebhook(
    @Body() payload: Record<string, any>,
    @Headers('x-webhook-secret') secret?: string,
    @Headers('authorization') auth?: string,
  ) {
    // Casso uses x-webhook-secret; Sepay uses Authorization: Apikey <key>
    const headerSecret =
      secret ?? (auth?.startsWith('Apikey ') ? auth.slice('Apikey '.length) : auth);
    return this.paymentService.handleBankWebhook(payload, headerSecret);
  }
}
