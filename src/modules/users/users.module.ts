import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminBankController } from './admin-bank.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [UsersController, AdminBankController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
