import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppleIapService } from './apple-iap.service';
import { VerifyAppleReceiptDto } from './dto/verify-receipt.dto';
import { AppleS2SNotificationDto } from './dto/s2s-notification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Apple IAP')
@Controller()
export class AppleIapController {
  constructor(private appleIap: AppleIapService) {}

  @Post('payments/apple/verify')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Verify Apple IAP receipt và activate subscription' })
  verify(
    @CurrentUser() user: any,
    @Body() dto: VerifyAppleReceiptDto,
    @Lang() msg: Messages,
  ) {
    return this.appleIap.verifyReceipt(user, dto.productId, dto.purchaseId, msg);
  }

  @Public()
  @Post('webhooks/apple/s2s-notifications')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apple Server-to-Server Notification V2 webhook' })
  s2sWebhook(@Body() dto: AppleS2SNotificationDto) {
    return this.appleIap.handleS2SNotification(dto.signedPayload);
  }
}
