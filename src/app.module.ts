import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './config/redis.module';
import { CloudinaryModule } from './config/cloudinary.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PartnerModule } from './modules/partner/partner.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { KycModule } from './modules/kyc/kyc.module';
import { BillingModule } from './modules/billing/billing.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AdminKycModule } from './modules/admin-kyc/admin-kyc.module';
import { AdminSubscriptionModule } from './modules/admin-subscription/admin-subscription.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { EmailModule } from './modules/email/email.module';
import { StaffModule } from './modules/staff/staff.module';
import { SystemStaffModule } from './modules/system-staff/system-staff.module';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { DevicesModule } from './modules/devices/devices.module';
import { AppVersionModule } from './modules/app-version/app-version.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { LeadsModule } from './modules/leads/leads.module';
import { AdminEmailsModule } from './modules/admin-emails/admin-emails.module';
import { ChatModule } from './modules/chat/chat.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { SupportTicketsModule } from './modules/support-tickets/support-tickets.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { DataExportsModule } from './modules/data-exports/data-exports.module';
import { ConsentsModule } from './modules/consents/consents.module';
import { NotificationPreferencesModule } from './modules/notification-preferences/notification-preferences.module';
import { GuestsModule } from './modules/guests/guests.module';
import { YachtsModule } from './modules/yachts/yachts.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    CloudinaryModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    BookingsModule,
    PartnerModule,
    CalendarModule,
    NotificationsModule,
    DashboardModule,
    KycModule,
    BillingModule,
    PaymentModule,
    AdminKycModule,
    AdminSubscriptionModule,
    ReviewsModule,
    PermissionsModule,
    EmailModule,
    StaffModule,
    SystemStaffModule,
    FirebaseModule,
    DevicesModule,
    AppVersionModule,
    AuditLogModule,
    DisputesModule,
    LeadsModule,
    AdminEmailsModule,
    ChatModule,
    UploadsModule,
    SupportTicketsModule,
    FeedbackModule,
    DataExportsModule,
    ConsentsModule,
    NotificationPreferencesModule,
    GuestsModule,
    YachtsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
