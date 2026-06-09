import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateBillingPlanDto {
  @ApiProperty({ example: 'rooms_5', description: 'Plan ID — lowercase letters, digits, underscores' })
  @IsString()
  @Matches(/^[a-z0-9_]+$/)
  id!: string;

  @ApiProperty({ example: 'Starter' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 119800, description: 'VND/room (legacy field, used as label)' })
  @IsInt()
  @Min(0)
  pricePerRoom!: number;

  @ApiProperty({ example: 599000, description: 'VND/month displayed to user' })
  @IsInt()
  @Min(0)
  minCharge!: number;

  @ApiPropertyOptional({ example: 5999000, description: 'VND/year displayed to user' })
  @IsOptional()
  @IsInt()
  @Min(0)
  yearlyPrice?: number;

  @ApiPropertyOptional({ example: 5, description: 'null or -1 = unlimited' })
  @IsOptional()
  @IsInt()
  maxRooms?: number | null;

  @ApiPropertyOptional({ example: 16, description: 'Yearly discount % (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  yearlyDiscountPct?: number;

  @ApiPropertyOptional({ example: 10, description: 'VAT % (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPct?: number;

  @ApiPropertyOptional({ type: [String], example: ['Booking + Calendar', 'Báo cáo cơ bản'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
