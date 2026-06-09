import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DataExportsService } from './data-exports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Data Export (GDPR)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/me/data-export')
export class DataExportsController {
  constructor(private service: DataExportsService) {}

  @Post()
  @ApiOperation({
    summary: 'Tạo yêu cầu xuất dữ liệu — trả existing nếu đang pending/processing',
  })
  create(@CurrentUser() user: { id: string }, @Lang() msg: Messages) {
    return this.service.create(user.id, msg);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách yêu cầu của tôi (mới nhất trước)' })
  list(@CurrentUser() user: { id: string }, @Lang() msg: Messages) {
    return this.service.list(user.id, msg);
  }
}
