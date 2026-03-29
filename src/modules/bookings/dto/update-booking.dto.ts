import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus } from '@prisma/client';

export class UpdateBookingDto {
  @ApiPropertyOptional({ example: '2026-04-20', description: 'Ngày check-in (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  checkinDate?: string;

  @ApiPropertyOptional({ example: '2026-04-22', description: 'Ngày check-out (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  checkoutDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  depositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: BookingStatus, description: 'HOLD / CONFIRMED / CANCELLED / COMPLETED' })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
