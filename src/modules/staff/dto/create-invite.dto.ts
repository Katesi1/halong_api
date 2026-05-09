import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({ example: 'nv1@gmail.com', description: 'Email của nhân viên muốn mời' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty()
  email: string;
}
