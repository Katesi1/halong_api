import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CalendarBulkItemDto {
  @ApiProperty({ description: 'Property UUID' })
  @IsUUID()
  propertyId!: string;

  @ApiProperty({ description: 'Ngày cần lock/unlock (YYYY-MM-DD)' })
  @IsDateString()
  date!: string;
}

export class CalendarBulkDto {
  @ApiProperty({ enum: ['lock', 'unlock'], description: "'lock' = khoá, 'unlock' = mở khoá" })
  @IsIn(['lock', 'unlock'])
  mode!: 'lock' | 'unlock';

  @ApiProperty({ type: [CalendarBulkItemDto], description: 'Mảng items (tối đa 100)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CalendarBulkItemDto)
  items!: CalendarBulkItemDto[];
}
