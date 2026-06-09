import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class QuotePaymentDto {
  @ApiProperty({ example: 'rooms_10' })
  @IsString()
  planId: string;

  @ApiProperty({ example: 'monthly', enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  cycle: string;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  rooms?: number;
}
