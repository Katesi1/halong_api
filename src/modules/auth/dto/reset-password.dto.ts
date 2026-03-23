import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token đặt lại mật khẩu' })
  @IsString()
  @IsNotEmpty({ message: 'Token không được để trống' })
  token: string;

  @ApiProperty({ example: 'matkhaumoi123', description: 'Mật khẩu mới (tối thiểu 6 ký tự)' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  newPassword: string;
}
