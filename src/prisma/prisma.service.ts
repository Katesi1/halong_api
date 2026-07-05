import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Timeout tối đa cho 1 query Prisma (ms). Query vượt ngưỡng → reject để request không treo. */
const QUERY_TIMEOUT_MS = Number(process.env.PRISMA_QUERY_TIMEOUT_MS) || 10_000;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Guard: DB chậm/treo (mất kết nối, lock, query nặng) KHÔNG được làm request hang vô hạn.
    // $use middleware bọc mọi query trong Promise.race với timeout → caller rơi vào catch
    // thay vì chờ mãi. Tương tự cách RedisService fail-fast khi Redis down.
    this.$use(async (params, next) => {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Prisma query timeout (${QUERY_TIMEOUT_MS}ms): ${params.model ?? '?'}.${params.action}`,
              ),
            ),
          QUERY_TIMEOUT_MS,
        );
      });
      try {
        return await Promise.race([next(params), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    });

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
