import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, Matches, IsOptional, IsEmail, IsIn } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ tên (2-100 ký tự)' })
  @IsString()
  @IsNotEmpty({ message: 'Tên không được để trống' })
  @MinLength(2, { message: 'Tên tối thiểu 2 ký tự' })
  @MaxLength(100, { message: 'Tên tối đa 100 ký tự' })
  name: string;

  @ApiProperty({ example: '0912345678', description: 'Số điện thoại (10-11 số, bắt đầu bằng 0)' })
  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^0\d{9,10}$/, { message: 'Số điện thoại phải 10-11 số và bắt đầu bằng 0' })
  phone: string;

  @ApiProperty({ example: 'matkhau123', description: 'Mật khẩu (tối thiểu 6 ký tự)' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password: string;

  @ApiProperty({ example: 'CUSTOMER', description: 'Role: STAFF hoặc CUSTOMER', enum: ['STAFF', 'CUSTOMER'] })
  @IsString()
  @IsNotEmpty({ message: 'Role không được để trống' })
  @IsIn(['STAFF', 'CUSTOMER'], { message: 'Role chỉ chấp nhận STAFF hoặc CUSTOMER' })
  role: 'STAFF' | 'CUSTOMER';

  @ApiPropertyOptional({ example: 'a@example.com', description: 'Email (optional)' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;
}
