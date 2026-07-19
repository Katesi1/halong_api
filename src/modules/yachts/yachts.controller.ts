import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { YachtsService } from './yachts.service';
import { CreateYachtDto } from './dto/create-yacht.dto';
import { UpdateYachtDto } from './dto/update-yacht.dto';
import { UpdateYachtPricesDto } from './dto/update-yacht-prices.dto';
import { SearchYachtsDto } from './dto/search-yachts.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';

type CallerUser = { id: string; role: number; scope?: string | null };

@ApiTags('Yachts')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false })
@Controller('yachts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class YachtsController {
  constructor(private yachtsService: YachtsService) {}

  // ─── Public ────────────────────────────────────────────────────────────────

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Danh sách du thuyền công khai (paginated)' })
  findPublic(@Query() dto: SearchYachtsDto, @Lang() msg: Messages) {
    return this.yachtsService.findPublic(dto, msg);
  }

  @Public()
  @Get('public/:id/calendar')
  @ApiOperation({ summary: 'Lịch trống của du thuyền theo tháng' })
  @ApiQuery({ name: 'year', required: true, type: Number })
  @ApiQuery({ name: 'month', required: true, type: Number, description: '1-12' })
  getCalendar(
    @Param('id') id: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Lang() msg: Messages,
  ) {
    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getUTCFullYear();
    const m = month ? parseInt(month, 10) : now.getUTCMonth() + 1;
    return this.yachtsService.getCalendar(id, y, m, msg);
  }

  @Public()
  @Get('public/:slug')
  @ApiOperation({ summary: 'Chi tiết du thuyền công khai theo slug' })
  findPublicDetail(@Param('slug') slug: string, @Lang() msg: Messages) {
    return this.yachtsService.findPublicDetail(slug, msg);
  }

  // ─── Quản trị (ADMIN + SALE hệ thống) ──────────────────────────────────────

  @Get()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Danh sách du thuyền (ADMIN + SALE hệ thống)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser() user: CallerUser,
    @Query('includeInactive') includeInactive: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Lang() msg: Messages,
  ) {
    return this.yachtsService.findAll(user, msg, {
      includeInactive: includeInactive === 'true',
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Chi tiết du thuyền (ADMIN + SALE hệ thống)' })
  findOne(@Param('id') id: string, @CurrentUser() user: CallerUser, @Lang() msg: Messages) {
    return this.yachtsService.findOne(id, user, msg);
  }

  @Post()
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Tạo du thuyền (chỉ ADMIN + SALE hệ thống)' })
  create(@Body() dto: CreateYachtDto, @CurrentUser() user: CallerUser, @Lang() msg: Messages) {
    return this.yachtsService.create(dto, user, msg);
  }

  @Put(':id')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Cập nhật du thuyền' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateYachtDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.yachtsService.update(id, dto, user, msg);
  }

  @Delete(':id')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Xoá du thuyền (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: CallerUser, @Lang() msg: Messages) {
    return this.yachtsService.remove(id, user, msg);
  }

  @Put(':id/prices')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Cập nhật bảng giá du thuyền (cả 5 field bắt buộc)' })
  updatePrices(
    @Param('id') id: string,
    @Body() dto: UpdateYachtPricesDto,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.yachtsService.updatePrices(id, dto, user, msg);
  }

  @Post(':id/images')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Upload ảnh du thuyền (multipart, field "images", tối đa 20 ảnh/lần)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } } },
  })
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
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.yachtsService.uploadImages(id, files, user, msg);
  }

  @Delete(':id/images/:imageId')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Xoá ảnh du thuyền' })
  deleteImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.yachtsService.deleteImage(id, imageId, user, msg);
  }

  @Patch(':id/images/:imageId/cover')
  @Roles(ROLE.ADMIN, ROLE.SALE)
  @ApiOperation({ summary: 'Đặt ảnh làm ảnh bìa' })
  setCoverImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: CallerUser,
    @Lang() msg: Messages,
  ) {
    return this.yachtsService.setCoverImage(id, imageId, user, msg);
  }
}
