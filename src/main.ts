import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import compression from 'compression';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuditContextInterceptor } from './common/interceptors/audit-context.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProd = process.env.NODE_ENV === 'production';

  // Trust reverse proxy (1 hop: nginx). Không dùng `true` để tránh X-Forwarded-For spoof.
  app.set('trust proxy', 1);

  // Graceful shutdown — Prisma/Redis OnModuleDestroy chạy đúng khi nhận SIGTERM
  app.enableShutdownHooks();

  // Nén response (gzip/deflate) — giảm TTFB & băng thông cho payload JSON list lớn.
  // threshold 1KB: bỏ qua response nhỏ (nén tốn CPU hơn lợi). nginx phía trước có thể
  // đã nén; middleware này đảm bảo nén ngay cả khi gọi trực tiếp app.
  app.use(compression({ threshold: 1024 }));

  // Giới hạn body để tránh OOM / event-loop block
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // Redirect root về Swagger
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (_req: any, res: any) => res.redirect('/index.html'));

  // CORS — production phải set ALLOWED_ORIGINS=https://a.com,https://b.com
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: isProd ? (allowedOrigins.length > 0 ? allowedOrigins : false) : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Partner-Key', 'X-Device-Id', 'Accept-Language'],
    credentials: true,
  });

  // Logging interceptor toàn cục
  // AuditContextInterceptor phải register TRƯỚC để mọi luồng async sau (kể cả lỗi)
  // đều có access vào IP/UA qua AsyncLocalStorage.
  app.useGlobalInterceptors(new AuditContextInterceptor(), new LoggingInterceptor());

  // Validation pipe toàn cục
  // exceptionFactory: tách lỗi validate theo field thay vì concat 1 string.
  // FE web/mobile có thể đọc `errors[field]` để hiện inline error per-field.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Tự loại bỏ fields không có trong DTO
      forbidNonWhitelisted: false,
      transform: true,        // Auto transform types
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false, // Trả về toàn bộ lỗi của 1 field (không dừng ở lỗi đầu)
      exceptionFactory: (errors: ValidationError[]) => {
        // Build payload dạng { firstMessage, errors: { field: [msg, msg], ... } }
        const fieldErrors: Record<string, string[]> = {};
        let firstMessage = 'Validation failed';

        const collect = (err: ValidationError, path: string) => {
          const key = path ? `${path}.${err.property}` : err.property;
          if (err.constraints) {
            const messages = Object.values(err.constraints);
            if (messages.length > 0) {
              fieldErrors[key] = messages;
              if (firstMessage === 'Validation failed') {
                firstMessage = messages[0];
              }
            }
          }
          if (err.children && err.children.length > 0) {
            for (const child of err.children) collect(child, key);
          }
        };

        for (const err of errors) collect(err, '');

        return new BadRequestException({
          message: firstMessage,
          errors: fieldErrors,
        });
      },
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Halong24h API')
    .setDescription('API quản lý property – đăng nhập, property, phòng, giá, đặt phòng, partner')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        description: 'Dành cho App Mobile — Gọi POST /auth/login để lấy accessToken, sau đó paste token vào đây',
      },
      'access-token',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-Partner-Key',
        description: 'Chỉ dành cho đối tác bên ngoài — Dev app mobile KHÔNG cần quan tâm mục này',
      },
      'partner-key',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('index.html', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Server running on port ${port} (prod=${isProd})`);
}
bootstrap();
