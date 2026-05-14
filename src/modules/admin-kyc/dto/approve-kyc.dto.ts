import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ApproveKycDto {
  @ApiPropertyOptional({ example: 7, description: 'Trial days (default 7)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  @Type(() => Number)
  trialDays?: number;
}
