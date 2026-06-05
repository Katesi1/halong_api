import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateLeadDto {
  @ApiPropertyOptional({ description: 'Cơ sở quan tâm (nếu khách click từ trang property)' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiProperty({ description: 'Tên khách' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  guestName!: string;

  @ApiProperty({ description: 'Số điện thoại VN (10 số bắt đầu 0)' })
  @Matches(/^0\d{9}$/, { message: 'Số điện thoại không hợp lệ (phải có 10 số, bắt đầu bằng 0)' })
  guestPhone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  numGuests?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({ description: 'Nguồn lead (public_form | landing_page | partner)' })
  @IsOptional()
  @IsString()
  source?: string;
}
