import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token nhận được từ API /auth/login hoặc /auth/refresh' })
  @IsString({ message: 'Refresh token không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng cung cấp refresh token' })
  refreshToken: string;
}
