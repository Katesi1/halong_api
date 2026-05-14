import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token đặt lại mật khẩu (lấy từ link gửi qua email/SMS)' })
  @IsString({ message: 'Token không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp token đặt lại mật khẩu' })
  token: string;

  @ApiProperty({ example: 'MatKhauMoi123', description: 'Mật khẩu mới (tối thiểu 6 ký tự)' })
  @IsString({ message: 'Mật khẩu mới không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu mới' })
  @MinLength(6, { message: 'Mật khẩu mới tối thiểu 6 ký tự' })
  newPassword: string;
}
