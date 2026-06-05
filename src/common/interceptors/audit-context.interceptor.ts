import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { auditContextStorage } from '../als/audit-context.storage';

/**
 * Global interceptor — wrap mỗi HTTP request với AsyncLocalStorage scope.
 * AuditLogService.log() tự đọc ALS để gán IP/UA, không cần controller truyền tay.
 *
 * Lưu ý: chỉ work cho HTTP request. WS gateway tự pass context khác.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest();
    const store = {
      ipAddress: req?.ip ?? undefined,
      userAgent: req?.headers?.['user-agent'] ?? undefined,
    };
    return new Observable((subscriber) => {
      auditContextStorage.run(store, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
