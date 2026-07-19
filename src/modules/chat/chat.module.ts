import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './gateway/chat.gateway';
import { ChatRetentionService } from './chat-retention.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    // JwtService inject vào gateway. Lấy secret từ ConfigService để consistent
    // với AuthModule + dễ test (override config thay vì env).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatRetentionService],
  exports: [ChatService],
})
export class ChatModule {}
