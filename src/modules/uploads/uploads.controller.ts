import {
  Controller,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Uploads')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } }) // 30 req/phút/user
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload generic file (chat attachment, dispute evidence, ...)',
    description:
      'Whitelist MIME: image/jpeg, image/png, image/webp, image/gif, application/pdf. ' +
      'Tối đa 10MB. Trả về URL https Cloudinary dùng kèm message/attachment. ' +
      'BE check magic bytes — không tin Content-Type. ' +
      'Orphan (chưa attach vào message nào trong 24h) sẽ bị cron tự xoá.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiResponse({ status: 201, description: 'Upload OK, trả URL CDN' })
  @ApiResponse({ status: 401, description: 'Chưa login' })
  @ApiResponse({ status: 413, description: 'File quá 10MB' })
  @ApiResponse({ status: 415, description: 'MIME type không hỗ trợ' })
  @ApiResponse({ status: 429, description: 'Quá rate limit 30/phút' })
  upload(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Lang() msg: Messages,
  ) {
    return this.uploadsService.upload(userId, file, msg);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Xoá file orphan (chưa attach vào message)',
    description:
      'User upload xong nhưng đổi ý không gửi → xoá để giải phóng storage. ' +
      'Chỉ owner của upload và chỉ khi chưa attached. File đã attach phải xoá qua endpoint message tương ứng.',
  })
  @ApiResponse({ status: 200, description: 'Xoá thành công' })
  @ApiResponse({ status: 403, description: 'Không phải owner upload' })
  @ApiResponse({ status: 400, description: 'File đã attach, không xoá được' })
  delete(
    @CurrentUser('id') userId: string,
    @Param('id') uploadId: string,
    @Lang() msg: Messages,
  ) {
    return this.uploadsService.delete(userId, uploadId, msg);
  }
}
