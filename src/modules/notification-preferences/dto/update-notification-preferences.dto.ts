import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, Matches } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  booking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  payment?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  system?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  quietHours?: boolean;

  @ApiPropertyOptional({ example: '22:00', description: 'Format HH:MM (24h)' })
  @IsOptional()
  @Matches(HHMM, { message: 'quietFrom phải có format HH:MM (24h)' })
  quietFrom?: string;

  @ApiPropertyOptional({ example: '07:00', description: 'Format HH:MM (24h)' })
  @IsOptional()
  @Matches(HHMM, { message: 'quietTo phải có format HH:MM (24h)' })
  quietTo?: string;
}
