import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuditContext {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Extract IP + User-Agent từ request để truyền vào AuditLogService.log().
 * Sử dụng `app.set('trust proxy', 1)` trong main.ts → `req.ip` là client IP thật
 * (sau nginx reverse proxy 1 hop).
 *
 * Usage:
 *   ban(@AuditCtx() ctx: AuditContext, ...) { ... auditLog.log({ ..., ...ctx }); }
 */
export const AuditCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditContext => {
    const req = ctx.switchToHttp().getRequest();
    return {
      ipAddress: req?.ip ?? null,
      userAgent: req?.headers?.['user-agent'] ?? null,
    };
  },
);
