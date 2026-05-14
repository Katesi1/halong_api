import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Base Response ───────────────────────────────────────────────────────────

export class BaseResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Operation successful' })
  message: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Bad request' })
  message: string;

  @ApiPropertyOptional({ example: null })
  errors: any;

  @ApiProperty({ example: '/endpoint' })
  path: string;

  @ApiProperty({ example: '2026-04-11T00:00:00.000Z' })
  timestamp: string;
}

// ─── Property ────────────────────────────────────────────────────────────────

export class PropertyImageDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/...' })
  imageUrl: string;

  @ApiProperty({ example: true })
  isCover: boolean;

  @ApiProperty({ example: 0 })
  order: number;
}

export class PropertyDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Villa Vịnh Xanh' })
  name: string;

  @ApiProperty({ example: 0, description: '0=VILLA, 1=HOMESTAY, 2=HOTEL' })
  type: number;

  @ApiProperty({ example: 'VL001' })
  code: string;

  @ApiPropertyOptional({ example: 'sea', description: '"sea", "city", null' })
  view: string | null;

  @ApiPropertyOptional({ example: 'Bãi Cháy, Quảng Ninh' })
  address: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: 2 })
  bedrooms: number;

  @ApiProperty({ example: 1 })
  bathrooms: number;

  @ApiProperty({ example: 2 })
  standardGuests: number;

  @ApiProperty({ example: 4 })
  maxGuests: number;

  @ApiPropertyOptional({ example: 1500000 })
  weekdayPrice: number | null;

  @ApiPropertyOptional({ example: 2000000 })
  weekendPrice: number | null;

  @ApiPropertyOptional({ example: 2500000 })
  holidayPrice: number | null;

  @ApiPropertyOptional({ example: 200000 })
  adultSurcharge: number | null;

  @ApiPropertyOptional({ example: 100000 })
  childSurcharge: number | null;

  @ApiProperty({ example: ['Wifi', 'Điều hòa', 'Bể bơi'] })
  amenities: string[];

  @ApiProperty({ example: 0, description: '0=FLEXIBLE, 1=MODERATE, 2=STRICT' })
  cancellationPolicy: number;

  @ApiPropertyOptional({ example: 'Không hút thuốc trong phòng' })
  rules: string | null;

  @ApiProperty({ example: ['BBQ', 'Thuê xe máy'] })
  services: string[];

  @ApiPropertyOptional({ example: '14:00' })
  checkInTime: string | null;

  @ApiPropertyOptional({ example: '12:00' })
  checkOutTime: string | null;

  @ApiProperty({ type: [PropertyImageDto] })
  images: PropertyImageDto[];
}

// ─── Booking ─────────────────────────────────────────────────────────────────

export class BookingDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'uuid' })
  propertyId: string;

  @ApiPropertyOptional({ example: 'uuid' })
  saleId: string | null;

  @ApiPropertyOptional({ example: 'uuid' })
  customerId: string | null;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  customerName: string | null;

  @ApiPropertyOptional({ example: '0911222333' })
  customerPhone: string | null;

  @ApiProperty({ example: '2026-04-15T00:00:00.000Z' })
  checkinDate: Date;

  @ApiProperty({ example: '2026-04-17T00:00:00.000Z' })
  checkoutDate: Date;

  @ApiProperty({ example: 0, description: '0=HOLD, 1=CONFIRMED, 2=CANCELLED, 3=COMPLETED' })
  status: number;

  @ApiPropertyOptional({ example: '2026-04-15T00:30:00.000Z' })
  holdExpireAt: Date | null;

  @ApiPropertyOptional({ example: 500000 })
  depositAmount: number | null;

  @ApiProperty({ example: 2 })
  guestCount: number;

  @ApiProperty({ example: 1200, description: 'Số giây còn lại của hold (0 nếu không phải HOLD)' })
  holdRemainingSeconds: number;
}

// ─── Notification ────────────────────────────────────────────────────────────

export class NotificationDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Booking mới' })
  title: string;

  @ApiPropertyOptional({ example: 'Phòng C3-06 được đặt bởi Nguyễn Văn A' })
  subtitle: string | null;

  @ApiProperty({ example: 'booking', description: '"booking", "payment", "system"' })
  type: string;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ example: '2026-04-11T10:30:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: 'booking-uuid' })
  targetId: string | null;

  @ApiPropertyOptional({ example: 'booking' })
  targetType: string | null;
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export class CalendarDayDto {
  @ApiProperty({ example: '2026-04-01' })
  date: string;

  @ApiProperty({ example: 1500000 })
  price: number;

  @ApiProperty({ example: 'available', description: '"available", "hold", "booked", "locked"' })
  status: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  note?: string;
}

