import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
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
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký', description: 'Đăng ký tài khoản STAFF hoặc CUSTOMER. Trả token luôn (auto-login)' })
  register(@Body() dto: RegisterDto, @Lang() msg: Messages) {
    return this.authService.register(dto, msg);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập', description: 'Trả về accessToken và refreshToken' })
  login(@Body() dto: LoginDto, @Lang() msg: Messages) {
    return this.authService.login(dto, msg);
  }

  @Public()
  @Post('google')
  @ApiOperation({ summary: 'Đăng nhập Google', description: 'Đăng nhập/đăng ký bằng Google ID Token. User mới cần field role.' })
  googleAuth(@Body() dto: GoogleAuthDto, @Lang() msg: Messages) {
    return this.authService.googleAuth(dto, msg);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Làm mới token', description: 'Đổi refreshToken lấy accessToken mới' })
  refresh(@Body() dto: RefreshTokenDto, @Lang() msg: Messages) {
    return this.authService.refreshToken(dto.refreshToken, msg);
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Quên mật khẩu', description: 'Gửi mã xác nhận qua SMS/email' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Lang() msg: Messages) {
    return this.authService.forgotPassword(dto, msg);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Đặt lại mật khẩu', description: 'Đặt lại mật khẩu bằng token' })
  resetPassword(@Body() dto: ResetPasswordDto, @Lang() msg: Messages) {
    return this.authService.resetPassword(dto, msg);
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

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Đổi mật khẩu', description: 'Đổi mật khẩu khi đang đăng nhập' })
  changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Lang() msg: Messages,
  ) {
    return this.authService.changePassword(userId, dto, msg);
  }
}
