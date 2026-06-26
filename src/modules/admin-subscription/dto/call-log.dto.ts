import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCallLogDto {
  @ApiProperty({ description: 'Nội dung ghi chú cuộc gọi nhắc đóng tiền', minLength: 3, maxLength: 2000 })
  @IsString()
  @MinLength(3, { message: 'Ghi chú tối thiểu 3 ký tự' })
  @MaxLength(2000, { message: 'Ghi chú tối đa 2000 ký tự' })
  note!: string;
}
