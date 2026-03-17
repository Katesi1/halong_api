import { vi } from './vi';
import { en } from './en';

export type Messages = typeof vi;

const locales: Record<string, Messages> = { vi, en };

/**
 * Trả về bộ message theo Accept-Language header.
 * Mặc định là tiếng Việt nếu không khớp.
 *
 * @example
 * const msg = getMessages(request.headers['accept-language']);
 * throw new NotFoundException(msg.rooms.notFound);
 */
export function getMessages(acceptLanguage?: string): Messages {
  if (!acceptLanguage) return en;
  const lang = acceptLanguage.split(',')[0].split('-')[0].trim().toLowerCase();
  return locales[lang] ?? en;
}

export { vi, en };
