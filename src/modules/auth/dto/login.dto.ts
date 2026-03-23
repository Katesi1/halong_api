import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '0912345678', description: 'Số điện thoại hoặc email' })
  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại hoặc email không được để trống' })
  phone: string;

  @ApiProperty({ example: 'Abcd@1234', description: 'Mật khẩu (tối thiểu 6 ký tự)' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password: string;
}
