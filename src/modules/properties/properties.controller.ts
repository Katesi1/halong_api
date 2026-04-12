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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';
import { PropertyListResponse, PropertyResponse, MessageResponse } from '../../common/dto/api-response.dto';

@ApiTags('Properties')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('properties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PropertiesController {
  constructor(private propertiesService: PropertiesService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Danh sách property công khai', description: 'Property active, có thể lọc theo ngày/khách/giá/type' })
  @ApiQuery({ name: 'checkinDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'checkoutDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'guests', required: false, type: Number })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: Number, description: '0=VILLA, 1=HOMESTAY, 2=HOTEL' })
  @ApiQuery({ name: 'view', required: false, description: '"sea" hoặc "city"' })
  @ApiResponse({ status: 200, type: PropertyListResponse })
  findPublic(
    @Query('checkinDate') checkinDate: string,
    @Query('checkoutDate') checkoutDate: string,
    @Query('guests') guests: string,
    @Query('minPrice') minPrice: string,
    @Query('maxPrice') maxPrice: string,
    @Query('type') type: string,
    @Query('view') view: string,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.findPublic(
      msg,
      checkinDate,
      checkoutDate,
      guests ? parseInt(guests) : undefined,
      minPrice ? parseFloat(minPrice) : undefined,
      maxPrice ? parseFloat(maxPrice) : undefined,
      type !== undefined ? parseInt(type) : undefined,
      view || undefined,
    );
  }

  @Get()
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Danh sách properties' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, description: 'Admin thấy cả property đang tắt' })
  @ApiQuery({ name: 'view', required: false, description: '"sea" hoặc "city"' })
  @ApiResponse({ status: 200, type: PropertyListResponse })
  findAll(
    @CurrentUser() user: any,
    @Query('includeInactive') includeInactive: string,
    @Query('view') view: string,
    @Lang() msg: Messages,
  ) {
    return this.propertiesService.findAll(user, msg, includeInactive === 'true', view || undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết property (tất cả authenticated user đều xem được)' })
  @ApiResponse({ status: 200, type: PropertyResponse })
  findOne(@Param('id') id: string, @Lang() msg: Messages) {
    return this.propertiesService.findOne(id, msg);
  }

  @Post()
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @ApiOperation({ summary: 'Tạo property (Admin/Owner only)' })
  @ApiResponse({ status: 201, type: PropertyResponse, description: 'Property đã tạo thành công (tự động tạo notification cho Admin)' })
  @ApiResponse({ status: 409, description: 'Mã code bị trùng' })
  create(@Body() dto: CreatePropertyDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.propertiesService.create(dto, user, msg);
  }

  @Patch(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({ summary: 'Cập nhật property (partial)' })
  @ApiResponse({ status: 200, type: PropertyResponse })
  update(@Param('id') id: string, @Body() dto: UpdatePropertyDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.propertiesService.update(id, dto, user, msg);
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN, ROLE.OWNER)
  @ApiOperation({ summary: 'Xóa property (Admin/Owner only, soft delete)' })
  @ApiResponse({ status: 200, type: MessageResponse })
  @ApiResponse({ status: 404, description: 'Property not found' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.propertiesService.remove(id, user, msg);
  }

  @Put(':id/prices')
  @Roles(ROLE.ADMIN, ROLE.OWNER, ROLE.SALE)
  @ApiOperation({
    summary: 'Cập nhật giá property',
    description: 'Tất cả fields optional — chỉ gửi field cần update. Fields: weekdayPrice, weekendPrice, holidayPrice, adultSurcharge, childSurcharge',
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
}
