import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateYachtDto } from './create-yacht.dto';

/**
 * Cập nhật du thuyền (partial). `code` không cho đổi sau khi tạo (unique + slug derive).
 * Thêm `isActive` để bật/tắt hiển thị công khai.
 */
export class UpdateYachtDto extends PartialType(OmitType(CreateYachtDto, ['code'] as const)) {
  @ApiPropertyOptional({ example: true, description: 'Bật/tắt hiển thị công khai' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
