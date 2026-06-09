import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, IsBoolean, IsEmail, Matches, IsDateString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0912345678', description: 'Số điện thoại VN (10 số bắt đầu 0)' })
  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại phải có 10 số và bắt đầu bằng số 0' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  @ApiPropertyOptional({ minLength: 6 })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password?: string;

  @ApiPropertyOptional({ example: 1, description: '0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER' })
  @IsOptional()
  @IsInt({ message: 'Vai trò phải là số nguyên' })
  @IsIn([0, 1, 2, 3], { message: 'Vai trò không hợp lệ' })
  @Type(() => Number)
  role?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive phải là boolean' })
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Giới tính: 0=Nam, 1=Nữ, 2=Khác' })
  @IsOptional()
  @IsInt({ message: 'Giới tính phải là số nguyên' })
  @IsIn([0, 1, 2], { message: 'Giới tính chỉ chấp nhận 0 (Nam), 1 (Nữ) hoặc 2 (Khác)' })
  @Type(() => Number)
  gender?: number;

  @ApiPropertyOptional({ description: 'Ngày sinh (YYYY-MM-DD)', example: '1990-01-15' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày sinh không đúng định dạng (YYYY-MM-DD)' })
  dateOfBirth?: string;
}
