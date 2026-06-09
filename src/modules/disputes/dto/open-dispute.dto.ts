import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DISPUTE_TYPE } from '../../../common/constants';

export class OpenDisputeDto {
  @ApiProperty({ description: 'Booking liên quan' })
  @IsUUID()
  bookingId!: string;

  @ApiProperty({
    description: 'Loại tranh chấp',
    enum: Object.values(DISPUTE_TYPE),
  })
  @IsString()
  @IsIn(Object.values(DISPUTE_TYPE))
  type!: string;

  @ApiProperty({ description: 'Tiêu đề ngắn (>= 5 ký tự)' })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ description: 'Mô tả chi tiết (>= 10 ký tự)' })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @ApiPropertyOptional({ description: 'Số tiền tranh chấp (VND)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'URL ảnh đính kèm (tối đa 10)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}
