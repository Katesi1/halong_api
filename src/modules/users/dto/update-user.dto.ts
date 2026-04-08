import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, IsBoolean, IsEmail, Matches, IsDateString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0900000000' })
  @IsOptional()
  @IsString()
  @Matches(/^(0|\+84)[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @ApiPropertyOptional({ minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password?: string;

  @ApiPropertyOptional({ example: 1, description: '0=ADMIN, 1=STAFF, 2=CUSTOMER' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2], { message: 'Role không hợp lệ' })
  @Type(() => Number)
  role?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '0=MALE, 1=FEMALE, 2=OTHER' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2], { message: 'Giới tính không hợp lệ' })
  @Type(() => Number)
  gender?: number;

  @ApiPropertyOptional({ description: 'Ngày sinh (YYYY-MM-DD)', example: '1990-01-15' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ' })
  dateOfBirth?: string;
}
