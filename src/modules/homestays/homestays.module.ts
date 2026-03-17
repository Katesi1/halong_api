import { Module } from '@nestjs/common';
import { HomestaysService } from './homestays.service';
import { HomestaysController } from './homestays.controller';

@Module({
  controllers: [HomestaysController],
  providers: [HomestaysService],
  exports: [HomestaysService],
})
export class HomestaysModule {}
