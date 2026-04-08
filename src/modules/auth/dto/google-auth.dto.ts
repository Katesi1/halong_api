import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID Token' })
  @IsString()
  @IsNotEmpty({ message: 'idToken không được để trống' })
  idToken: string;

  @ApiPropertyOptional({ example: 2, description: 'Role cho user mới: 1=STAFF, 2=CUSTOMER' })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2], { message: 'Role chỉ chấp nhận 1 (STAFF) hoặc 2 (CUSTOMER)' })
  @Type(() => Number)
  role?: number;
}
