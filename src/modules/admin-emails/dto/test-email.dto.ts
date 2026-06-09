import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString } from 'class-validator';
import { EMAIL_TEMPLATE_KEYS } from '../../email/email.service';

export class TestEmailDto {
  @ApiProperty({ enum: EMAIL_TEMPLATE_KEYS, description: 'Template key — see GET /admin/emails/templates' })
  @IsString()
  @IsIn([...EMAIL_TEMPLATE_KEYS])
  template!: string;

  @ApiProperty({ description: 'Email người nhận (admin tự nhập email của mình để verify)' })
  @IsEmail()
  to!: string;
}
