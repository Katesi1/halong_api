import {
  Controller, Get, Post, Put, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HomestaysService } from './homestays.service';
import { CreateHomestayDto } from './dto/create-homestay.dto';
import { UpdateHomestayDto } from './dto/update-homestay.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { Role } from '@prisma/client';
import type { Messages } from '../../i18n';

@ApiTags('Homestays')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('homestays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HomestaysController {
  constructor(private homestaysService: HomestaysService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách homestay' })
  findAll(@CurrentUser() user: any, @Lang() msg: Messages) {
    return this.homestaysService.findAll(user, msg);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết homestay' })
  findOne(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.homestaysService.findOne(id, user, msg);
  }

  @Post()
  @Roles(Role.ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Tạo homestay (Admin/Owner)' })
  create(@Body() dto: CreateHomestayDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.homestaysService.create(dto, user, msg);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Cập nhật homestay' })
  update(@Param('id') id: string, @Body() dto: UpdateHomestayDto, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.homestaysService.update(id, dto, user, msg);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.OWNER)
  @ApiOperation({ summary: 'Xóa homestay' })
  remove(@Param('id') id: string, @CurrentUser() user: any, @Lang() msg: Messages) {
    return this.homestaysService.remove(id, user, msg);
  }
}
