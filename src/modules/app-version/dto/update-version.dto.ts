import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';

export class UpdateVersionDto {
  @ApiProperty({ enum: ['ios', 'android'] })
  @IsString()
  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';

  @ApiProperty({ example: '1.2.0' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  latestVersion: string;

  @ApiProperty({ example: '1.0.0', description: 'Version thấp nhất app vẫn chạy được' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  minSupportedVersion: string;

  @ApiPropertyOptional({ description: 'Release notes (markdown ngắn)' })
  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @ApiProperty({ description: 'App Store / Play Store URL' })
  @IsString()
  @IsNotEmpty()
  storeUrl: string;
}
