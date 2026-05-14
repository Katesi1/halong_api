import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsOptional, IsInt, Min, MaxLength, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerHoldBookingDto {
  @ApiProperty({ description: 'UUID của property cần đặt' })
  @IsUUID('all', { message: 'propertyId không đúng định dạng UUID' })
  @IsNotEmpty({ message: 'Vui lòng chọn cơ sở cần đặt' })
  propertyId: string;

  @ApiProperty({ example: '2026-06-01', description: 'Ngày nhận phòng (YYYY-MM-DD), phải >= hôm nay' })
  @IsDateString({}, { message: 'Ngày nhận phòng không đúng định dạng (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngày nhận phòng' })
  checkinDate: string;

  @ApiProperty({ example: '2026-06-03', description: 'Ngày trả phòng (YYYY-MM-DD), phải > ngày nhận phòng' })
  @IsDateString({}, { message: 'Ngày trả phòng không đúng định dạng (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngày trả phòng' })
  checkoutDate: string;

  @ApiPropertyOptional({ example: 2, description: 'Số khách (>= 1, <= maxGuests của property)' })
  @IsOptional()
  @IsInt({ message: 'Số khách phải là số nguyên' })
  @Min(1, { message: 'Số khách tối thiểu là 1' })
  @Type(() => Number)
  guestCount?: number;

  @ApiPropertyOptional({ description: 'Ghi chú cho chủ nhà (tối đa 500 ký tự)' })
  @IsOptional()
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  notes?: string;
}
