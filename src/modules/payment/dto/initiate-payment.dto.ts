import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'professional' })
  @IsString()
  planId: string;

  @ApiProperty({ example: 'yearly', enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  cycle: string;

  @ApiProperty({ example: 'vnpay_qr', enum: ['vnpay_qr', 'bank_transfer', 'card'] })
  @IsIn(['vnpay_qr', 'bank_transfer', 'card'])
  method: string;

  @ApiProperty({ example: 15 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  rooms: number;

  @ApiProperty({ example: 35268000, description: 'Total amount in VND (including VAT)' })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  totalAmount: number;
}
