import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

@ApiTags('Audit Log')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private auditLogService: AuditLogService) {}

  @Get()
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'List audit log entries (ADMIN only)' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by exact action slug' })
  @ApiQuery({ name: 'targetType', required: false, description: 'user | property | booking | dispute | ...' })
  @ApiQuery({ name: 'actorId', required: false, description: 'Filter by actor user id' })
  @ApiQuery({ name: 'search', required: false, description: 'Match targetLabel or targetId' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date inclusive' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date inclusive' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @Query('action') action: string,
    @Query('targetType') targetType: string,
    @Query('actorId') actorId: string,
    @Query('search') search: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.auditLogService.list(
      {
        action,
        targetType,
        actorId,
        search,
        from,
        to,
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
      msg,
    );
  }
}
