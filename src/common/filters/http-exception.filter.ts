import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { getMessages, Messages } from '../../i18n';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    const msg = getMessages(request.headers?.['accept-language']);
    let message: string | string[] = msg.common.serverError;
    let errors: any = null;
    let code: string | null = null;
    // Extra fields từ HttpException response object (vd: pendingSession,
    // effectiveAt, pendingPlanId trên các 409 billing). Filter sẽ spread
    // chúng ra root body để FE đọc được mà không cần unwrap `data`.
    let extras: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object') {
        const obj = res as Record<string, unknown>;
        // Ưu tiên message string — nếu là array (legacy NestJS default), lấy phần tử đầu
        if (typeof obj.message === 'string') {
          message = obj.message;
        } else if (Array.isArray(obj.message) && obj.message.length > 0) {
          message = String(obj.message[0]);
        }
        // Preserve field-level errors object từ ValidationPipe exceptionFactory
        errors = obj.errors ?? null;
        // Preserve machine-readable code (e.g. KYC_ALREADY_PENDING)
        if (typeof obj.code === 'string') code = obj.code;
        // Forward mọi field khác (vd: pendingSession, effectiveAt) ra root body.
        // Skip các key đã được handle riêng + key chuẩn của HttpException.
        const reservedKeys = new Set([
          'message',
          'errors',
          'code',
          'statusCode',
          'error',
        ]);
        for (const [key, value] of Object.entries(obj)) {
          if (!reservedKeys.has(key)) extras[key] = value;
        }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Lưới an toàn: dịch lỗi Prisma phổ biến thành HTTP status hợp lý +
      // message i18n thay vì 500 thô. Endpoint muốn message nghiệp vụ cụ thể
      // vẫn nên tự pre-check + throw HttpException riêng (ưu tiên nhánh trên).
      const mapped = this.mapPrismaError(exception, msg);
      status = mapped.status;
      message = mapped.message;
      code = mapped.code;
      extras = mapped.extras;
      this.logger.warn(
        `Prisma ${exception.code} → ${status} on ${request.method} ${request.url}`,
      );
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = msg.common.invalidData;
      code = 'PRISMA_VALIDATION';
      this.logger.warn(
        `Prisma validation error → 400 on ${request.method} ${request.url}`,
      );
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message.join(', ') : message,
      code,
      errors,
      ...extras,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  /** Dịch PrismaClientKnownRequestError → HTTP status + message + code + extras. */
  private mapPrismaError(
    err: Prisma.PrismaClientKnownRequestError,
    msg: Messages,
  ): {
    status: number;
    message: string;
    code: string | null;
    extras: Record<string, unknown>;
  } {
    const target = Array.isArray(err.meta?.target)
      ? (err.meta?.target as string[])
      : typeof err.meta?.target === 'string'
        ? [err.meta.target as string]
        : [];
    switch (err.code) {
      case 'P2002': // Unique constraint failed
        return {
          status: HttpStatus.CONFLICT,
          message: msg.common.duplicateEntry,
          code: 'DUPLICATE_ENTRY',
          extras: target.length ? { conflictFields: target } : {},
        };
      case 'P2025': // Record to update/delete not found
        return {
          status: HttpStatus.NOT_FOUND,
          message: msg.common.notFound,
          code: 'NOT_FOUND',
          extras: {},
        };
      case 'P2003': // Foreign key constraint failed
        return {
          status: HttpStatus.BAD_REQUEST,
          message: msg.common.invalidReference,
          code: 'INVALID_REFERENCE',
          extras: {},
        };
      case 'P2000': // Value too long for column
      case 'P2005':
      case 'P2006': // Invalid value for field
        return {
          status: HttpStatus.BAD_REQUEST,
          message: msg.common.invalidData,
          code: 'INVALID_DATA',
          extras: {},
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: msg.common.serverError,
          code: null,
          extras: {},
        };
    }
  }
}
