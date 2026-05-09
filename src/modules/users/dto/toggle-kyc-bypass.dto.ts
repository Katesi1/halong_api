import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleKycBypassDto {
  @ApiProperty({ example: true, description: 'true = cấp quyền bỏ qua KYC, false = thu hồi' })
  @IsBoolean()
  bypass: boolean;
}
