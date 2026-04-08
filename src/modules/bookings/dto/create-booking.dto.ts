import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsOptional, IsNumber, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookingDto {
  @ApiProperty({ description: 'ID property cần đặt' })
  @IsString()
  @IsNotEmpty({ message: 'propertyId không được để trống' })
  propertyId: string;

  @ApiProperty({ example: '2026-04-20' })
  @IsDateString({}, { message: 'Ngày check-in không hợp lệ' })
  checkinDate: string;

  @ApiProperty({ example: '2026-04-22' })
  @IsDateString({}, { message: 'Ngày check-out không hợp lệ' })
  checkoutDate: string;

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
  @IsInt()
  @Min(1)
  @Type(() => Number)
  guestCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
