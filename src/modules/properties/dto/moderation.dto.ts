import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RejectPropertyDto {
  @ApiProperty({ description: 'Lý do từ chối (>= 5 ký tự)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason!: string;
}

export class SuspendPropertyDto {
  @ApiPropertyOptional({ description: 'Lý do tạm ngưng (tùy chọn)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
