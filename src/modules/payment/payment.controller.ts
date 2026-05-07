import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

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
  @ApiOperation({ summary: 'Create payment session' })
  initiate(
    @CurrentUser() user: any,
    @Body() dto: InitiatePaymentDto,
    @Lang() msg: Messages,
  ) {
    return this.paymentService.initiate(user, dto, msg);
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
  @Post('webhooks/vnpay')
  @ApiOperation({ summary: 'VNPay IPN webhook (internal)' })
  async vnpayWebhook(@Body() payload: Record<string, string>) {
    return this.paymentService.handleVnpayWebhook(payload);
  }
}
