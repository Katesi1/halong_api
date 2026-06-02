import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AppleS2SNotificationDto {
  @ApiProperty({
    description: 'JWS payload do Apple ký bằng cert chain (x5c trong header)',
  })
  @IsString()
  @IsNotEmpty()
  signedPayload!: string;
}
