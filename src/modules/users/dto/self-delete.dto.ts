import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SelfDeleteDto {
  @ApiPropertyOptional({ description: 'Lý do xoá tài khoản (optional, để analytics)' })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Lý do tối đa 200 ký tự' })
  reason?: string;
}
