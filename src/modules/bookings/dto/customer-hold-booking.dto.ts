import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
  IsUUID,
  IsEmail,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerHoldBookingDto {
  @ApiProperty({ description: 'UUID của property cần đặt' })
  @IsUUID('all', { message: 'propertyId không đúng định dạng UUID' })
  @IsNotEmpty({ message: 'Vui lòng chọn cơ sở cần đặt' })
  propertyId: string;

  @ApiProperty({ example: '2026-06-01', description: 'Ngày nhận phòng (YYYY-MM-DD), phải >= hôm nay' })
  @IsDateString({}, { message: 'Ngày nhận phòng không đúng định dạng (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngày nhận phòng' })
  checkinDate: string;

  @ApiProperty({ example: '2026-06-03', description: 'Ngày trả phòng (YYYY-MM-DD), phải > ngày nhận phòng' })
  @IsDateString({}, { message: 'Ngày trả phòng không đúng định dạng (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'Vui lòng chọn ngày trả phòng' })
  checkoutDate: string;

  // ─── Thông tin liên hệ khách (bắt buộc để đảm bảo đủ thông tin booking) ───
  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ tên người liên hệ (bắt buộc)' })
  @IsString({ message: 'Họ tên không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  @MaxLength(100, { message: 'Họ tên tối đa 100 ký tự' })
  customerName: string;

  @ApiProperty({ example: '0901234567', description: 'Số điện thoại liên hệ (bắt buộc)' })
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @IsNotEmpty({ message: 'Vui lòng nhập số điện thoại' })
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0' })
  customerPhone: string;

  @ApiPropertyOptional({ example: 'khach@example.com', description: 'Email liên hệ (tuỳ chọn)' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(150, { message: 'Email tối đa 150 ký tự' })
  customerEmail?: string;

  // ─── Số khách: tách người lớn / trẻ em (6–11 tuổi) ───
  @ApiPropertyOptional({ example: 2, description: 'Số người lớn (>= 1)' })
  @IsOptional()
  @IsInt({ message: 'Số người lớn phải là số nguyên' })
  @Min(1, { message: 'Cần ít nhất 1 người lớn' })
  @Type(() => Number)
  adults?: number;

  @ApiPropertyOptional({ example: 0, description: 'Số trẻ em 6–11 tuổi (>= 0)' })
  @IsOptional()
  @IsInt({ message: 'Số trẻ em phải là số nguyên' })
  @Min(0, { message: 'Số trẻ em không hợp lệ' })
  @Type(() => Number)
  children?: number;

  @ApiPropertyOptional({ example: 2, description: 'Tổng số khách (legacy). Nếu gửi adults/children thì BE tự tính tổng = adults + children.' })
  @IsOptional()
  @IsInt({ message: 'Số khách phải là số nguyên' })
  @Min(1, { message: 'Số khách tối thiểu là 1' })
  @Type(() => Number)
  guestCount?: number;

  @ApiPropertyOptional({ description: 'Yêu cầu đặc biệt / ghi chú cho chủ nhà (tối đa 500 ký tự)' })
  @IsOptional()
  @IsString({ message: 'Ghi chú không hợp lệ' })
  @MaxLength(500, { message: 'Ghi chú tối đa 500 ký tự' })
  notes?: string;
}
