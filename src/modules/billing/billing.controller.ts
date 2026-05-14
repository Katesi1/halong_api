import { Controller, Get } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { Public } from '../../common/decorators/public.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Billing')
@ApiHeader({
  name: 'Accept-Language',
  enum: ['en', 'vi'],
  required: false,
})
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Public()
  @Get('plans')
  @ApiOperation({ summary: 'Get billing plans (public)' })
  getPlans(@Lang() msg: Messages) {
    return this.billingService.getPlans(msg);
  }
}
