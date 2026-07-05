import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

/** ADMIN từ chối yêu cầu duyệt tài khoản nhận tiền (POST /admin/users/:id/bank/reject). */
export class RejectBankDto {
  @ApiProperty({ example: 'Số tài khoản không khớp tên chủ tài khoản', description: 'Lý do từ chối (5–500 ký tự)' })
  @IsString()
  @MinLength(5, { message: 'Lý do từ chối tối thiểu 5 ký tự' })
  @MaxLength(500, { message: 'Lý do từ chối tối đa 500 ký tự' })
  reason: string;
}
