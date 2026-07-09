import { ForbiddenException } from '@nestjs/common';

/**
 * Helper tạo HttpException kèm `code` machine-readable cho client.
 * Filter sẽ preserve `code` trong response JSON.
 */

/**
 * Owner/SALE không còn entitlement: trial hết hạn, hoặc subscription
 * không ở trạng thái active/trial. Message generic (không lộ trạng thái
 * subscription) — FE match theo `code: "FEATURE_LOCKED"`.
 */
export function featureLocked(message: string): ForbiddenException {
  return new ForbiddenException({ message, code: 'FEATURE_LOCKED' });
}

/**
 * Owner đạt trần số cơ sở được phép đăng (trial ngầm = 1). Message trung tính
 * (không lộ trial/gói/thanh toán) để an toàn với Apple review — FE match theo
 * `code: "PROPERTY_LIMIT_REACHED"`.
 */
export function propertyLimitReached(message: string): ForbiddenException {
  return new ForbiddenException({ message, code: 'PROPERTY_LIMIT_REACHED' });
}
