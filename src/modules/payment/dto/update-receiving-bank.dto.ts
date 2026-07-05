import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

/**
 * ADMIN cập nhật STK nhận tiền MUA GÓI (subscription) — PUT /admin/payments/receiving-bank.
 * Ghi thẳng vào bảng singleton payment_bank_account (không cần duyệt — đây là tài khoản của platform).
 * bankBin/accountNumber/accountName bắt buộc (đủ để sinh VietQR); bankName optional (display).
 */
export class UpdateReceivingBankDto {
  @ApiProperty({ example: '970416', description: 'Mã BIN ngân hàng (NAPAS, 6 số). VD 970416 = ACB' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã BIN ngân hàng phải gồm đúng 6 chữ số' })
  bankBin: string;

  @ApiPropertyOptional({ example: 'ACB', description: 'Tên hiển thị ngân hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tên ngân hàng tối đa 100 ký tự' })
  bankName?: string;

  @ApiProperty({ example: '21169431', description: 'Số tài khoản nhận tiền (6–20 chữ số)' })
  @IsString()
  @Matches(/^\d{6,20}$/, { message: 'Số tài khoản phải gồm 6–20 chữ số' })
  bankAccountNumber: string;

  @ApiProperty({ example: 'NGUYEN VU NAM', description: 'Tên chủ tài khoản' })
  @IsString()
  @MaxLength(100, { message: 'Tên chủ tài khoản tối đa 100 ký tự' })
  bankAccountName: string;
}
