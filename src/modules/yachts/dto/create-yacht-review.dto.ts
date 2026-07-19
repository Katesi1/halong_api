import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Đánh giá du thuyền — 6 tiêu chí 1-5 (giống PropertyReview để FE tái dùng component).
 * Chỉ đánh giá được sau khi qua ngày kết thúc hành trình + đã thanh toán + chưa đánh giá.
 */
export class CreateYachtReviewDto {
  @ApiProperty({ description: 'ID đơn đặt du thuyền (đã PAID/COMPLETED, đã qua ngày kết thúc)' })
  @IsString()
  bookingId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  cleanliness: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Cảnh quan/hành trình' })
  @IsInt() @Min(1) @Max(5)
  location: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Tiện nghi trên tàu' })
  @IsInt() @Min(1) @Max(5)
  amenities: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  service: number;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5, description: 'Đáng giá tiền' })
  @IsInt() @Min(1) @Max(5)
  value: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Đúng như mô tả' })
  @IsInt() @Min(1) @Max(5)
  accuracy: number;

  @ApiPropertyOptional({ example: 'Chuyến đi tuyệt vời, đồ ăn ngon.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ type: [String], description: 'URL ảnh (đã upload qua /uploads)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  photos?: string[];
}
