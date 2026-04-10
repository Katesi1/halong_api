import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CalendarGridQueryDto {
  @ApiPropertyOptional({ description: 'ID property (nếu không truyền → lấy tất cả properties của user)' })
  @IsOptional()
  @IsString()
  propertyId?: string;

  @ApiProperty({ description: 'Ngày bắt đầu (YYYY-MM-DD)', example: '2026-04-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Ngày kết thúc (YYYY-MM-DD)', example: '2026-04-30' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: '0=VILLA, 1=HOMESTAY, 2=HOTEL' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  type?: number;
}

export class CalendarPropertyQueryDto {
  @ApiPropertyOptional({ description: '0=VILLA, 1=HOMESTAY, 2=HOTEL' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  type?: number;

  @ApiPropertyOptional({ description: 'Filter theo chủ nhà' })
  @IsOptional()
  @IsString()
  ownerId?: string;
}

export class CalendarLockDto {
  @ApiProperty({ description: 'ID property' })
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ description: 'Ngày cần lock (YYYY-MM-DD)', example: '2026-04-20' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: '0=LOCKED (chủ khoá), 1=BOOKED (đánh dấu đã bán). Mặc định: 0',
    example: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  status?: number;
}

export class CalendarUnlockDto {
  @ApiProperty({ description: 'ID property' })
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @ApiProperty({ description: 'Ngày cần unlock (YYYY-MM-DD)', example: '2026-04-20' })
  @IsDateString()
  date: string;
}
