import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class CreateSystemInviteDto {
  @ApiProperty({
    example: 'ops@halong24h.com',
    description: 'Email người được mời làm SALE hệ thống. Sau khi accept sẽ tạo user role=SALE, scope=system, ownerId=null.',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;
}
