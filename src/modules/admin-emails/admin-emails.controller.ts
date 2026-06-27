import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailService, EMAIL_TEMPLATE_KEYS } from '../email/email.service';
import { TestEmailDto } from './dto/test-email.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Permission } from '../../common/decorators/permission.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Admin Emails')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/emails')
export class AdminEmailsController {
  constructor(private emailService: EmailService) {}

  @Get('templates')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.EMAILS, 'canRead')
  @ApiOperation({
    summary: 'List email template keys',
    description: 'Trả danh sách template slug + trạng thái SMTP. FE render UI từ list này.',
  })
  listTemplates(@Lang() msg: Messages) {
    return {
      message: msg.adminEmails.listSuccess,
      data: {
        smtpEnabled: this.emailService.isEnabled(),
        templates: EMAIL_TEMPLATE_KEYS.map((key) => ({ key })),
      },
    };
  }

  @Post('test')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.EMAILS, 'canCreate')
  @ApiOperation({
    summary: 'Gửi email mẫu để verify rendering / SMTP',
    description: 'Body { template, to }. Trả { sent: boolean } — sent=false nếu SMTP chưa cấu hình.',
  })
  async sendTest(@Body() dto: TestEmailDto, @Lang() msg: Messages) {
    const result = await this.emailService.sendTest(dto.template, dto.to);
    return {
      message: result.sent ? msg.adminEmails.testSentSuccess : msg.adminEmails.smtpDisabled,
      data: result,
    };
  }
}
