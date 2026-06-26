import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetHotDto {
  @ApiProperty({ example: true, description: 'true → đặt là Hot; false → bỏ Hot' })
  @IsBoolean()
  isHot: boolean;
}
