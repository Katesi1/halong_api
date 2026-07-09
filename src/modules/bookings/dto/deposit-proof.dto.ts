import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class DepositProofDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/xxx/image/upload/v1/bookings/proof.jpg',
    description: 'URL ảnh bill chuyển khoản (https). Khách upload qua POST /uploads trước, lấy URL gửi vào đây.',
  })
  @IsString()
  @MaxLength(1000)
  @Matches(/^https:\/\/.+/, { message: 'proofUrl phải là URL https hợp lệ' })
  proofUrl!: string;
}
