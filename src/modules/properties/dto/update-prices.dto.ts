import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePricesDto {
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
}
