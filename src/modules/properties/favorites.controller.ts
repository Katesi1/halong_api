import {
  Controller,
  Delete,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';
import {
  MessageResponse,
  PropertySearchResponse,
} from '../../common/dto/api-response.dto';

@ApiTags('Favorites')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE.CUSTOMER)
@Controller()
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Post('properties/:id/favorite')
  @ApiOperation({
    summary: 'Lưu property vào danh sách yêu thích (idempotent)',
    description:
      'Chỉ CUSTOMER. Gọi 2 lần không lỗi. Property không active / đã xoá → 404.',
  })
  @ApiResponse({ status: 201, type: MessageResponse })
  add(
    @Param('id') propertyId: string,
    @CurrentUser() user: { id: string },
    @Lang() msg: Messages,
  ) {
    return this.favorites.add(user.id, propertyId, msg);
  }

  @Delete('properties/:id/favorite')
  @ApiOperation({
    summary: 'Bỏ favorite (idempotent — xoá row không tồn tại không lỗi)',
  })
  @ApiResponse({ status: 200, type: MessageResponse })
  remove(
    @Param('id') propertyId: string,
    @CurrentUser() user: { id: string },
    @Lang() msg: Messages,
  ) {
    return this.favorites.remove(user.id, propertyId, msg);
  }

  @Get('users/me/favorites')
  @ApiOperation({
    summary: 'Danh sách property user đã favorite (paginated, mới nhất trước)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '1-50, default 20' })
  @ApiResponse({ status: 200, type: PropertySearchResponse })
  list(
    @CurrentUser() user: { id: string },
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.favorites.list(
      user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      msg,
    );
  }
}
