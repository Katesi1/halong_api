import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

export class MarkPaidDto {
  @ApiProperty({ description: 'Amount actually received (VND)', example: 1500000 })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({
    description: 'Number of days to extend from now / current expiry. Default: 30 (monthly) / 365 (yearly).',
    example: 30,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;

  @ApiPropertyOptional({ description: 'Optional plan override (must exist in BillingPlan)' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ description: 'monthly | yearly — defaults to current cycle' })
  @IsOptional()
  @IsString()
  cycle?: 'monthly' | 'yearly';

  @ApiPropertyOptional({ description: 'Room count for this subscription period' })
  @IsOptional()
  @IsInt()
  @Min(1)
  rooms?: number;

  @ApiPropertyOptional({ description: 'Reference / receipt code (e.g. bank txn id)' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Admin note' })
  @IsOptional()
  @IsString()
  note?: string;
}
