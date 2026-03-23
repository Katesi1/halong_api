import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { Role } from '@prisma/client';
import type { Messages } from '../../i18n';

@ApiTags('Rooms')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('rooms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoomsController {
  constructor(private roomsService: RoomsService) {}

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Danh sách phòng công khai', description: 'Phòng active, có thể lọc theo ngày/khách/giá' })
  @ApiQuery({ name: 'checkinDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'checkoutDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'guests', required: false, type: Number })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  findPublic(
    @Query('checkinDate') checkinDate: string,
    @Query('checkoutDate') checkoutDate: string,
    @Query('guests') guests: string,
    @Query('minPrice') minPrice: string,
    @Query('maxPrice') maxPrice: string,
    @Lang() msg: Messages,
  ) {
    return this.roomsService.findPublic(
      msg,
      checkinDate,
      checkoutDate,
      guests ? parseInt(guests) : undefined,
      minPrice ? parseFloat(minPrice) : undefined,
      maxPrice ? parseFloat(maxPrice) : undefined,
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Danh sách phòng (nội bộ)', description: 'Có thể lọc theo homestayId' })
  findAll(@CurrentUser() user: any, @Query('homestayId') homestayId: string, @Lang() msg: Messages) {
    return this.roomsService.findAll(user, msg, homestayId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Chi tiết phòng' })
  findOne(@Param('id') id: string, @Lang() msg: Messages) {
    return this.roomsService.findOne(id, msg);
  }

  @Post()
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Tạo phòng (Admin/Staff)' })
  create(@Body() dto: CreateRoomDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.roomsService.create(dto, user, msg);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Cập nhật phòng' })
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.roomsService.update(id, dto, user, msg);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Xóa phòng' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.roomsService.remove(id, user, msg);
  }

  @Post(':id/images')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Upload ảnh phòng (multipart, tối đa 10 ảnh JPG/PNG/WEBP)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { images: { type: 'array', items: { type: 'string', format: 'binary' } } } } })
  @UseInterceptors(
    FilesInterceptor('images', 10, {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp)$/)) {
          return cb(new Error('Chỉ chấp nhận file ảnh JPG, PNG, WEBP'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadImages(
    @Param('id') roomId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.roomsService.uploadImages(roomId, files, user, msg);
  }

  @Delete(':id/images/:imageId')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Xóa ảnh phòng' })
  deleteImage(
    @Param('id') roomId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.roomsService.deleteImage(roomId, imageId, user, msg);
  }

  @Patch(':id/images/:imageId/cover')
  @Roles(Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Đặt ảnh làm ảnh bìa' })
  setCoverImage(
    @Param('id') roomId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: any,
    @Lang() msg: Messages,
  ) {
    return this.roomsService.setCoverImage(roomId, imageId, user, msg);
  }
}
