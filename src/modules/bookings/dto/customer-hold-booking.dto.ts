import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerHoldBookingDto {
  @ApiProperty({ description: 'ID phòng cần đặt' })
  @IsString()
  @IsNotEmpty({ message: 'roomId không được để trống' })
  roomId: string;

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

  @ApiPropertyOptional({ example: 'Nguyễn Văn A', description: 'Tên khách hàng' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ example: '0912345678', description: 'SĐT khách hàng' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Ghi chú' })
  @IsOptional()
  @IsString()
  notes?: string;
}
