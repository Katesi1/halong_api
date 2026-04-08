import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID Token' })
  @IsString()
  @IsNotEmpty({ message: 'idToken không được để trống' })
  idToken: string;

  @ApiPropertyOptional({ example: 3, description: 'Role cho user mới: 1=OWNER, 2=SALE, 3=CUSTOMER' })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3], { message: 'Role chỉ chấp nhận 1 (OWNER), 2 (SALE) hoặc 3 (CUSTOMER)' })
  @Type(() => Number)
  role?: number;
}
