import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../config/redis.service';
import { Messages } from '../../i18n';
import { ListPostsDto } from './dto/list-posts.dto';

/**
 * Proxy các bài blog từ Citely (nguồn ngoài) + cache Redis phía server.
 * READ-KEY chỉ nằm ở env server, không bao giờ trả xuống client.
 */
@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);
  private readonly apiBase: string;
  private readonly readKey: string;
  private readonly cacheTtl: number;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.apiBase = (this.config.get<string>('CITELY_API_BASE') ?? '').replace(
      /\/+$/,
      '',
    );
    this.readKey = this.config.get<string>('CITELY_READ_KEY') ?? '';
    this.cacheTtl = Number(this.config.get<string>('CITELY_CACHE_TTL')) || 600;
  }

  async listPosts(query: ListPostsDto, msg: Messages) {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.tag) params.set('tag', query.tag);
    const qs = params.toString();

    const data = await this.fetchWithCache(
      `blog:list:${qs || 'all'}`,
      `/posts${qs ? `?${qs}` : ''}`,
      true,
      msg,
    );
    return { message: msg.blog.listSuccess, data };
  }

  async getPost(slug: string, msg: Messages) {
    const data = await this.fetchWithCache(
      `blog:post:${slug}`,
      `/posts/${encodeURIComponent(slug)}`,
      false,
      msg,
    );
    if (data == null) throw new NotFoundException(msg.blog.notFound);
    return { message: msg.blog.getSuccess, data };
  }

  /**
   * Gọi Citely với cache-first. Trả cache ngay nếu còn; nếu Citely lỗi mà có
   * cache cũ thì vẫn dùng cache (stale-while-error). Chỉ throw khi không có gì.
   */
  private async fetchWithCache(
    cacheKey: string,
    path: string,
    requireKey: boolean,
    msg: Messages,
  ): Promise<unknown> {
    const cached = await this.safeCacheGet(cacheKey);
    if (cached !== null) return cached === '__NULL__' ? null : JSON.parse(cached);

    if (!this.apiBase || (requireKey && !this.readKey)) {
      this.logger.error('Citely config thiếu (CITELY_API_BASE/CITELY_READ_KEY)');
      throw new ServiceUnavailableException(msg.blog.fetchError);
    }

    try {
      const res = await fetch(`${this.apiBase}${path}`, {
        headers: requireKey
          ? { Authorization: `Bearer ${this.readKey}` }
          : undefined,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 404) {
        await this.safeCacheSet(cacheKey, '__NULL__');
        return null;
      }
      if (!res.ok) {
        throw new Error(`Citely trả về ${res.status}`);
      }

      const json = await res.json();
      await this.safeCacheSet(cacheKey, JSON.stringify(json));
      return json;
    } catch (err) {
      this.logger.error(
        `Fetch blog thất bại (${path}): ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(msg.blog.fetchError);
    }
  }

  private async safeCacheGet(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch {
      return null;
    }
  }

  private async safeCacheSet(key: string, value: string): Promise<void> {
    try {
      await this.redis.set(key, value, this.cacheTtl);
    } catch (err) {
      this.logger.warn(`Cache blog skipped (Redis down): ${(err as Error).message}`);
    }
  }
}
