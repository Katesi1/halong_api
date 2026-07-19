import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Đặt du thuyền. Customer tự đặt: contact lấy từ profile nếu bỏ trống.
 * Staff (ADMIN/SALE hệ thống) đặt hộ: có thể truyền customerId (khách có tài khoản)
 * hoặc chỉ thông tin liên hệ (khách vãng lai).
 */
export class CreateYachtBookingDto {
  @ApiProperty({ example: 'uuid-yacht', description: 'ID du thuyền' })
  @IsString()
  yachtId: string;

  @ApiProperty({ example: '2026-08-10', description: 'Ngày bắt đầu (YYYY-MM-DD)' })
  @IsDateString()
  checkinDate: string;

  @ApiPropertyOptional({
    example: '2026-08-11',
    description: 'Ngày kết thúc (YYYY-MM-DD). BỎ TRỐNG cho tour trong ngày (ăn tối/tham quan) — BE tự lấy = ngày đi.',
  })
  @IsOptional()
  @IsDateString()
  checkoutDate?: string;

  @ApiProperty({ example: 2, description: 'Số người lớn' })
  @IsInt()
  @Min(1)
  adults: number;

  @ApiPropertyOptional({ example: 1, description: 'Số trẻ em' })
  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @ApiPropertyOptional({ example: 'khach@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Ghi chú thêm' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'CHỈ dùng cho staff đặt hộ — gắn đơn cho khách có tài khoản (customerId).',
  })
  @IsOptional()
  @IsString()
  customerId?: string;
}
