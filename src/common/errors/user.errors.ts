import { ForbiddenException } from '@nestjs/common';

/**
 * Helpers tạo HttpException kèm `code` machine-readable cho client.
 * Filter sẽ preserve `code` trong response JSON.
 */

/**
 * Owner chưa có số điện thoại trong hồ sơ. SĐT là bắt buộc để đăng/quản lý cơ
 * sở (khách + SALE cần số liên hệ; đăng ký Google/Apple không lấy được phone).
 * FE match theo `code: "PHONE_REQUIRED"` → điều hướng user cập nhật hồ sơ.
 */
export function phoneRequired(message: string): ForbiddenException {
  return new ForbiddenException({ message, code: 'PHONE_REQUIRED' });
}
