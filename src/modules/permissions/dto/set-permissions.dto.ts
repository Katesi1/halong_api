import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class ModulePermissionDto {
  @ApiProperty({ example: 'properties', description: 'Module: properties | bookings | calendar | reviews' })
  @IsString()
  @IsIn(['properties', 'bookings', 'calendar', 'reviews'])
  module: string;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  canCreate?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  canRead?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  canUpdate?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  canDelete?: boolean;
}

export class SetPermissionsDto {
  @ApiProperty({ type: [ModulePermissionDto], description: 'Danh sách quyền cho từng module' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModulePermissionDto)
  permissions: ModulePermissionDto[];
}
