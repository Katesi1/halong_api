import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsOptional } from 'class-validator';

export class CreatePartnerBookingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'propertyId không được để trống' })
  propertyId: string;

  @ApiProperty({ example: '2026-04-20' })
  @IsDateString({}, { message: 'Ngày check-in không hợp lệ' })
  checkinDate: string;

  @ApiProperty({ example: '2026-04-22' })
  @IsDateString({}, { message: 'Ngày check-out không hợp lệ' })
  checkoutDate: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Tên khách hàng không được để trống' })
  customerName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Số điện thoại khách hàng không được để trống' })
  customerPhone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  partnerRef?: string;
}
