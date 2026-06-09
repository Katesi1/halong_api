import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, MaxLength, Matches, IsOptional, IsEmail, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ tên (2-100 ký tự)' })
  @IsString({ message: 'Họ tên không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  @MinLength(2, { message: 'Họ tên tối thiểu 2 ký tự' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  name: string;

  @ApiProperty({ example: 'a@example.com', description: 'Email (bắt buộc, duy nhất)' })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsNotEmpty({ message: 'Vui lòng nhập email' })
  email: string;

  @ApiProperty({ example: 'matkhau123', description: 'Mật khẩu (tối thiểu 6 ký tự)' })
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password: string;

  @ApiProperty({ example: 3, description: 'Vai trò: 1=OWNER (chủ homestay), 3=CUSTOMER (khách). SALE phải qua invite.' })
  @IsInt({ message: 'Vai trò phải là số nguyên' })
  @IsIn([1, 3], { message: 'Vai trò chỉ chấp nhận 1 (OWNER) hoặc 3 (CUSTOMER) — SALE phải qua invite' })
  @Type(() => Number)
  role: number;

  @ApiPropertyOptional({ example: '0912345678', description: 'Số điện thoại VN (10 số bắt đầu 0)' })
  @IsOptional()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại phải có 10 số và bắt đầu bằng số 0' })
  phone?: string;
}
