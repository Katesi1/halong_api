import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
