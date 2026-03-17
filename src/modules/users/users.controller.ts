import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { Role } from '@prisma/client';
import type { Messages } from '../../i18n';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách user (Admin)' })
  findAll(@Query('role') role: Role, @Lang() msg: Messages) {
    return this.usersService.findAll(msg, role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết user' })
  findOne(@Param('id') id: string, @Lang() msg: Messages) {
    return this.usersService.findOne(id, msg);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo user mới' })
  create(@Body() dto: CreateUserDto, @Lang() msg: Messages) {
    return this.usersService.create(dto, msg);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Cập nhật user' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Lang() msg: Messages) {
    return this.usersService.update(id, dto, msg);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa user' })
  remove(@Param('id') id: string, @CurrentUser('id') currentUserId: string, @Lang() msg: Messages) {
    return this.usersService.remove(id, currentUserId, msg);
  }
}
