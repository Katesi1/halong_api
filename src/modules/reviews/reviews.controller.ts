import {
  Controller, Get, Post, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery,
  ApiResponse, ApiTags,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { HideReviewDto } from './dto/hide-review.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE, PERMISSION_ACTION } from '../../common/constants';
import { Permission } from '../../common/decorators/permission.decorator';
import type { Messages } from '../../i18n';

@ApiTags('Reviews')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
@Controller()
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Post('properties/:id/reviews')
  @Roles(ROLE.CUSTOMER)
  @ApiOperation({ summary: 'Khach tao review cho property', description: 'Customer role. Booking phai completed va chua review.' })
  @ApiResponse({ status: 201, description: 'Review created' })
  @ApiResponse({ status: 400, description: 'booking_not_completed / invalid_score' })
  @ApiResponse({ status: 403, description: 'not_your_booking' })
  @ApiResponse({ status: 409, description: 'already_reviewed' })
  createReview(
    @Param('id') propertyId: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.reviewsService.createReview(propertyId, dto, user, msg);
  }

  @Public()
  @Get('properties/:id/reviews')
  @ApiOperation({ summary: 'List reviews per property', description: 'Public. Phan trang + sort + filter.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'oldest', 'highest', 'lowest'] })
  @ApiQuery({ name: 'minRating', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Reviews list with summary' })
  listReviews(
    @Param('id') propertyId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('sort') sort: string,
    @Query('minRating') minRating: string,
    @Lang() msg: Messages,
  ) {
    return this.reviewsService.listReviews(
      propertyId,
      msg,
      page ? parseInt(page) : 1,
      pageSize ? Math.min(parseInt(pageSize), 50) : 20,
      sort || 'newest',
      minRating ? parseInt(minRating) : undefined,
    );
  }

  @Post('properties/:id/reviews/:reviewId/reply')
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @Permission(PERMISSION_MODULE.REVIEWS, PERMISSION_ACTION.UPDATE)
  @ApiOperation({ summary: 'Owner reply review', description: 'OWNER cua property hoac ADMIN.' })
  @ApiResponse({ status: 200, description: 'Reply saved' })
  @ApiResponse({ status: 404, description: 'review_not_found' })
  replyReview(
    @Param('id') propertyId: string,
    @Param('reviewId') reviewId: string,
    @Body() dto: ReplyReviewDto,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.reviewsService.replyReview(propertyId, reviewId, dto, user, msg);
  }

  @Get('admin/reviews')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN list reviews (with filters)' })
  @ApiQuery({ name: 'status', required: false, enum: ['visible', 'hidden', 'all'] })
  @ApiQuery({ name: 'rating', required: false, type: Number, description: '1-5 — filter star bucket' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  adminListReviews(
    @Query('status') status: 'visible' | 'hidden' | 'all',
    @Query('rating') rating: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Lang() msg: Messages,
  ) {
    return this.reviewsService.adminListReviews(
      {
        status,
        rating: rating ? parseInt(rating) : undefined,
        search,
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
      },
      msg,
    );
  }

  @Get('admin/reviews/count-flagged')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN dem so review da moderate (badge sidebar)' })
  countFlagged(@Lang() msg: Messages) {
    return this.reviewsService.countFlagged(msg);
  }

  @Get('admin/reviews/:reviewId')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN xem chi tiet review (kem property/customer/booking hydrated)' })
  adminGetReview(@Param('reviewId') reviewId: string, @Lang() msg: Messages) {
    return this.reviewsService.adminGetReview(reviewId, msg);
  }

  @Delete('admin/reviews/:reviewId')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN an review', description: 'Set is_hidden = true. Khong xoa row.' })
  @ApiResponse({ status: 200, description: 'Review hidden' })
  @ApiResponse({ status: 404, description: 'review_not_found' })
  hideReview(
    @Param('reviewId') reviewId: string,
    @Body() dto: HideReviewDto,
    @CurrentUser() admin: { id: string },
    @Lang() msg: Messages,
  ) {
    return this.reviewsService.hideReviewAsAdmin(admin.id, reviewId, dto, msg);
  }

  @Post('admin/reviews/:reviewId/restore')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN khoi phuc review da an' })
  restoreReview(
    @Param('reviewId') reviewId: string,
    @CurrentUser() admin: { id: string },
    @Lang() msg: Messages,
  ) {
    return this.reviewsService.restoreReviewAsAdmin(admin.id, reviewId, msg);
  }
}
