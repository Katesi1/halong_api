import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID Token (lấy từ Google Identity Services / OAuth popup)' })
  @IsString({ message: 'Google ID token không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp Google ID token' })
  idToken: string;

  @ApiPropertyOptional({
    example: 3,
    description:
      'Vai trò cho user mới: 1=OWNER, 3=CUSTOMER. Có thể bỏ trống khi đăng nhập lại tài khoản đã tồn tại. ADMIN/SALE không hỗ trợ qua Google.',
  })
  @IsOptional()
  @IsInt({ message: 'Vai trò phải là số nguyên' })
  @IsIn([0, 1, 2, 3], { message: 'Vai trò không hợp lệ' })
  @Type(() => Number)
  role?: number;
}
