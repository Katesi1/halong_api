import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsOptional, IsNumber, IsInt,
  IsArray, IsIn, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PROPERTY_VIEWS } from '../property-enums';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Villa B1716' })
  @IsString()
  @IsNotEmpty({ message: 'Tên không được để trống' })
  name: string;

  @ApiProperty({ example: 0, description: '0=VILLA, 1=HOMESTAY, 2=HOTEL' })
  @IsInt()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  type: number;

  @ApiProperty({ example: 'B1716' })
  @IsString()
  @IsNotEmpty({ message: 'Mã không được để trống' })
  code: string;

  @ApiPropertyOptional({
    example: 'sea',
    description: 'View loại: sea | city | mountain | garden | pool',
    enum: PROPERTY_VIEWS,
  })
  @IsOptional()
  @IsIn(PROPERTY_VIEWS as unknown as string[])
  view?: string;

  @ApiPropertyOptional({ example: 'Bãi Cháy, Hạ Long', description: 'Địa chỉ đầy đủ (free-text)' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Hạ Long', description: 'Thành phố — display only, không dùng để filter' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Bãi Cháy', description: 'Quận/Phường — display only' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 45, description: 'Diện tích sàn (m²) — optional, để trống thì card hiển thị null' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  floorArea?: number;

  @ApiPropertyOptional({ example: 'https://maps.google.com/...' })
  @IsOptional()
  @IsString()
  mapLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  bedrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  bathrooms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  standardGuests?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxGuests?: number;

  @ApiPropertyOptional({ example: ['Wifi', 'Điều hòa', 'Bể bơi'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ example: 'Mô tả villa...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Không hút thuốc' })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional({ example: ['Thuê xe máy', 'Nướng BBQ'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @ApiPropertyOptional({ example: 0, description: '0=FLEXIBLE, 1=MODERATE, 2=STRICT' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  cancellationPolicy?: number;

  @ApiProperty({ example: 1500000, description: 'Giá ngày thường (VND) — bắt buộc, không được null' })
  @IsNotEmpty({ message: 'Giá ngày thường không được để trống' })
  @IsNumber({}, { message: 'Giá ngày thường phải là số' })
  @Min(0, { message: 'Giá ngày thường phải >= 0' })
  @Type(() => Number)
  weekdayPrice!: number;

  @ApiProperty({ example: 2000000, description: 'Giá cuối tuần (VND) — bắt buộc, không được null' })
  @IsNotEmpty({ message: 'Giá cuối tuần không được để trống' })
  @IsNumber({}, { message: 'Giá cuối tuần phải là số' })
  @Min(0, { message: 'Giá cuối tuần phải >= 0' })
  @Type(() => Number)
  weekendPrice!: number;

  @ApiProperty({ example: 2500000, description: 'Giá ngày lễ (VND) — bắt buộc, không được null' })
  @IsNotEmpty({ message: 'Giá ngày lễ không được để trống' })
  @IsNumber({}, { message: 'Giá ngày lễ phải là số' })
  @Min(0, { message: 'Giá ngày lễ phải >= 0' })
  @Type(() => Number)
  holidayPrice!: number;

  @ApiProperty({ example: 200000, description: 'Phụ thu người lớn (VND) — bắt buộc, không được null' })
  @IsNotEmpty({ message: 'Phụ thu người lớn không được để trống' })
  @IsNumber({}, { message: 'Phụ thu người lớn phải là số' })
  @Min(0, { message: 'Phụ thu người lớn phải >= 0' })
  @Type(() => Number)
  adultSurcharge!: number;

  @ApiProperty({ example: 100000, description: 'Phụ thu trẻ em (VND) — bắt buộc, không được null' })
  @IsNotEmpty({ message: 'Phụ thu trẻ em không được để trống' })
  @IsNumber({}, { message: 'Phụ thu trẻ em phải là số' })
  @Min(0, { message: 'Phụ thu trẻ em phải >= 0' })
  @Type(() => Number)
  childSurcharge!: number;

  @ApiPropertyOptional({ description: 'Admin chỉ định owner; Staff để trống' })
  @IsOptional()
  @IsString()
  ownerId?: string;
}
