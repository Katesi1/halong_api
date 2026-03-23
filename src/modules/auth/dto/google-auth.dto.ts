import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({ description: 'Google ID Token' })
  @IsString()
  @IsNotEmpty({ message: 'idToken không được để trống' })
  idToken: string;

  @ApiPropertyOptional({ example: 'CUSTOMER', description: 'Role cho user mới (STAFF hoặc CUSTOMER)', enum: ['STAFF', 'CUSTOMER'] })
  @IsOptional()
  @IsString()
  @IsIn(['STAFF', 'CUSTOMER'], { message: 'Role chỉ chấp nhận STAFF hoặc CUSTOMER' })
  role?: 'STAFF' | 'CUSTOMER';
}
