import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, IsOptional, IsEmail, Matches, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Tên không được để trống' })
  name: string;

  @ApiProperty({ example: 'user@example.com', description: 'Email (bắt buộc, unique)' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @ApiPropertyOptional({ example: '0900000000', description: 'SĐT (optional)' })
  @IsOptional()
  @Matches(/^(0|\+84)[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password: string;

  @ApiProperty({ example: 1, description: '0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER' })
  @IsInt()
  @IsIn([0, 1, 2, 3], { message: 'Role không hợp lệ (0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER)' })
  @Type(() => Number)
  role: number;

  @ApiPropertyOptional({
    example: 'system',
    description:
      'Chỉ áp dụng khi role=SALE: "owner" (mặc định, SALE thuộc 1 OWNER) | "system" (SALE hệ thống, ownerId=null, ADMIN cấp quyền qua /permissions/:userId).',
    enum: ['owner', 'system'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['owner', 'system'], { message: 'scope phải là "owner" hoặc "system"' })
  scope?: string;
}
