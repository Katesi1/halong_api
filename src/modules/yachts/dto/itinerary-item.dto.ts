import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Một chặng trong hành trình du thuyền. */
export class ItineraryItemDto {
  @ApiProperty({ example: 1, description: 'Thứ tự chặng (1,2,3...)' })
  @IsInt()
  @Min(0)
  order: number;

  @ApiProperty({ example: 'Đón khách tại Cảng Tuần Châu' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: '08:00', description: 'Mốc thời gian (tuỳ chọn)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  time?: string;

  @ApiPropertyOptional({ example: 'Làm thủ tục lên tàu, ăn nhẹ chào mừng.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
