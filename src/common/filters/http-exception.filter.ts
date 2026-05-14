import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getMessages } from '../../i18n';

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
      }
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message: Array.isArray(message) ? message.join(', ') : message,
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
