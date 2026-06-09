import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, IsEmail, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AppleAuthDto {
  @ApiProperty({ description: 'Apple ID Token (JWT) — lấy từ Sign in with Apple SDK' })
  @IsString({ message: 'Apple ID token không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp Apple ID token' })
  idToken: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Vai trò cho user mới: 1=OWNER, 3=CUSTOMER. ADMIN/SALE không hỗ trợ qua Apple.',
  })
  @IsOptional()
  @IsInt({ message: 'Vai trò phải là số nguyên' })
  @IsIn([0, 1, 2, 3], { message: 'Vai trò không hợp lệ' })
  @Type(() => Number)
  role?: number;

  @ApiPropertyOptional({
    description: 'Email — Apple chỉ trả lần đầu user authorize; FE phải cache và gửi kèm các lần sau',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  @ApiPropertyOptional({ description: 'Họ tên — Apple chỉ trả lần đầu user authorize' })
  @IsOptional()
  @IsString({ message: 'Họ tên không hợp lệ' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  name?: string;

  @ApiPropertyOptional({ description: 'Authorization code (optional, dùng cho Apple revoke flow)' })
  @IsOptional()
  @IsString({ message: 'Authorization code không hợp lệ' })
  authorizationCode?: string;

  @ApiPropertyOptional({ enum: ['ios'], description: 'Platform — hiện chỉ hỗ trợ iOS' })
  @IsOptional()
  @IsString()
  @IsIn(['ios'], { message: 'Apple Sign-In hiện chỉ hỗ trợ iOS' })
  platform?: 'ios';
}
