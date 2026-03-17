import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'roomId không được để trống' })
  roomId: string;

  @ApiProperty({ example: '2025-03-20' })
  @IsDateString({}, { message: 'Ngày check-in không hợp lệ' })
  checkinDate: string;

  @ApiProperty({ example: '2025-03-22' })
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
  @IsString()
  notes?: string;
}
