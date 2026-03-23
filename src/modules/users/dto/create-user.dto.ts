import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, IsEnum, IsOptional, IsEmail, Matches } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Tên không được để trống' })
  name: string;

  @ApiProperty({ example: '0900000000', description: 'SĐT định dạng 0xxxxxxxxx hoặc +84...' })
  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại không được để trống' })
  @Matches(/^(0|\+84)[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role, { message: 'Role không hợp lệ (ADMIN, STAFF, CUSTOMER)' })
  role: Role;
}
