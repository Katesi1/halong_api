import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class BanUserDto {
  @ApiProperty({ description: 'Lý do ban (>= 5 ký tự)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  reason!: string;
}

export class AdminResetPasswordDto {
  @ApiPropertyOptional({
    description:
      'Mật khẩu mới (>= 8 ký tự). Bỏ trống → BE tự sinh mật khẩu tạm và trả về để admin gửi cho user.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}

export class ChangeRoleDto {
  @ApiProperty({ description: 'Role mới: 0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER' })
  @IsInt()
  @IsIn([0, 1, 2, 3])
  role!: number;
}
