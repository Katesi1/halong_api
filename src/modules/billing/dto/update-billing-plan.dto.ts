import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateBillingPlanDto } from './create-billing-plan.dto';

export class UpdateBillingPlanDto extends PartialType(
  OmitType(CreateBillingPlanDto, ['id'] as const),
) {}
