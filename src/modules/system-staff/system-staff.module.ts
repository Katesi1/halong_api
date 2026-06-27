import { Module } from '@nestjs/common';
import { SystemStaffController } from './system-staff.controller';
import { SystemStaffService } from './system-staff.service';
import { EmailModule } from '../email/email.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [EmailModule, AuditLogModule],
  controllers: [SystemStaffController],
  providers: [SystemStaffService],
})
export class SystemStaffModule {}
