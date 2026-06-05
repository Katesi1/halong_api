import { AsyncLocalStorage } from 'async_hooks';

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Per-request AsyncLocalStorage. Interceptor wrap mỗi request bằng `run()`,
 * AuditLogService đọc `getStore()` để tự gán IP/UA mà không cần truyền qua params.
 *
 * ALS propagate qua async boundaries (await, setTimeout, Promise) nên Service deep
 * trong call stack vẫn lấy đúng context của request hiện tại.
 */
export const auditContextStorage = new AsyncLocalStorage<AuditContext>();
