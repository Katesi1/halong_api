import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePricesDto {
  @ApiPropertyOptional({ example: 1500000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weekdayPrice?: number;

  @ApiPropertyOptional({ example: 2000000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  weekendPrice?: number;

  @ApiPropertyOptional({ example: 2500000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  holidayPrice?: number;

  @ApiPropertyOptional({ example: 200000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  adultSurcharge?: number;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  childSurcharge?: number;
}
