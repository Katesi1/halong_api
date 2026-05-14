import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Đăng nhập bằng email HOẶC số điện thoại + password.
 *
 * - `identifier` (khuyến nghị): email hoặc SĐT VN.
 * - `email` (deprecated, backward-compat): tự động map sang `identifier` nếu FE cũ còn gửi.
 *
 * BE detect dạng nhập: regex `^0\d{9}$` hoặc `^\+84\d{9}$` ⇒ phone; còn lại coi là email.
 */
export class LoginDto {
  @ApiProperty({
    example: 'a@example.com',
    description:
      'Email hoặc số điện thoại VN (10 số bắt đầu 0, hoặc +84xxxxxxxxx). FE web có thể truyền email hoặc phone trong cùng field này.',
  })
  // Backward-compat: nếu FE gửi `email` hoặc `phone` thay vì `identifier`, BE vẫn nhận
  @Transform(({ value, obj }) => {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
    if (typeof obj?.email === 'string' && obj.email.trim() !== '') return obj.email.trim();
    if (typeof obj?.phone === 'string' && obj.phone.trim() !== '') return obj.phone.trim();
    return value;
  })
  @IsString({ message: 'Vui lòng nhập email hoặc số điện thoại' })
  @IsNotEmpty({ message: 'Vui lòng nhập email hoặc số điện thoại' })
  identifier: string;

  @ApiProperty({ example: 'Abcd@1234', description: 'Mật khẩu (tối thiểu 6 ký tự)' })
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password: string;
}
