import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { YachtReviewsService } from './yacht-reviews.service';
import { CreateYachtReviewDto } from './dto/create-yacht-review.dto';
import { HideYachtReviewDto, ReplyYachtReviewDto } from './dto/yacht-review-moderation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

type CallerUser = { id: string; role: number; scope?: string | null };

@ApiTags('Yacht Reviews')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('yachts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class YachtReviewsController {
  constructor(private service: YachtReviewsService) {}

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: 'Danh sách đánh giá du thuyền (public, kèm summary)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'oldest', 'highest', 'lowest'] })
  @ApiQuery({ name: 'minRating', required: false, type: Number })
  list(
    @Param('id') yachtId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('sort') sort: 'newest' | 'oldest' | 'highest' | 'lowest',
    @Query('minRating') minRating: string,
    @Lang() msg: Messages,
  ) {
    return this.service.listReviews(
      yachtId,
      msg,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      sort ?? 'newest',
      minRating ? parseFloat(minRating) : undefined,
    );
  }

  @Post(':id/reviews')
  @ApiOperation({ summary: 'Khách đánh giá du thuyền (sau khi qua ngày kết thúc hành trình)' })
  create(
    @Param('id') yachtId: string,
    @Body() dto: CreateYachtReviewDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.service.createReview(yachtId, dto, user, msg);
  }

  @Post(':id/reviews/:reviewId/reply')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Hệ thống phản hồi đánh giá (ADMIN + SALE hệ thống)' })
  reply(
    @Param('reviewId') reviewId: string,
    @Body() dto: ReplyYachtReviewDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.service.replyReview(reviewId, dto, user, msg);
  }
}

@ApiTags('Yacht Reviews (Admin)')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('admin/yacht-reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminYachtReviewsController {
  constructor(private service: YachtReviewsService) {}

  @Get()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Danh sách đánh giá du thuyền (moderation)' })
  @ApiQuery({ name: 'status', required: false, enum: ['visible', 'hidden', 'all'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  adminList(
    @CurrentUser() user: CallerUser,
    @Query('status') status: 'visible' | 'hidden' | 'all',
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Lang() msg: Messages,
  ) {
    return this.service.adminList(
      user,
      {
        status,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
      msg,
    );
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Ẩn đánh giá' })
  hide(
    @Param('id') id: string,
    @Body() dto: HideYachtReviewDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.service.hideReview(id, dto, user, msg);
  }

  @Post(':id/restore')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Khôi phục đánh giá đã ẩn' })
  restore(@Param('id') id: string, @CurrentUser() user: CallerUser, @Lang() msg: Messages) {
    return this.service.restoreReview(id, user, msg);
  }
}
