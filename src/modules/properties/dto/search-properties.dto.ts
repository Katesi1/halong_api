import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  PROPERTY_AMENITIES,
  PROPERTY_SORTS,
  PROPERTY_VIEWS,
} from '../property-enums';
import type {
  PropertyAmenity,
  PropertySort,
  PropertyView,
} from '../property-enums';

const splitCsv = (value: unknown): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

export class SearchPropertiesDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  checkinDate?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  checkoutDate?: string;

  @ApiPropertyOptional({ description: 'Số khách tối thiểu (so với maxGuests cả căn)', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;

  @ApiPropertyOptional({ description: 'Số người lớn tối thiểu (so với standardGuests)', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  adults?: number;

  @ApiPropertyOptional({ description: 'Số trẻ em tối thiểu (so với standardChildren)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children?: number;

  @ApiPropertyOptional({ description: 'Số phòng ngủ tối thiểu', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ description: 'Giá tối thiểu (VND/đêm)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Giá tối đa (VND/đêm)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: '0=VILLA, 1=HOMESTAY, 2=HOTEL' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  type?: number;

  @ApiPropertyOptional({ description: 'View', enum: PROPERTY_VIEWS })
  @IsOptional()
  @IsIn(PROPERTY_VIEWS as unknown as string[])
  view?: PropertyView;

  @ApiPropertyOptional({
    description: 'Danh sách amenity (CSV hoặc array). AND-match toàn bộ.',
    enum: PROPERTY_AMENITIES,
    isArray: true,
    example: 'wifi,pool,bbq',
  })
  @IsOptional()
  @Transform(({ value }) => splitCsv(value))
  @IsArray()
  @IsIn(PROPERTY_AMENITIES as unknown as string[], { each: true })
  amenities?: PropertyAmenity[];

  @ApiPropertyOptional({ description: 'Rating trung bình tối thiểu (0-5)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Từ khoá tìm trong name/code/address', example: 'villa' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Sắp xếp',
    enum: PROPERTY_SORTS,
    example: 'featured',
  })
  @IsOptional()
  @IsIn(PROPERTY_SORTS as unknown as string[])
  sort?: PropertySort;

  @ApiPropertyOptional({ description: 'Trang (>=1)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Item/trang (1-50)', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Khi true: chỉ trả property user hiện tại đã favorite. Yêu cầu Authorization header. Anonymous → 403.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  favorited?: boolean;

  @ApiPropertyOptional({
    description: 'Khi true: chỉ trả property admin đã set isHot.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  hot?: boolean;
}
