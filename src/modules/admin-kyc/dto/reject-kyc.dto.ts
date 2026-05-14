import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsArray, IsIn, ArrayNotEmpty } from 'class-validator';

export class RejectKycDto {
  @ApiProperty({ example: 'Anh CCCD bi mo, selfie khong khop' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ example: ['cccdFront', 'selfie'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['cccdFront', 'cccdBack', 'selfie', 'identity'], { each: true })
  items: string[];
}
