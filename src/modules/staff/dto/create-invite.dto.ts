import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateInviteDto {
  @ApiProperty({ example: 'nv1@gmail.com', description: 'Email của nhân viên muốn mời' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'ADMIN only: tạo invite thay mặt OWNER này (bắt buộc khi caller là ADMIN)' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
