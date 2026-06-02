import { Module } from '@nestjs/common';
import { AdminSubscriptionController } from './admin-subscription.controller';
import { AdminSubscriptionService } from './admin-subscription.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminSubscriptionController],
  providers: [AdminSubscriptionService],
})
export class AdminSubscriptionModule {}
