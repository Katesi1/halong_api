import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Cập nhật bảng giá du thuyền — BÁN THEO ĐẦU NGƯỜI.
 * Giá người lớn (3 field ngày thường/cuối tuần/lễ) bắt buộc; giá trẻ em (3 field) tuỳ chọn
 * (bỏ trống → trẻ em miễn phí). total = adults × giá người lớn(ngày) + children × giá trẻ em(ngày).
 */
export class UpdateYachtPricesDto {
  @ApiProperty({ example: 900000, description: 'Giá NGƯỜI LỚN/khách — ngày thường (VND)' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weekdayPrice: number;

  @ApiProperty({ example: 1100000, description: 'Giá NGƯỜI LỚN/khách — cuối tuần (T6/T7/CN)' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weekendPrice: number;

  @ApiProperty({ example: 1300000, description: 'Giá NGƯỜI LỚN/khách — ngày lễ' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  holidayPrice: number;

  @ApiPropertyOptional({ example: 650000, description: 'Giá TRẺ EM/khách — ngày thường (bỏ trống → miễn phí)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weekdayChildPrice?: number;

  @ApiPropertyOptional({ example: 800000, description: 'Giá TRẺ EM/khách — cuối tuần' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weekendChildPrice?: number;

  @ApiPropertyOptional({ example: 950000, description: 'Giá TRẺ EM/khách — ngày lễ' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  holidayChildPrice?: number;
}
