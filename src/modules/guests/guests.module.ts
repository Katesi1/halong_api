import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GuestsService } from './guests.service';
import { GuestsController } from './guests.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GuestsController],
  providers: [GuestsService],
})
export class GuestsModule {}
