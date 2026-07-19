import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ItineraryItemDto } from './itinerary-item.dto';

/**
 * Tạo du thuyền — chỉ ADMIN + SALE hệ thống. `code` do client nhập (unique),
 * `slug` BE tự sinh. Giá tính theo booking-pricing (weekday/weekend/holiday + phụ thu).
 */
export class CreateYachtDto {
  @ApiProperty({ example: 'Du thuyền Ambassador Cruise' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'YT-AMBASSADOR', description: 'Mã du thuyền (unique)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ example: 'Du thuyền 5 sao khám phá vịnh Lan Hạ.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ example: 25, description: 'Số cabin/phòng' })
  @IsOptional()
  @IsInt()
  @Min(1)
  cabins?: number;

  @ApiPropertyOptional({ example: 2, description: 'Số khách tiêu chuẩn (đã bao trong giá)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  standardGuests?: number;

  @ApiPropertyOptional({ example: 0, description: 'Số trẻ em tiêu chuẩn' })
  @IsOptional()
  @IsInt()
  @Min(0)
  standardChildren?: number;

  @ApiPropertyOptional({ example: 4, description: 'Sức chứa tối đa/đơn đặt' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxGuests?: number;

  @ApiPropertyOptional({ example: 45.5, description: 'Chiều dài thân tàu (m)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lengthMeters?: number;

  @ApiPropertyOptional({ example: 'steel', description: 'Loại tàu: steel | wooden | ...' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shipType?: string;

  @ApiPropertyOptional({ example: 'Cảng Tuần Châu, Hạ Long' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  departurePoint?: string;

  @ApiPropertyOptional({ example: '2 ngày 1 đêm' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  durationText?: string;

  @ApiPropertyOptional({
    type: [ItineraryItemDto],
    description: 'Hành trình — danh sách chặng theo thứ tự',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ItineraryItemDto)
  itinerary?: ItineraryItemDto[];

  @ApiPropertyOptional({ type: [String], example: ['Bể sục', 'Nhà hàng', 'Bar'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  amenities?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Kayak', 'Chèo thuyền', 'Lớp nấu ăn'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(100)
  services?: string[];

  @ApiPropertyOptional({ example: 'Không hút thuốc trong cabin.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  rules?: string;

  @ApiPropertyOptional({ example: 0, description: '0=FLEXIBLE, 1=MODERATE, 2=STRICT' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  cancellationPolicy?: number;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  checkInTime?: string;

  @ApiPropertyOptional({ example: '11:00' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  checkOutTime?: string;

  // ─── Giá bán THEO ĐẦU NGƯỜI — người lớn & trẻ em RIÊNG ───────────────────────
  @ApiPropertyOptional({ example: 900000, description: 'Giá NGƯỜI LỚN/khách — ngày thường (VND)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weekdayPrice?: number;

  @ApiPropertyOptional({ example: 1100000, description: 'Giá NGƯỜI LỚN/khách — cuối tuần (T6/T7/CN)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weekendPrice?: number;

  @ApiPropertyOptional({ example: 1300000, description: 'Giá NGƯỜI LỚN/khách — ngày lễ' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  holidayPrice?: number;

  @ApiPropertyOptional({ example: 650000, description: 'Giá TRẺ EM/khách — ngày thường (bỏ trống → trẻ em miễn phí)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weekdayChildPrice?: number;

  @ApiPropertyOptional({ example: 800000, description: 'Giá TRẺ EM/khách — cuối tuần' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weekendChildPrice?: number;

  @ApiPropertyOptional({ example: 950000, description: 'Giá TRẺ EM/khách — ngày lễ' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  holidayChildPrice?: number;
}
