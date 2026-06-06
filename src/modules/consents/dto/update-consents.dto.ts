import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateConsentsDto {
  @ApiProperty({ description: 'Đồng ý nhận thông tin marketing' })
  @IsBoolean()
  marketing!: boolean;
}
