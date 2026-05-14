import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, MinLength, Matches } from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ example: 'HL-7K3F9X', description: 'Token đầy đủ (64 hex) hoặc short code (HL-XXXXXX)' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ enum: ['google', 'password'], description: 'Phương thức đăng ký' })
  @IsIn(['google', 'password'], { message: 'Phương thức đăng ký không hợp lệ' })
  method: 'google' | 'password';

  // Google method
  @ApiPropertyOptional({ description: 'Google ID token (bắt buộc nếu method=google)' })
  @IsOptional()
  @IsString()
  idToken?: string;

  // Password method
  @ApiPropertyOptional({ description: 'Mật khẩu (bắt buộc nếu method=password, ≥8 ký tự)' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Mật khẩu tối thiểu 8 ký tự' })
  password?: string;

  @ApiPropertyOptional({ description: 'Họ tên (bắt buộc nếu method=password)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại VN (10 số, bắt đầu 0)' })
  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;
}
