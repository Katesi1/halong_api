import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export const TICKET_CATEGORIES = ['account', 'payment', 'technical', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export class CreateSupportTicketDto {
  @ApiProperty({ minLength: 5, maxLength: 200 })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ enum: TICKET_CATEGORIES })
  @IsIn(TICKET_CATEGORIES as unknown as string[])
  category!: TicketCategory;

  @ApiProperty({ minLength: 10, maxLength: 5000 })
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  attachments?: string[];
}
