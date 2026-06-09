import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GrantTrialDto {
  @ApiProperty({ enum: [30, 60, 90], example: 30, description: 'Số ngày trial — chỉ chấp nhận 30, 60 hoặc 90' })
  @IsInt()
  @IsIn([30, 60, 90])
  @Type(() => Number)
  days!: number;

  @ApiPropertyOptional({ example: 'rooms_5', description: 'Plan id (rooms_1 | rooms_5 | rooms_10 | rooms_20 | rooms_50 | enterprise). Bắt buộc nếu user chưa có subscription nào.' })
  @IsOptional()
  @IsString()
  planId?: string;

  @ApiPropertyOptional({ enum: ['monthly', 'yearly'], example: 'monthly' })
  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  cycle?: 'monthly' | 'yearly';

  @ApiPropertyOptional({ example: 1, description: 'Số phòng. Mặc định 1 hoặc giữ nguyên giá trị hiện tại.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  rooms?: number;

  @ApiPropertyOptional({ example: 'Khuyến mãi ra mắt', description: 'Lý do cấp (ghi log)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
