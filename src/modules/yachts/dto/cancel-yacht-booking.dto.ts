import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelYachtBookingDto {
  @ApiPropertyOptional({ description: 'Lý do huỷ (tuỳ chọn, pass-through email)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
