import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CONVERSATION_TYPE } from '../../../common/constants';

export class CreateConversationDto {
  @ApiProperty({ enum: Object.values(CONVERSATION_TYPE) })
  @IsString()
  @IsIn(Object.values(CONVERSATION_TYPE))
  type!: string;

  @ApiPropertyOptional({ description: 'Required when type=booking' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;
}
