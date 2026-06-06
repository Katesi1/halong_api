import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DataExportsService } from './data-exports.service';
import { DataExportsController } from './data-exports.controller';

@Module({
  imports: [PrismaModule],
  controllers: [DataExportsController],
  providers: [DataExportsService],
})
export class DataExportsModule {}