export class CalendarPropertyGridDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'VL001' })
  code: string;

  @ApiProperty({ example: 'Villa Vịnh Xanh' })
  name: string;

  @ApiProperty({ example: 0 })
  type: number;

  @ApiPropertyOptional({ example: 'sea' })
  view: string | null;

  @ApiPropertyOptional({ example: 'Bãi Cháy' })
  address: string | null;

  @ApiProperty({ type: [CalendarDayDto] })
  days: CalendarDayDto[];
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export class DashboardStatsDto {
  @ApiProperty({ example: 5 })
  totalRooms: number;

  @ApiProperty({ example: 4 })
  activeRooms: number;

  @ApiProperty({ example: 2 })
  emptyRooms: number;

  @ApiProperty({ example: 2 })
  occupiedRooms: number;

  @ApiProperty({ example: 20, description: 'Tổng phòng toàn hệ thống' })
  globalTotalRooms: number;

  @ApiProperty({ example: 12, description: 'Phòng trống toàn hệ thống' })
  globalEmptyRooms: number;

  @ApiProperty({ example: 1 })
  checkoutToday: number;

  @ApiProperty({ example: 15 })
  totalBookings: number;

  @ApiProperty({ example: 3 })
  thisMonthBookings: number;

  @ApiProperty({ example: 5000000 })
  monthlyRevenue: number;

  @ApiProperty({ example: 1500000 })
  todayRevenue: number;
}

export class ReportsDto extends DashboardStatsDto {
  @ApiProperty({ example: 1 })
  holdCount: number;

  @ApiProperty({ example: 5 })
  confirmedCount: number;

  @ApiProperty({ example: 2 })
  cancelledCount: number;

  @ApiProperty({ example: 3 })
  completedCount: number;

  @ApiProperty({ example: 3000000 })
  totalDeposit: number;

  @ApiProperty({ example: 45.5 })
  occupancyRate: number;

  @ApiProperty({ example: 3 })
  roomsWithCover: number;

  @ApiProperty({ example: 4 })
  roomsWithPrice: number;

  @ApiProperty({ type: [BookingDto] })
  recentBookings: BookingDto[];
}

// ─── User ────────────────────────────────────────────────────────────────────

export class UserDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  name: string;

  @ApiPropertyOptional({ example: '0912345678' })
  phone: string | null;

  @ApiPropertyOptional({ example: 'user@email.com' })
  email: string | null;

  @ApiProperty({ example: 0, description: '0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER' })
  role: number;

  @ApiProperty({ example: true })
  isActive: boolean;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export class LoginDataDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  refreshToken: string;

  @ApiProperty({ type: UserDto })
  user: UserDto;
}

// ─── Wrapped Responses (for Swagger Schema tab) ─────────────────────────────

export class LoginResponse extends BaseResponseDto {
  @ApiProperty({ type: LoginDataDto })
  data: LoginDataDto;
}

export class ProfileResponse extends BaseResponseDto {
  @ApiProperty({ type: UserDto })
  data: UserDto;
}

export class MessageResponse extends BaseResponseDto {
  @ApiProperty({ example: null, nullable: true, type: 'string' })
  data: any;
}

export class UserListResponse extends BaseResponseDto {
  @ApiProperty({ type: [UserDto] })
  data: UserDto[];
}

export class UserResponse extends BaseResponseDto {
  @ApiProperty({ type: UserDto })
  data: UserDto;
}

export class PropertyListResponse extends BaseResponseDto {
  @ApiProperty({ type: [PropertyDto] })
  data: PropertyDto[];
}

export class PropertyResponse extends BaseResponseDto {
  @ApiProperty({ type: PropertyDto })
  data: PropertyDto;
}

export class BookingListResponse extends BaseResponseDto {
  @ApiProperty({ type: [BookingDto] })
  data: BookingDto[];
}

export class BookingResponse extends BaseResponseDto {
  @ApiProperty({ type: BookingDto })
  data: BookingDto;
}

export class NotificationListResponse extends BaseResponseDto {
  @ApiProperty({ type: [NotificationDto] })
  data: NotificationDto[];
}

export class UnreadCountDataDto {
  @ApiProperty({ example: 3 })
  count: number;
}

export class UnreadCountResponse extends BaseResponseDto {
  @ApiProperty({ type: UnreadCountDataDto })
  data: UnreadCountDataDto;
}

export class CalendarGridDataDto {
  @ApiProperty({ type: [CalendarPropertyGridDto] })
  properties: CalendarPropertyGridDto[];
}

export class CalendarGridResponse extends BaseResponseDto {
  @ApiProperty({ type: CalendarGridDataDto })
  data: CalendarGridDataDto;
}

export class CalendarPropertyListDataDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'VL001' })
  code: string;

  @ApiProperty({ example: 'Villa Vịnh Xanh' })
  name: string;

  @ApiProperty({ example: 0 })
  type: number;
}

export class CalendarPropertyListResponse extends BaseResponseDto {
  @ApiProperty({ type: [CalendarPropertyListDataDto] })
  data: CalendarPropertyListDataDto[];
}

export class DashboardStatsResponse extends BaseResponseDto {
  @ApiProperty({ type: DashboardStatsDto })
  data: DashboardStatsDto;
}

export class ReportsResponse extends BaseResponseDto {
  @ApiProperty({ type: ReportsDto })
  data: ReportsDto;
}

export class AdminContactDto {
  @ApiProperty({ example: '0912345678' })
  phone: string;

  @ApiPropertyOptional({ example: 'admin@halong24h.vn' })
  email: string;
}

export class AdminContactResponse extends BaseResponseDto {
  @ApiProperty({ type: AdminContactDto })
  data: AdminContactDto;
}
