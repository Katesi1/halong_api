import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicketsController } from './support-tickets.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
})
export class SupportTicketsModule {}
