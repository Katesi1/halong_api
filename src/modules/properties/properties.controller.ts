import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UpdatePricesDto } from './dto/update-prices.dto';
import { RejectPropertyDto, SuspendPropertyDto } from './dto/moderation.dto';
import { SearchPropertiesDto } from './dto/search-properties.dto';
import { SetHotDto } from './dto/set-hot.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE, PERMISSION_MODULE, PERMISSION_ACTION } from '../../common/constants';
import { Permission } from '../../common/decorators/permission.decorator';
import type { Messages } from '../../i18n';
import {
  PropertyListResponse,
  PropertyResponse,
  MessageResponse,
  PropertyCardListResponse,
  PropertySearchResponse,
  PublicPropertyDetailResponse,
} from '../../common/dto/api-response.dto';

@ApiTags('Properties')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertiesController {
  constructor(private propertiesService: PropertiesService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('public')
  @ApiOperation({
    summary: 'Danh sách property công khai (array phẳng — mobile legacy)',
    description:
      'Property active, có thể lọc theo ngày/khách/giá/type/view. Trả về PropertyCardDto[] (slug, rating, reviewCount, minPrice, isGuestFavorite, coverImageUrl, isFavorited). Web khách hàng nên dùng GET /properties/search (paginated + filter đầy đủ). Gửi kèm Authorization header → isFavorited được populate; anonymous → luôn false.',
  })
  @ApiQuery({ name: 'checkinDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'checkoutDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'guests', required: false, type: Number, description: 'Số khách tối thiểu (so với maxGuests cả căn)' })
  @ApiQuery({ name: 'adults', required: false, type: Number, description: 'Số người lớn tối thiểu (so với standardGuests)' })
  @ApiQuery({ name: 'children', required: false, type: Number, description: 'Số trẻ em tối thiểu (so với standardChildren)' })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: Number, description: '0=VILLA, 1=HOMESTAY, 2=HOTEL' })
  @ApiQuery({ name: 'view', required: false, description: 'sea | city | mountain | garden | pool' })
  @ApiResponse({ status: 200, type: PropertyCardListResponse })
  findPublic(
    @Query('checkinDate') checkinDate: string,
    @Query('checkoutDate') checkoutDate: string,
    @Query('guests') guests: string,
    @Query('minPrice') minPrice: string,
    @Query('maxPrice') maxPrice: string,
    @Query('type') type: string,
    @Query('view') view: string,
    @Query('adults') adults: string,
    @Query('children') children: string,
    @CurrentUser() user: { id: string } | null,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.findPublic(
      msg,
      checkinDate,
      checkoutDate,
      guests ? parseInt(guests) : undefined,
      minPrice ? parseFloat(minPrice) : undefined,
      maxPrice ? parseFloat(maxPrice) : undefined,
      type !== undefined && type !== '' ? parseInt(type) : undefined,
      view || undefined,
      user?.id ?? null,
      adults ? parseInt(adults) : undefined,
      children !== undefined && children !== '' ? parseInt(children) : undefined,
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('search')
  @ApiOperation({
    summary: 'Search property công khai (paginated, dùng cho customer web)',
    description:
      'Full filter (amenities, bedrooms, minRating, view, type, price, q), sort (price_asc | price_desc | rating | newest | featured), pagination. Trả { items, total, page, limit, totalPages }. Optional Authorization header: nếu có → populate isFavorited cho từng item; ngoài ra hỗ trợ ?favorited=true để lọc chỉ những property user đã save (yêu cầu auth, anonymous → 403).',
  })
  @ApiResponse({ status: 200, type: PropertySearchResponse })
  findSearch(
    @Query() dto: SearchPropertiesDto,
    @CurrentUser() user: { id: string } | null,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.findSearch(dto, user?.id ?? null, msg);
  }

  @Public()
  @Get('public/:slug')
  @ApiOperation({
    summary: 'Chi tiết property công khai theo slug (customer web)',
    description:
      'Tra theo slug (vd /properties/public/b1503-03). Trả full data: giá (weekday/weekend/holiday), description/rules/services/amenities, ảnh, rating breakdown, host info (KHÔNG kèm phone/email). Chỉ trả property active. Slug không tồn tại / inactive → 404.',
  })
  @ApiResponse({ status: 200, type: PublicPropertyDetailResponse })
  @ApiResponse({ status: 404, description: 'Slug not found / property inactive' })
  findPublicDetail(@Param('slug') slug: string, @Lang() msg: Messages) {
    return this.propertiesService.findPublicDetail(slug, msg);
  }

  @Public()
  @Get('public/:slug/similar')
  @ApiOperation({
    summary: 'Cơ sở tương tự (carousel "Cơ sở khác")',
    description:
      'Trả danh sách property cùng khu vực/loại theo slug nguồn. Ưu tiên cùng district → cùng city → cùng type. Sort isHot desc → ratingAvg desc → reviewCount desc. Loại bỏ chính property nguồn + inactive/deleted/rejected.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số lượng tối đa (1-20, default 8)' })
  @ApiResponse({ status: 200, description: 'PropertyCardDto[]' })
  @ApiResponse({ status: 404, description: 'Slug not found / property inactive' })
  findSimilarBySlug(
    @Param('slug') slug: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.findSimilarBySlug(slug, limit ? parseInt(limit) : 8, msg);
  }

  @Public()
  @Get('public/by-owner/:ownerId')
  @ApiOperation({
    summary: 'Danh sách phòng công khai của 1 chủ nhà (no auth)',
    description:
      'Dùng cho web "lịch phòng" mà chủ nhà copy link gắn vào nhóm Zalo. SALE click link, không cần đăng nhập, thấy hết phòng đang hoạt động của chủ nhà đó + SĐT để gọi Zalo. Trả PropertyCardDto[] + owner { id, name, phone, avatarUrl }. Owner bị banned / inactive → 404.',
  })
  @ApiResponse({ status: 200, description: 'OK — { owner, items, total }' })
  @ApiResponse({ status: 404, description: 'Owner not found / inactive / banned' })
  findPublicByOwner(@Param('ownerId') ownerId: string, @Lang() msg: Messages) {
    return this.propertiesService.findPublicByOwner(ownerId, msg);
  }

  @Public()
  @Get('share/:id')
  @ApiOperation({ summary: 'Thông tin property công khai (share link)', description: 'Trả về thông tin property không bao gồm giá, dùng cho share link khách hàng' })
  @ApiResponse({ status: 200, type: PropertyResponse })
  @ApiResponse({ status: 404, description: 'Property not found' })
  findShareDetail(@Param('id') id: string, @Lang() msg: Messages) {
    return this.propertiesService.findShareDetail(id, msg);
  }

  @Get()
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES, PERMISSION_ACTION.READ)
  @ApiOperation({ summary: 'Danh sách properties' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, description: 'Admin thấy cả property đang tắt' })
  @ApiQuery({ name: 'view', required: false, description: '"sea" hoặc "city"' })
  @ApiQuery({ name: 'moderationStatus', required: false, enum: ['pending', 'approved', 'rejected', 'suspended'], description: 'Lọc theo trạng thái duyệt — dùng cho admin tab "Chờ duyệt / Đã duyệt / Từ chối / Tạm ngưng"' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Phân trang (opt-in). Truyền page/limit → data trả { items, total, page, limit, totalPages }; không truyền → trả mảng như cũ.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số item/trang (mặc định 20, tối đa 100). Chỉ có tác dụng khi phân trang.' })
  @ApiResponse({ status: 200, type: PropertyListResponse })
  findAll(
    @CurrentUser() user: any,
    @Query('includeInactive') includeInactive: string,
    @Query('view') view: string,
    @Query('moderationStatus') moderationStatus: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    const allowed = ['pending', 'approved', 'rejected', 'suspended'] as const;
    const ms = allowed.includes(moderationStatus as any) ? (moderationStatus as typeof allowed[number]) : undefined;
    const pagination =
      page !== undefined || limit !== undefined
        ? { page: page !== undefined ? Number(page) : undefined, limit: limit !== undefined ? Number(limit) : undefined }
        : undefined;
    return this.propertiesService.findAll(user, msg, includeInactive === 'true', view || undefined, ms, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết property (tất cả authenticated user đều xem được)' })
  @ApiResponse({ status: 200, type: PropertyResponse })
  findOne(@Param('id') id: string, @Lang() msg: Messages) {
    return this.propertiesService.findOne(id, msg);
  }

  @Post()
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @Permission(PERMISSION_MODULE.PROPERTIES, PERMISSION_ACTION.CREATE)
  @ApiOperation({ summary: 'Tạo property (Admin/Owner only)' })
  @ApiResponse({ status: 201, type: PropertyResponse, description: 'Property đã tạo thành công (tự động tạo notification cho Admin)' })
  @ApiResponse({ status: 409, description: 'Mã code bị trùng' })
  create(@Body() dto: CreatePropertyDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.propertiesService.create(dto, user, msg);
  }

  @Patch(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES, PERMISSION_ACTION.UPDATE)
  @ApiOperation({ summary: 'Cập nhật property (partial)' })
  @ApiResponse({ status: 200, type: PropertyResponse })
  update(@Param('id') id: string, @Body() dto: UpdatePropertyDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.propertiesService.update(id, dto, user, msg);
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @Permission(PERMISSION_MODULE.PROPERTIES, PERMISSION_ACTION.DELETE)
  @ApiOperation({ summary: 'Xóa property (Admin/Owner only, soft delete)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  @ApiResponse({ status: 404, description: 'Property not found' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.propertiesService.remove(id, user, msg);
  }

  @Put(':id/prices')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES, PERMISSION_ACTION.UPDATE)
  @ApiOperation({
    summary: 'Cập nhật giá property',
    description: 'Tất cả 5 fields đều BẮT BUỘC, không được để trống/null: weekdayPrice, weekendPrice, holidayPrice, adultSurcharge, childSurcharge',
  })
  @ApiResponse({ status: 200, type: PropertyResponse })
  updatePrices(
    @Param('id') id: string,
    @Body() dto: UpdatePricesDto,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.updatePrices(id, dto, user, msg);
  }

  @Post(':id/images')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES, PERMISSION_ACTION.UPDATE)
  @ApiOperation({
    summary: 'Upload ảnh property (multipart, tối đa 20 ảnh JPG/PNG/WEBP)',
    description: 'Gửi multipart/form-data, field name: images. Max 20 ảnh/lần, max 10MB/ảnh. Ảnh đầu tiên tự động set cover nếu chưa có ảnh.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
  @ApiResponse({ status: 201, type: PropertyResponse })
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp)$/)) {
          return cb(new Error('Chỉ chấp nhận file ảnh JPG, PNG, WEBP'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024, files: 20 },
    }),
  )
  uploadImages(
    @Param('id') propertyId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.uploadImages(propertyId, files, user, msg);
  }

  @Delete(':id/images/:imageId')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES, PERMISSION_ACTION.UPDATE)
  @ApiOperation({ summary: 'Xóa ảnh property' })
  @ApiResponse({ status: 200, type: MessageResponse })
  deleteImage(
    @Param('id') propertyId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.deleteImage(propertyId, imageId, user, msg);
  }

  @Patch(':id/images/:imageId/cover')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES, PERMISSION_ACTION.UPDATE)
  @ApiOperation({ summary: 'Đặt ảnh làm ảnh bìa' })
  @ApiResponse({ status: 200, type: MessageResponse })
  setCoverImage(
    @Param('id') propertyId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.setCoverImage(propertyId, imageId, user, msg);
  }

  // ─── Admin moderation ─────────────────────────────────────────────────────

  @Post(':id/approve')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES_MODERATION, 'canUpdate')
  @ApiOperation({ summary: 'ADMIN duyệt property (chuyển moderationStatus → approved)' })
  approveProperty(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.approveProperty(user.id, id, msg);
  }

  @Post(':id/reject')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES_MODERATION, 'canUpdate')
  @ApiOperation({ summary: 'ADMIN từ chối property' })
  rejectProperty(
    @Param('id') id: string,
    @Body() dto: RejectPropertyDto,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.rejectProperty(user.id, id, dto.reason, msg);
  }

  @Post(':id/suspend')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES_MODERATION, 'canUpdate')
  @ApiOperation({ summary: 'ADMIN tạm ngưng property đang hoạt động' })
  suspendProperty(
    @Param('id') id: string,
    @Body() dto: SuspendPropertyDto,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.suspendProperty(user.id, id, dto.reason, msg);
  }

  @Patch(':id/hot')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @Permission(PERMISSION_MODULE.PROPERTIES_MODERATION, 'canUpdate')
  @ApiOperation({
    summary: 'ADMIN bật/tắt badge "Hot" cho property',
    description:
      'Hot property nổi lên đầu khi sort=featured và filter ?hot=true. Body { isHot: true|false }.',
  })
  @ApiResponse({ status: 200, type: PropertyResponse })
  setHot(
    @Param('id') id: string,
    @Body() dto: SetHotDto,
    @CurrentUser() user: { id: string },
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.setHot(user.id, id, dto.isHot, msg);
  }
}
