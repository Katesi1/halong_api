import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: '0912345678',
    description: 'Email hoặc số điện thoại VN đã đăng ký',
  })
  @IsString({ message: 'Email hoặc số điện thoại không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập email hoặc số điện thoại' })
  identifier: string;
}
