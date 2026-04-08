import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerHoldBookingDto {
  @ApiProperty({ description: 'ID property cần đặt' })
  @IsString()
  @IsNotEmpty({ message: 'propertyId không được để trống' })
  propertyId: string;

  @ApiProperty({ example: '2026-04-01', description: 'Ngày check-in (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'Ngày check-in không hợp lệ' })
  checkinDate: string;

  @ApiProperty({ example: '2026-04-03', description: 'Ngày check-out (YYYY-MM-DD)' })
  @IsDateString({}, { message: 'Ngày check-out không hợp lệ' })
  checkoutDate: string;

  @ApiPropertyOptional({ example: 2, description: 'Số khách' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  guestCount?: number;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsOptional()
  @IsString()
  notes?: string;
}
