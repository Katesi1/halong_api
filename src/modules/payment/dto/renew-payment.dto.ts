import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class RenewPaymentDto {
  @ApiProperty({
    example: 'vnpay_qr',
    enum: ['vnpay_qr', 'bank_transfer', 'card'],
  })
  @IsIn(['vnpay_qr', 'bank_transfer', 'card'])
  method: string;
}
