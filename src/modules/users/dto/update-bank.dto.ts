import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';

/**
 * OWNER gửi thông tin nhận tiền để ADMIN duyệt (PUT /users/me/bank).
 * Không ghi thẳng vào bank* live — chỉ set pendingBank* + bankStatus='pending'.
 * bankBin/accountNumber/accountName bắt buộc (cần đủ để sinh VietQR); bankName optional (display).
 */
export class UpdateBankDto {
  @ApiProperty({ example: '970436', description: 'Mã BIN ngân hàng (NAPAS, 6 số). VD 970436 = Vietcombank' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã BIN ngân hàng phải gồm đúng 6 chữ số' })
  bankBin: string;

  @ApiPropertyOptional({ example: 'Vietcombank', description: 'Tên hiển thị ngân hàng' })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Tên ngân hàng tối đa 100 ký tự' })
  bankName?: string;

  @ApiProperty({ example: '0123456789', description: 'Số tài khoản nhận tiền (6–20 chữ số)' })
  @IsString()
  @Matches(/^\d{6,20}$/, { message: 'Số tài khoản phải gồm 6–20 chữ số' })
  bankAccountNumber: string;

  @ApiProperty({ example: 'NGUYEN VAN A', description: 'Tên chủ tài khoản' })
  @IsString()
  @MaxLength(100, { message: 'Tên chủ tài khoản tối đa 100 ký tự' })
  bankAccountName: string;
}
