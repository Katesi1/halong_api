import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, Matches, IsOptional, IsEmail, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

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

  @ApiProperty({ example: 2, description: 'Role: 1=STAFF, 2=CUSTOMER' })
  @IsInt()
  @IsIn([1, 2], { message: 'Role chỉ chấp nhận 1 (STAFF) hoặc 2 (CUSTOMER)' })
  @Type(() => Number)
  role: number;

  @ApiPropertyOptional({ example: 'a@example.com', description: 'Email (optional)' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;
}
