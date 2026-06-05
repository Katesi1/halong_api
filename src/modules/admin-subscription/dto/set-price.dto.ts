import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class SetPriceDto {
  @ApiProperty({
    description:
      'VND custom price per billing cycle. Pass null to clear override and revert to plan default.',
    example: 1500000,
    nullable: true,
  })
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  priceOverride!: number | null;

  @ApiPropertyOptional({ description: 'Admin note explaining the override' })
  @IsOptional()
  @IsString()
  reason?: string;
}
