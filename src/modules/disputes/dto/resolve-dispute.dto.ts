import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export const DISPUTE_PENALTY_VALUES = ['none', 'warning', 'refund', 'ban_temp', 'ban_perm'] as const;
export type DisputePenalty = (typeof DISPUTE_PENALTY_VALUES)[number];

export class ResolveDisputeDto {
  @ApiProperty({ description: 'Nội dung phán quyết (>= 5 ký tự)' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  resolution!: string;

  @ApiPropertyOptional({ description: 'Số tiền đồng ý hoàn (VND)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  refundAmount?: number;

  @ApiPropertyOptional({
    description: 'Hình thức xử lý kèm theo',
    enum: DISPUTE_PENALTY_VALUES,
  })
  @IsOptional()
  @IsIn(DISPUTE_PENALTY_VALUES as unknown as string[])
  penalty?: DisputePenalty;
}

export class RejectDisputeDto {
  @ApiProperty({ description: 'Lý do bác (>= 5 ký tự)' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  resolution!: string;
}
