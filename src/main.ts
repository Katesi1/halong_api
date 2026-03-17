import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Redirect root về Swagger
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (_req: any, res: any) => res.redirect('/index.html'));

  // Global prefix
  // No global prefix — endpoints at root: /auth, /users, /homestays, etc.

  // CORS
  app.enableCors({
    origin: '*', // Thay bằng domain cụ thể khi production
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Partner-Key'],
  });

  // Validation pipe toàn cục
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // Tự loại bỏ fields không có trong DTO
      forbidNonWhitelisted: false,
      transform: true,        // Auto transform types
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Homestay API')
    .setDescription('API quản lý homestay – đăng nhập, homestay, phòng, giá, đặt phòng, partner')
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
