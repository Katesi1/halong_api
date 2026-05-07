import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { KycService } from './kyc.service';
import { ResubmitKycDto } from './dto/resubmit-kyc.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('KYC')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: 'Accept-Language',
  enum: ['en', 'vi'],
  required: false,
})
@Controller('kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KycController {
  constructor(private kycService: KycService) {}

  @Post('upload-cccd-front')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Upload CCCD front' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadCccdFront(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Lang() msg: Messages,
  ) {
    return this.kycService.uploadCccdFront(user, file, msg);
  }

  @Post('upload-cccd-back')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Upload CCCD back' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadCccdBack(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Lang() msg: Messages,
  ) {
    return this.kycService.uploadCccdBack(user, file, msg);
  }

  @Post('upload-selfie')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Upload selfie for face match' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  uploadSelfie(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Lang() msg: Messages,
  ) {
    return this.kycService.uploadSelfie(user, file, msg);
  }

  @Post('submit')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Submit KYC for approval' })
  submit(@CurrentUser() user: any, @Lang() msg: Messages) {
    return this.kycService.submit(user, msg);
  }

  @Get('status')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Get my KYC status' })
  getMyStatus(@CurrentUser() user: any, @Lang() msg: Messages) {
    return this.kycService.getMyStatus(user, msg);
  }

  @Get('submissions/:id')
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @ApiOperation({ summary: 'Get submission details' })
  getSubmission(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Lang() msg: Messages,
  ) {
    return this.kycService.getSubmission(user, id, msg);
  }

  @Post('submissions/:id/resubmit')
  @Roles(ROLE.OWNER)
  @ApiOperation({ summary: 'Resubmit rejected items' })
  resubmit(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ResubmitKycDto,
    @Lang() msg: Messages,
  ) {
    return this.kycService.resubmit(user, id, dto.items, msg);
  }
}
