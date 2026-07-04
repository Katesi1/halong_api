import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, IsInt, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Tiền cọc (VND, integer) — nếu gửi thì không được null' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsInt({ message: 'Tiền cọc phải là số nguyên, không được null' })
  @Min(0, { message: 'Tiền cọc phải >= 0' })
  @Type(() => Number)
  depositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  guestCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
