import { Module } from '@nestjs/common';
import { AppleIapController } from './apple-iap.controller';
import { AppleIapService } from './apple-iap.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AppleIapController],
  providers: [AppleIapService],
  exports: [AppleIapService],
})
export class AppleIapModule {}
