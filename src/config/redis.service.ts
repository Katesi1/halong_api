import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      // Fail-fast khi Redis down: KHÔNG xếp hàng offline (tránh treo request đang await),
      // reject nhanh sau vài lần thử để caller (hold methods) rơi vào try-catch thay vì hang.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
    });

    // Chỉ log 1 dòng warn khi mất kết nối, tránh spam stacktrace mỗi lần retry.
    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.warn(`Redis unavailable: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  // Hold booking: key = hold:booking:{bookingId}
  // Hold trong Redis là BEST-EFFORT: nguồn sự thật là DB (booking.holdExpireAt) + cron expire.
  // Vì vậy các hàm dưới KHÔNG BAO GIỜ throw — Redis down không được làm hỏng luồng tạo/xác nhận booking.
  async setHold(bookingId: string, ttlSeconds = 1800): Promise<void> {
    try {
      await this.set(`hold:booking:${bookingId}`, '1', ttlSeconds);
    } catch (err) {
      this.logger.warn(`setHold skipped (Redis down): ${(err as Error).message}`);
    }
  }

  async getHoldTtl(bookingId: string): Promise<number> {
    try {
      return await this.ttl(`hold:booking:${bookingId}`);
    } catch {
      return -2; // ioredis convention: -2 = key không tồn tại
    }
  }

  async delHold(bookingId: string): Promise<void> {
    try {
      await this.del(`hold:booking:${bookingId}`);
    } catch (err) {
      this.logger.warn(`delHold skipped (Redis down): ${(err as Error).message}`);
    }
  }
}
