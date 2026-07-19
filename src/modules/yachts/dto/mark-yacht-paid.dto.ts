import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsPositive, IsOptional, ValidateIf } from 'class-validator';

/**
 * Ghi nhận thanh toán FULL đơn du thuyền. Bỏ trống amount → dùng totalAmount của đơn.
 * amount nếu truyền phải là số nguyên dương (VND).
 */
export class MarkYachtPaidDto {
  @ApiPropertyOptional({ example: 6000000, description: 'Số tiền thực thu (VND). Bỏ trống = totalAmount.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined)
  @IsInt()
  @IsPositive()
  amount?: number;
}
