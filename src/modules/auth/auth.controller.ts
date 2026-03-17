import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Lang } from '../../common/decorators/lang.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { Messages } from '../../i18n';

@ApiTags('Auth')
@ApiHeader({ name: 'Accept-Language', enum: ['en', 'vi'], required: false, description: 'Ngôn ngữ phản hồi (mặc định: en)' })
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập', description: 'Trả về accessToken và refreshToken' })
  login(@Body() dto: LoginDto, @Lang() msg: Messages) {
    return this.authService.login(dto, msg);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Làm mới token', description: 'Đổi refreshToken lấy accessToken mới' })
  refresh(@Body() dto: RefreshTokenDto, @Lang() msg: Messages) {
    return this.authService.refreshToken(dto.refreshToken, msg);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Đăng xuất', description: 'Vô hiệu hóa refresh token' })
  logout(@CurrentUser('id') userId: string, @Lang() msg: Messages) {
    return this.authService.logout(userId, msg);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy thông tin user đăng nhập' })
  getProfile(@CurrentUser('id') userId: string, @Lang() msg: Messages) {
    return this.authService.getProfile(userId, msg);
  }
}
