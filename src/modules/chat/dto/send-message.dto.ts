import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CHAT_LIMITS } from '../../../common/constants';

export class AttachmentDto {
  @ApiProperty({ description: 'URL ảnh/file đính kèm (https)' })
  @IsUrl({ require_protocol: true, protocols: ['https'] }, { message: 'URL phải https' })
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({ description: 'MIME type (image/jpeg, ...)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ description: 'Bytes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;
}

export class SendMessageDto {
  @ApiProperty({ description: `Nội dung tin nhắn (tối đa ${CHAT_LIMITS.MESSAGE_MAX_LENGTH} ký tự)` })
  @IsString()
  @MinLength(1)
  @MaxLength(CHAT_LIMITS.MESSAGE_MAX_LENGTH)
  content!: string;

  @ApiPropertyOptional({
    description: `Mảng attachment (tối đa ${CHAT_LIMITS.ATTACHMENTS_MAX}), mỗi item có url https + type/name/size optional`,
    type: [AttachmentDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CHAT_LIMITS.ATTACHMENTS_MAX)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
