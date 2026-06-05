import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class RenewPaymentDto {
  @ApiProperty({
    example: 'bank_transfer',
    enum: ['bank_transfer'],
    description: 'Hiện chỉ hỗ trợ bank_transfer',
  })
  @IsIn(['bank_transfer'])
  method: string;
}
