import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

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
}

export class RejectDisputeDto {
  @ApiProperty({ description: 'Lý do bác (>= 5 ký tự)' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  resolution!: string;
}
