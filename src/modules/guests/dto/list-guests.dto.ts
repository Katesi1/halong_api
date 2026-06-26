import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ListGuestsDto {
  @ApiPropertyOptional({ description: 'Search theo name / phone / email', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Filter theo nhãn', enum: ['vip', 'regular', 'new', 'restricted'] })
  @IsOptional()
  @IsString()
  label?: 'vip' | 'regular' | 'new' | 'restricted';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
