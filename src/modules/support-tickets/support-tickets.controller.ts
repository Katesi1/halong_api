import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SupportTicketsService } from './support-tickets.service';
import { CreateSupportTicketDto } from './dto/create-ticket.dto';
import { ReplySupportTicketDto } from './dto/reply-ticket.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Support Tickets')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support/tickets')
export class SupportTicketsController {
  constructor(private service: SupportTicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo ticket hỗ trợ mới' })
  create(
    @CurrentUser() user: { id: string; role: number },
    @Body() dto: CreateSupportTicketDto,
    @Lang() msg: Messages,
  ) {
    return this.service.create(user.id, dto, msg);
  }

  @Get()
  @ApiOperation({
    summary: 'Danh sách ticket của tôi (ADMIN xem tất cả)',
  })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @CurrentUser() user: { id: string; role: number },
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.service.list(
      user,
      {
        status,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      msg,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết ticket + lịch sử trao đổi' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: number },
    @Lang() msg: Messages,
  ) {
    return this.service.findOne(id, user, msg);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Trả lời ticket' })
  reply(
    @Param('id') id: string,
    @Body() dto: ReplySupportTicketDto,
    @CurrentUser() user: { id: string; role: number },
    @Lang() msg: Messages,
  ) {
    return this.service.reply(id, dto, user, msg);
  }
}
