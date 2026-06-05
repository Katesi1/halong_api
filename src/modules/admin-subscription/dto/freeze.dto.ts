import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class FreezeDto {
  @ApiProperty({ description: 'Reason explaining why the subscription is frozen (>= 5 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason!: string;
}
