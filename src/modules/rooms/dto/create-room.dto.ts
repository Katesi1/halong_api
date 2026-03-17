import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoomDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'homestayId không được để trống' })
  homestayId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Tên phòng không được để trống' })
  name: string;

  @ApiProperty({ description: 'Mã phòng (unique)' })
  @IsString()
  @IsNotEmpty({ message: 'Mã phòng không được để trống' })
  code: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  bedrooms?: number;

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
}
