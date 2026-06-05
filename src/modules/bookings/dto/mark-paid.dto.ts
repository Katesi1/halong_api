import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive } from 'class-validator';

export class MarkBookingPaidDto {
  @ApiPropertyOptional({
    description:
      'Số tiền thực thu (VND). Bỏ trống → dùng totalAmount hoặc depositAmount của booking.',
    example: 1500000,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  amount?: number;
}
