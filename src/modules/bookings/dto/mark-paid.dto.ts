import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsPositive, ValidateIf } from 'class-validator';

export class MarkBookingPaidDto {
  @ApiPropertyOptional({
    description:
      'Số tiền thực thu (VND). Bỏ trống (omit) → dùng totalAmount hoặc depositAmount của booking. Không được gửi null.',
    example: 1500000,
  })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt({ message: 'Số tiền phải là số nguyên, không được null' })
  @IsPositive({ message: 'Số tiền phải > 0' })
  amount?: number;
}
