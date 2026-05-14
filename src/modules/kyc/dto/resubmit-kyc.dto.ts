import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, ArrayNotEmpty } from 'class-validator';

export class ResubmitKycDto {
  @ApiProperty({ example: ['cccdFront', 'selfie'], description: 'Items to resubmit' })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['cccdFront', 'cccdBack', 'selfie'], { each: true })
  items: string[];
}
