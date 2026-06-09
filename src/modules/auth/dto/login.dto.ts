import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, ValidateIf, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Đăng nhập bằng email HOẶC số điện thoại + password.
 *
 * - `identifier` (khuyến nghị): email hoặc SĐT VN.
 * - `email` / `phone` (deprecated, backward-compat): tự động map sang `identifier`
 *   nếu FE cũ còn gửi. Phải khai báo trong DTO để vượt qua `whitelist: true`.
 *
 * BE detect dạng nhập: regex `^0\d{9}$` hoặc `^\+84\d{9}$` ⇒ phone; còn lại coi là email.
 */
export class LoginDto {
  @ApiProperty({
    example: 'a@example.com',
    description:
      'Email hoặc số điện thoại VN (10 số bắt đầu 0, hoặc +84xxxxxxxxx). FE web có thể truyền email hoặc phone trong cùng field này.',
  })
  // Backward-compat: nếu FE gửi `email` hoặc `phone` thay vì `identifier`, tự map sang
  @Transform(({ value, obj }) => {
    const pick = (v: unknown): string | undefined =>
      typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
    return pick(value) ?? pick(obj?.email) ?? pick(obj?.phone) ?? value;
  })
  @ValidateIf((o) => !o.email && !o.phone) // nếu FE cũ chỉ gửi email/phone thì skip
  @IsString({ message: 'Vui lòng nhập email hoặc số điện thoại' })
  @IsNotEmpty({ message: 'Vui lòng nhập email hoặc số điện thoại' })
  identifier: string;

  @ApiProperty({ example: 'Abcd@1234', description: 'Mật khẩu (tối thiểu 6 ký tự)' })
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password: string;

  // ─── Backward-compat fields (deprecated — dùng `identifier` thay thế) ─────
  // Khai báo để whitelist không strip; service sẽ ưu tiên `identifier` rồi fallback.
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  phone?: string;
}
