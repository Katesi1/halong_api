import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength, IsBoolean, IsEmail, Matches, IsDateString, IsInt, IsIn } from 'class-validator';
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

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/v1/avatars/abc.jpg',
    description: 'URL ảnh đại diện (upload trước qua POST /uploads rồi gửi URL https trả về)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'URL ảnh đại diện tối đa 1000 ký tự' })
  @Matches(/^https:\/\/.+/, { message: 'Ảnh đại diện phải là URL https hợp lệ' })
  avatar?: string;

  // ─── Thông tin nhận tiền (OWNER) — dùng để sinh VietQR cho khách chuyển cọc ───
  @ApiPropertyOptional({ example: '970436', description: 'Mã BIN ngân hàng (NAPAS, 6 số). VD 970436 = Vietcombank' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã BIN ngân hàng phải gồm đúng 6 chữ số' })
  bankBin?: string;

  @ApiPropertyOptional({ example: 'Vietcombank', description: 'Tên hiển thị ngân hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tên ngân hàng tối đa 100 ký tự' })
  bankName?: string;

  @ApiPropertyOptional({ example: '0123456789', description: 'Số tài khoản nhận tiền (6–20 chữ số)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6,20}$/, { message: 'Số tài khoản phải gồm 6–20 chữ số' })
  bankAccountNumber?: string;

  @ApiPropertyOptional({ example: 'NGUYEN VAN A', description: 'Tên chủ tài khoản' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tên chủ tài khoản tối đa 100 ký tự' })
  bankAccountName?: string;
}
