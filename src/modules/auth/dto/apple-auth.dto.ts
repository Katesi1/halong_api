import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class AppleAuthDto {
  @ApiProperty({ description: 'Apple ID Token (JWT)' })
  @IsString()
  @IsNotEmpty({ message: 'idToken không được để trống' })
  idToken: string;

  @ApiPropertyOptional({ example: 3, description: 'Role cho user mới: 1=OWNER, 3=CUSTOMER (0=ADMIN, 2=SALE bị reject)' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2, 3], { message: 'Role chỉ chấp nhận 0-3' })
  @Type(() => Number)
  role?: number;

  @ApiPropertyOptional({ description: 'Email — Apple chỉ trả lần đầu user authorize, FE phải cache + gửi kèm' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @ApiPropertyOptional({ description: 'Họ tên — Apple chỉ trả lần đầu' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Authorization code (optional, Apple revoke flow)' })
  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @ApiPropertyOptional({ enum: ['ios'], description: 'Platform (ios only — Android không cần Apple Sign-In)' })
  @IsOptional()
  @IsString()
  @IsIn(['ios'])
  platform?: 'ios';
}
