import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'rooms_10', description: 'Plan id (rooms_1 | rooms_5 | rooms_10 | rooms_20 | rooms_50 | enterprise)' })
  @IsString()
  planId: string;

  @ApiProperty({ example: 'yearly', enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly'])
  cycle: string;

  @ApiProperty({ example: 'bank_transfer', enum: ['bank_transfer'], description: 'Hiện chỉ hỗ trợ bank_transfer (VietQR + auto reconcile qua webhook Casso/Sepay)' })
  @IsIn(['bank_transfer'])
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
