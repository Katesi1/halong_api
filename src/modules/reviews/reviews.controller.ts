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
import { ROLE } from '../../common/constants';
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

  @Delete('admin/reviews/:reviewId')
  @Roles(ROLE.ADMIN)
  @ApiOperation({ summary: 'ADMIN an review', description: 'Set is_hidden = true. Khong xoa row.' })
  @ApiResponse({ status: 200, description: 'Review hidden' })
  @ApiResponse({ status: 404, description: 'review_not_found' })
  hideReview(
    @Param('reviewId') reviewId: string,
    @Body() dto: HideReviewDto,
    @Lang() msg: Messages,
  ) {
    return this.reviewsService.hideReview(reviewId, dto, msg);
  }
}
