import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/**
 * Body cho PATCH /auth/profile — user tự sửa thông tin cá nhân.
 * Whitelist 3 field. KHÔNG cho sửa role/isActive/password qua endpoint này.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'Họ tên hiển thị' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  fullName?: string;

  @ApiPropertyOptional({ description: 'Email mới' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  @ApiPropertyOptional({ example: '0912345678', description: 'Số điện thoại VN (10 số bắt đầu 0)' })
  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại phải có 10 số và bắt đầu bằng số 0' })
  phone?: string;
}
