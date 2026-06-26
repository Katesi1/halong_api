import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';
import { GuestsService } from './guests.service';
import { ListGuestsDto } from './dto/list-guests.dto';

@ApiTags('Guests')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('guests')
export class GuestsController {
  constructor(private guestsService: GuestsService) {}

  @Get()
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({
    summary: 'List guests (CUSTOMER users) with booking stats + label',
    description: 'Label heuristic: vip ≥5 completed, regular ≥2 completed, new <2, restricted = bannedAt set.',
  })
  list(@Query() dto: ListGuestsDto, @Lang() msg: Messages) {
    return this.guestsService.list(dto, msg);
  }

  @Get(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Guest detail + last 50 bookings' })
  getOne(@Param('id') id: string, @Lang() msg: Messages) {
    return this.guestsService.getOne(id, msg);
  }
}
