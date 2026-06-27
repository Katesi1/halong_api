import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsArray, ValidateNested, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ALL_PERMISSION_MODULES } from '../../../common/constants';

export class ModulePermissionDto {
  @ApiProperty({
    example: 'properties',
    description:
      'Module key. Owner-scope: properties | bookings | calendar | reviews. Admin-scope (chỉ áp dụng cho SALE hệ thống): users | kyc | subscriptions | payments | disputes | reviewsModeration | propertiesModeration | audit | leads | support | emails | billing | appVersion | dashboard',
  })
  @IsString()
  @IsIn(ALL_PERMISSION_MODULES as readonly string[])
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
