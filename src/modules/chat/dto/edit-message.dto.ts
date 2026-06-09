import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CHAT_LIMITS } from '../../../common/constants';

export class EditMessageDto {
  @ApiProperty({ description: `Nội dung mới (tối đa ${CHAT_LIMITS.MESSAGE_MAX_LENGTH} ký tự)` })
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_LIMITS.MESSAGE_MAX_LENGTH)
  content!: string;
}
