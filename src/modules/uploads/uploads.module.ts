import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryModule } from '../../config/cloudinary.module';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';

@Global()
@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService], // Cho ChatModule import để wire markAttached + delete
})
export class UploadsModule {}
