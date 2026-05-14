import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID Token' })
  @IsString()
  @IsNotEmpty({ message: 'idToken không được để trống' })
  idToken: string;

  @ApiPropertyOptional({ example: 3, description: 'Role cho user mới: 1=OWNER, 2=SALE, 3=CUSTOMER (0=ADMIN bị reject)' })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2, 3], { message: 'Role chỉ chấp nhận 0-3' })
  @Type(() => Number)
  role?: number;
}
