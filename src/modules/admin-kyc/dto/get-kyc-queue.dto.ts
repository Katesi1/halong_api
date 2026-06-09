import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { KYC_ADMIN_FILTER } from '../../../common/constants';

export class GetKycQueueDto {
  @ApiPropertyOptional({
    example: 1,
    description:
      '0=tất cả, 1=chờ duyệt, 2=đã duyệt, 3=đã từ chối. Mặc định 1.',
    enum: Object.values(KYC_ADMIN_FILTER),
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(KYC_ADMIN_FILTER.ALL)
  @Max(KYC_ADMIN_FILTER.REJECTED)
  filter?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** @deprecated Dùng `filter` (0–3). Giữ tạm cho client cũ. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  status?: string;
}
