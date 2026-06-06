import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConsentsService } from './consents.service';
import { UpdateConsentsDto } from './dto/update-consents.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Consents')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/me/consents')
export class ConsentsController {
  constructor(private service: ConsentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy consent của tôi (kyc + marketing). Trả mặc định nếu chưa có.',
  })
  get(@CurrentUser() user: { id: string }, @Lang() msg: Messages) {
    return this.service.get(user.id, msg);
  }

  @Put()
  @ApiOperation({
    summary: 'Cập nhật consent. Lưu ý: kyc bị khoá server-side.',
  })
  update(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateConsentsDto,
    @Lang() msg: Messages,
  ) {
    return this.service.update(user.id, dto, msg);
  }
}
