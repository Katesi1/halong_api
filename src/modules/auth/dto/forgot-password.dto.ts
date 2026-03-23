import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: '0912345678', description: 'Số điện thoại hoặc email' })
  @IsString()
  @IsNotEmpty({ message: 'Thông tin xác thực không được để trống' })
  identifier: string;
}
