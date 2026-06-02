import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyAppleReceiptDto {
  @ApiProperty({
    example: 'com.halong24h.sub.rooms10_monthly',
    description: 'Apple product ID (com.halong24h.sub.<plan>_<cycle>)',
  })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({
    example: '2000000451234567',
    description: 'Apple originalTransactionId (idempotency key)',
  })
  @IsString()
  @IsNotEmpty()
  purchaseId!: string;

  @ApiProperty({
    description: 'Optional base64 receipt từ StoreKit (legacy). Backend ưu tiên dùng purchaseId.',
    required: false,
  })
  @IsString()
  receiptData?: string;
}
