import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { AdminEmailsController } from './admin-emails.controller';

@Module({
  imports: [EmailModule],
  controllers: [AdminEmailsController],
})
export class AdminEmailsModule {}
