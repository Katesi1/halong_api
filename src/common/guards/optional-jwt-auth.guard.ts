import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// JWT guard nhẹ: nếu có token hợp lệ → attach user; không có / sai → vẫn cho qua,
// user = null. Dùng cho endpoint public mà BE muốn enrich dữ liệu khi nhận diện
// được user (vd: isFavorited trên property card).
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Passport thấy không có Authorization header sẽ throw — override để swallow.
  handleRequest<TUser = any>(_err: any, user: any, _info: any, _ctx: ExecutionContext): TUser {
    return user ?? (null as any);
  }
}
