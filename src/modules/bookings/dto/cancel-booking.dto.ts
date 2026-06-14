import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelBookingDto {
  @ApiPropertyOptional({
    description:
      'Lý do huỷ (gửi cho khách qua email). Không lưu DB. Tối thiểu 10 ký tự nếu có gửi.',
    example: 'Chủ nhà có việc đột xuất, không thể nhận khách.',
  })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}
