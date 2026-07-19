import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class HideYachtReviewDto {
  @ApiPropertyOptional({ description: 'Lý do ẩn (tuỳ chọn)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReplyYachtReviewDto {
  @ApiProperty({ description: 'Nội dung phản hồi của hệ thống' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reply: string;
}
