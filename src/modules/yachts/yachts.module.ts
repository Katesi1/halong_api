import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { YachtsController } from './yachts.controller';
import { YachtBookingsController } from './yacht-bookings.controller';
import {
  YachtReviewsController,
  AdminYachtReviewsController,
} from './yacht-reviews.controller';
import { YachtsService } from './yachts.service';
import { YachtBookingsService } from './yacht-bookings.service';
import { YachtReviewsService } from './yacht-reviews.service';

// PrismaService, CloudinaryService, EmailService, ConfigService là @Global — inject trực tiếp.
@Module({
  imports: [NotificationsModule, ChatModule],
  controllers: [
    YachtsController,
    YachtBookingsController,
    YachtReviewsController,
    AdminYachtReviewsController,
  ],
  providers: [YachtsService, YachtBookingsService, YachtReviewsService],
  exports: [YachtsService, YachtBookingsService, YachtReviewsService],
})
export class YachtsModule {}
