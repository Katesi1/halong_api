import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, IsBoolean, IsNumber, IsEnum, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { RoomType, CancellationPolicy } from '@prisma/client';

export class UpdateRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ enum: RoomType })
  @IsOptional()
  @IsEnum(RoomType, { message: 'Loại phòng không hợp lệ' })
  type?: RoomType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  bedrooms?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  bathrooms?: number;

  @ApiPropertyOptional({ default: 2, description: 'Sức chứa tiêu chuẩn' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  standardGuests?: number;

  @ApiPropertyOptional({ default: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxGuests?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Địa chỉ riêng của phòng' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Link Google Maps' })
  @IsOptional()
  @IsString()
  mapLink?: string;

  @ApiPropertyOptional({ type: [String], description: 'Danh sách tiện nghi' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ enum: CancellationPolicy })
  @IsOptional()
  @IsEnum(CancellationPolicy, { message: 'Chính sách huỷ không hợp lệ' })
  cancellationPolicy?: CancellationPolicy;

  @ApiPropertyOptional({ description: 'Phụ thu người lớn (VNĐ)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  adultSurcharge?: number;

  @ApiPropertyOptional({ description: 'Phụ thu trẻ em (VNĐ)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  childSurcharge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
