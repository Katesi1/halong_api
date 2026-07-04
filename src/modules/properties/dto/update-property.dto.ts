import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsNumber, IsBoolean, IsInt,
  IsArray, IsIn, Min, Max, ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PROPERTY_VIEWS } from '../property-enums';

export class UpdatePropertyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '0=VILLA, 1=HOMESTAY, 2=HOTEL' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  type?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    example: 'sea',
    description: 'View loại: sea | city | mountain | garden | pool',
    enum: PROPERTY_VIEWS,
  })
  @IsOptional()
  @IsIn(PROPERTY_VIEWS as unknown as string[])
  view?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @ApiPropertyOptional({ example: 'Bãi Cháy, Hạ Long' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Hạ Long' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Bãi Cháy' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 45, description: 'Diện tích sàn (m²) — optional' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  floorArea?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mapLink?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

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

  @ApiPropertyOptional({ example: ['Wifi', 'Điều hòa'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ description: '0=FLEXIBLE, 1=MODERATE, 2=STRICT' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  @Type(() => Number)
  cancellationPolicy?: number;

  @ApiPropertyOptional({ description: 'Giá ngày thường (VND) — nếu gửi thì không được null' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber({}, { message: 'Giá ngày thường phải là số, không được null' })
  @Min(0, { message: 'Giá ngày thường phải >= 0' })
  @Type(() => Number)
  weekdayPrice?: number;

  @ApiPropertyOptional({ description: 'Giá cuối tuần (VND) — nếu gửi thì không được null' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber({}, { message: 'Giá cuối tuần phải là số, không được null' })
  @Min(0, { message: 'Giá cuối tuần phải >= 0' })
  @Type(() => Number)
  weekendPrice?: number;

  @ApiPropertyOptional({ description: 'Giá ngày lễ (VND) — nếu gửi thì không được null' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber({}, { message: 'Giá ngày lễ phải là số, không được null' })
  @Min(0, { message: 'Giá ngày lễ phải >= 0' })
  @Type(() => Number)
  holidayPrice?: number;

  @ApiPropertyOptional({ description: 'Phụ thu người lớn (VND) — nếu gửi thì không được null' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber({}, { message: 'Phụ thu người lớn phải là số, không được null' })
  @Min(0, { message: 'Phụ thu người lớn phải >= 0' })
  @Type(() => Number)
  adultSurcharge?: number;

  @ApiPropertyOptional({ description: 'Phụ thu trẻ em (VND) — nếu gửi thì không được null' })
  @ValidateIf((_o, v) => v !== undefined)
  @IsNumber({}, { message: 'Phụ thu trẻ em phải là số, không được null' })
  @Min(0, { message: 'Phụ thu trẻ em phải >= 0' })
  @Type(() => Number)
  childSurcharge?: number;

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @IsString()
  checkInTime?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @ApiPropertyOptional({ description: 'Nội quy' })
  @IsOptional()
  @IsString()
  rules?: string;

  @ApiPropertyOptional({ example: ['Thuê xe máy', 'Nướng BBQ'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
