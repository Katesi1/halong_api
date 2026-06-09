import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LEAD_STATUS } from '../../../common/constants';

export class UpdateLeadDto {
  @ApiPropertyOptional({ enum: Object.values(LEAD_STATUS) })
  @IsOptional()
  @IsString()
  @IsIn(Object.values(LEAD_STATUS))
  status?: string;

  @ApiPropertyOptional({ description: 'SALE phụ trách (admin/owner gán)' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional({ description: 'Ghi chú nội bộ' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
