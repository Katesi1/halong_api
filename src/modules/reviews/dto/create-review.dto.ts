import { IsInt, IsString, IsOptional, IsArray, Min, Max, IsUUID, MaxLength, ArrayMaxSize, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * 6 tiêu chí đánh giá, mỗi tiêu chí 1-5.
 * BE tự tính avgRating = trung bình 6 tiêu chí.
 */
export class CreateReviewDto {
  @ApiProperty({ description: 'UUID của booking đã COMPLETED tương ứng' })
  @IsUUID('all', { message: 'bookingId không đúng định dạng UUID' })
  bookingId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Mức độ sạch sẽ' })
  @IsInt({ message: 'Điểm sạch sẽ phải là số nguyên' })
  @Min(1, { message: 'Điểm sạch sẽ tối thiểu là 1' })
  @Max(5, { message: 'Điểm sạch sẽ tối đa là 5' })
  @Type(() => Number)
  cleanliness: number;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5, description: 'Vị trí' })
  @IsInt({ message: 'Điểm vị trí phải là số nguyên' })
  @Min(1, { message: 'Điểm vị trí tối thiểu là 1' })
  @Max(5, { message: 'Điểm vị trí tối đa là 5' })
  @Type(() => Number)
  location: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Tiện nghi' })
  @IsInt({ message: 'Điểm tiện nghi phải là số nguyên' })
  @Min(1, { message: 'Điểm tiện nghi tối thiểu là 1' })
  @Max(5, { message: 'Điểm tiện nghi tối đa là 5' })
  @Type(() => Number)
  amenities: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Dịch vụ' })
  @IsInt({ message: 'Điểm dịch vụ phải là số nguyên' })
  @Min(1, { message: 'Điểm dịch vụ tối thiểu là 1' })
  @Max(5, { message: 'Điểm dịch vụ tối đa là 5' })
  @Type(() => Number)
  service: number;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5, description: 'Đáng giá tiền' })
  @IsInt({ message: 'Điểm đáng giá tiền phải là số nguyên' })
  @Min(1, { message: 'Điểm đáng giá tiền tối thiểu là 1' })
  @Max(5, { message: 'Điểm đáng giá tiền tối đa là 5' })
  @Type(() => Number)
  value: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Đúng mô tả' })
  @IsInt({ message: 'Điểm đúng mô tả phải là số nguyên' })
  @Min(1, { message: 'Điểm đúng mô tả tối thiểu là 1' })
  @Max(5, { message: 'Điểm đúng mô tả tối đa là 5' })
  @Type(() => Number)
  accuracy: number;

  @ApiPropertyOptional({ example: 'Phòng sạch sẽ, view biển tuyệt vời...', description: 'Bình luận (tối đa 1000 ký tự)' })
  @IsOptional()
  @IsString({ message: 'Bình luận không hợp lệ' })
  @MaxLength(1000, { message: 'Bình luận tối đa 1000 ký tự' })
  comment?: string;

  @ApiPropertyOptional({
    example: ['https://res.cloudinary.com/.../photo1.jpg'],
    description: 'Mảng URL ảnh đã upload Cloudinary (tối đa 10 ảnh)',
  })
  @IsOptional()
  @IsArray({ message: 'Photos phải là mảng URL' })
  @ArrayMaxSize(10, { message: 'Tối đa 10 ảnh mỗi review' })
  @IsUrl({}, { each: true, message: 'Mỗi photo phải là URL hợp lệ' })
  photos?: string[];
}
