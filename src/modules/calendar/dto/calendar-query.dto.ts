import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum } from 'class-validator';

export class CalendarGridQueryDto {
  @ApiProperty({ description: 'ID nhóm property' })
  @IsString()
  @IsNotEmpty()
  propertyGroupId: string;

  @ApiProperty({ description: 'Ngày bắt đầu (ISO)', example: '2026-04-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Ngày kết thúc (ISO)', example: '2026-04-30' })
  @IsDateString()
  endDate: string;
}

export class PropertyGroupQueryDto {
  @ApiPropertyOptional({ enum: ['VILLA', 'HOMESTAY', 'HOTEL', 'APARTMENT'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter theo chủ nhà' })
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class CalendarLockDto {
  @ApiProperty({ description: 'ID phòng' })
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @ApiProperty({ description: 'Ngày cần lock (YYYY-MM-DD)', example: '2026-04-20' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'Trạng thái cần lưu: HOLD (khoá tạm) hoặc BOOKED (đã bán). Mặc định: HOLD',
    enum: ['HOLD', 'BOOKED'],
    default: 'HOLD',
  })
  @IsOptional()
  @IsEnum(['HOLD', 'BOOKED'])
  status?: 'HOLD' | 'BOOKED';
}
