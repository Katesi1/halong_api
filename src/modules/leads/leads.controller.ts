import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Leads')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('leads')
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Public()
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 req/phút/IP — chống spam form
  @ApiOperation({
    summary: 'Submit lead từ public form',
    description: 'Public endpoint — không cần auth. Rate-limit 10/phút/IP.',
  })
  create(@Body() dto: CreateLeadDto, @Lang() msg: Messages) {
    return this.leadsService.create(dto, msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get()
  @ApiOperation({ summary: 'List leads (OWNER/SALE: của mình; ADMIN: tất cả)' })
  @ApiQuery({ name: 'status', required: false, description: 'new | contacted | rejected | expired | converted' })
  @ApiQuery({ name: 'propertyId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @CurrentUser() user: { id: string; role: number; ownerId?: string | null },
    @Query('status') status: string,
    @Query('propertyId') propertyId: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.leadsService.list(
      user,
      {
        status,
        propertyId,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      msg,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lead' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: number; ownerId?: string | null },
    @Lang() msg: Messages,
  ) {
    return this.leadsService.findOne(id, user, msg);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật status / assign / notes' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: { id: string; role: number; ownerId?: string | null },
    @Lang() msg: Messages,
  ) {
    return this.leadsService.update(id, dto, user, msg);
  }
}
