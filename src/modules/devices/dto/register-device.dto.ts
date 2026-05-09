import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM registration token từ Firebase SDK' })
  @IsString()
  @IsNotEmpty({ message: 'fcmToken không được để trống' })
  fcmToken: string;

  @ApiProperty({ enum: ['ios', 'android'], description: 'Platform của thiết bị' })
  @IsString()
  @IsIn(['ios', 'android'], { message: 'Platform chỉ chấp nhận ios hoặc android' })
  platform: 'ios' | 'android';

  @ApiPropertyOptional({ example: 'iPhone 13' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceModel?: string;

  @ApiPropertyOptional({ example: '17.4' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  osVersion?: string;

  @ApiPropertyOptional({ example: '1.0.2' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;

  @ApiPropertyOptional({ enum: ['vi', 'en'], description: 'Locale của user' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}
