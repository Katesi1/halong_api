import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyReviewDto {
  @ApiProperty({ example: 'Cam on ban da trai nghiem! Hen gap lai lan sau.' })
  @IsString()
  @IsNotEmpty()
  reply: string;
}
