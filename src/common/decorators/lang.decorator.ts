import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getMessages, Messages } from '../../i18n';

/**
 * Decorator lấy bộ message theo Accept-Language header từ request.
 * Mặc định trả về tiếng Anh nếu header không có hoặc không hỗ trợ.
 *
 * @example
 * async getRoom(@Param('id') id: string, @Lang() msg: Messages) {
 *   return this.roomsService.findOne(id, msg);
 * }
 */
export const Lang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Messages => {
    const request = ctx.switchToHttp().getRequest();
    return getMessages(request.headers['accept-language']);
  },
);
