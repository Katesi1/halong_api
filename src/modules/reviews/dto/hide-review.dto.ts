import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class HideReviewDto {
  @ApiPropertyOptional({ example: 'Noi dung khong phu hop' })
  @IsOptional()
  @IsString()
  reason?: string;
}
