import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Trust reverse proxy (nginx) → @Ip() đọc đúng X-Forwarded-For thay vì 127.0.0.1
  app.set('trust proxy', true);

  // Redirect root về Swagger
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (_req: any, res: any) => res.redirect('/index.html'));

  // Global prefix
  // No global prefix — endpoints at root: /auth, /users, /properties, etc.

  // CORS
  app.enableCors({
    origin: '*', // Thay bằng domain cụ thể khi production
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Partner-Key', 'X-Device-Id', 'Accept-Language'],
  });

  // Logging interceptor toàn cục
  app.useGlobalInterceptors(new LoggingInterceptor());

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
  new Logger('Bootstrap').log(`Server running at http://localhost:${port}/index.html`);
}
bootstrap();
