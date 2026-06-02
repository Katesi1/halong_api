import { ConflictException, ForbiddenException } from '@nestjs/common';

/**
 * Helpers tạo HttpException kèm `code` machine-readable cho client.
 * Filter sẽ preserve `code` trong response JSON.
 */

export function kycAlreadyPending(message: string): ConflictException {
  return new ConflictException({ message, code: 'KYC_ALREADY_PENDING' });
}

export function kycAlreadyApproved(message: string): ConflictException {
  return new ConflictException({ message, code: 'KYC_ALREADY_APPROVED' });
}

export function kycLocked(message: string): ForbiddenException {
  return new ForbiddenException({ message, code: 'KYC_LOCKED' });
}

export function kycRequired(message: string): ForbiddenException {
  return new ForbiddenException({ message, code: 'KYC_REQUIRED' });
}
