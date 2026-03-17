# AI CODING STANDARDS
## Hệ thống Quản lý & Phân phối Phòng Homestay

> Tài liệu này định nghĩa quy trình, tiêu chuẩn và quy tắc coding áp dụng
> cho toàn bộ dự án. Mọi thay đổi code phải tuân thủ các quy tắc dưới đây.

---

## 1. CẤU TRÚC DỰ ÁN

```
App/
├── backend/          NestJS API Server
├── mobile/           Flutter App (iOS + Android)
└── AI_CODING_STANDARDS.md
```

### 1.1 Backend — Cấu trúc module
```
backend/src/
├── common/
│   ├── decorators/   @CurrentUser, @Public, @Roles
│   ├── filters/      AllExceptionsFilter
│   ├── guards/       JwtAuthGuard, RolesGuard, PartnerApiKeyGuard
│   └── interceptors/ ResponseInterceptor
├── config/
│   ├── cloudinary.service.ts / .module.ts
│   └── redis.service.ts / .module.ts
├── prisma/
│   └── prisma.service.ts / .module.ts
└── modules/
    ├── auth/
    ├── users/
    ├── homestays/
    ├── rooms/
    ├── prices/
    ├── bookings/
    └── partner/
```

### 1.2 Flutter — Cấu trúc feature
```
mobile/lib/
├── core/
│   ├── constants/    api_constants.dart, app_constants.dart
│   ├── network/      api_client.dart, api_response.dart
│   ├── storage/      secure_storage.dart
│   ├── theme/        app_theme.dart
│   └── utils/        app_router.dart
├── data/
│   ├── models/       user_model, room_model, booking_model, homestay_model
│   └── repositories/ auth, room, booking, homestay, user
├── features/
│   ├── auth/
│   ├── rooms/
│   ├── bookings/
│   ├── homestays/
│   └── admin/
└── shared/
    ├── providers/    auth_provider.dart
    └── widgets/      app_scaffold, loading_widget
```

---

## 2. PHÂN QUYỀN (ROLES)

| Role  | Quyền hạn |
|-------|-----------|
| ADMIN | Full quyền: quản lý users, homestay, phòng, giá, booking |
| OWNER | CRUD homestay của mình, phòng, giá, xác nhận booking |
| SALE  | Xem phòng, giữ phòng 30 phút, quản lý booking của mình |

### Quy tắc Guard
- Mọi endpoint đều yêu cầu JWT (global `JwtAuthGuard`)
- Dùng `@Public()` decorator cho các route không cần auth (login, refresh)
- Dùng `@Roles(Role.ADMIN, Role.OWNER)` để giới hạn endpoint theo role
- Owner chỉ được thao tác với dữ liệu của mình (kiểm tra `ownerId` trong service)

---

## 3. TIÊU CHUẨN BACKEND (NestJS)

### 3.1 Cấu trúc mỗi Module
```
modules/<tên>/
├── dto/
│   ├── create-<tên>.dto.ts
│   └── update-<tên>.dto.ts
├── <tên>.controller.ts
├── <tên>.service.ts
└── <tên>.module.ts
```

### 3.2 DTO — Data Transfer Object
```typescript
// ĐÚNG: Luôn dùng class-validator decorators
export class CreateRoomDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên phòng không được để trống' })
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  bedrooms?: number;
}

// SAI: Không validate input
export class CreateRoomDto {
  name: string;
  bedrooms: number;
}
```

### 3.3 Service — Response Format
```typescript
// ĐÚNG: Luôn return { message, data }
// ResponseInterceptor sẽ wrap thành { success: true, message, data }
async findAll() {
  const items = await this.prisma.room.findMany();
  return { message: 'Lấy danh sách thành công', data: items };
}

// SAI: Return thẳng array
async findAll() {
  return this.prisma.room.findMany();
}
```

### 3.4 Error Handling
```typescript
// ĐÚNG: Dùng NestJS built-in exceptions
throw new NotFoundException('Phòng không tồn tại');
throw new ForbiddenException('Không có quyền truy cập');
throw new ConflictException('Mã phòng đã tồn tại');
throw new BadRequestException('Ngày check-out phải sau check-in');

// SAI: Throw Error thường
throw new Error('Not found');
```

### 3.5 Prisma — Database Access
```typescript
// ĐÚNG: Chỉ select fields cần thiết (tránh leak dữ liệu nhạy cảm)
const user = await this.prisma.user.findUnique({
  where: { id },
  select: { id: true, name: true, phone: true, role: true },
});

// SAI: Select tất cả (có thể lộ password, refreshToken)
const user = await this.prisma.user.findUnique({ where: { id } });
```

### 3.6 Soft Delete
```typescript
// ĐÚNG: Dùng soft delete (isActive = false)
await this.prisma.room.update({
  where: { id },
  data: { isActive: false },
});

// SAI: Hard delete (mất dữ liệu lịch sử)
await this.prisma.room.delete({ where: { id } });
```

### 3.7 API Response Format
Mọi API response đều tuân theo format:
```json
{
  "success": true,
  "message": "Mô tả kết quả",
  "data": { ... }
}
```
Lỗi:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Mô tả lỗi",
  "path": "/api/v1/rooms",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 4. TIÊU CHUẨN FLUTTER

### 4.1 Naming Conventions
```
Screens    : XxxScreen   (RoomListScreen, LoginScreen)
Widgets    : XxxWidget   (RoomCard, BookingTile)
Providers  : xxxProvider (roomListProvider, authProvider)
Models     : XxxModel    (RoomModel, BookingModel)
Repos      : XxxRepository (RoomRepository)
```

### 4.2 State Management — Riverpod
```dart
// ĐÚNG: FutureProvider cho async data
final roomListProvider = FutureProvider.family<List<RoomModel>, String?>(
  (ref, homestayId) async {
    final repo = ref.read(roomRepositoryProvider);
    final result = await repo.getRooms(homestayId: homestayId);
    if (result.success) return result.data!;
    throw Exception(result.message);
  },
);

// ĐÚNG: StateNotifier cho state phức tạp (auth)
class AuthNotifier extends StateNotifier<AuthState> { ... }
```

### 4.3 API Call Pattern
```dart
// ĐÚNG: Luôn dùng ApiResponse wrapper, xử lý cả success/error
final result = await repo.createRoom(data);
if (result.success) {
  // handle success
} else {
  // show error: result.message
}

// SAI: Try-catch trực tiếp trong UI
try {
  final room = await dio.post('/rooms', data: data);
} catch (e) { ... }
```

### 4.4 Navigation — GoRouter
```dart
// ĐÚNG: Dùng context.go() cho replace, context.push() cho stack
context.go('/rooms');         // Replace (bottom nav)
context.push('/rooms/$id');   // Push (back button)
context.pop();                // Back

// SAI: Navigator.push (bypass GoRouter)
Navigator.push(context, MaterialPageRoute(builder: (_) => ...));
```

### 4.5 Widget Build Rules
```dart
// ĐÚNG: Xử lý đủ 3 case của AsyncValue
roomAsync.when(
  loading: () => const LoadingWidget(),
  error: (e, _) => ErrorWidget_(message: e.toString(), onRetry: ...),
  data: (rooms) => ...,
);

// SAI: Chỉ xử lý data
if (roomAsync.hasValue) { ... }
```

### 4.6 Image Loading
```dart
// ĐÚNG: Luôn dùng CachedNetworkImage
CachedNetworkImage(
  imageUrl: url,
  fit: BoxFit.cover,
  placeholder: (_, __) => const ShimmerPlaceholder(),
  errorWidget: (_, __, ___) => const Icon(Icons.broken_image),
)

// SAI: Image.network (không cache)
Image.network(url)
```

---

## 5. QUY TRÌNH THÊM TÍNH NĂNG MỚI

### 5.1 Backend
```
1. Cập nhật Prisma schema (nếu cần thêm bảng/field)
   → prisma/schema.prisma

2. Chạy migration
   → npx prisma migrate dev --name <tên_thay_đổi>

3. Tạo DTO
   → src/modules/<module>/dto/

4. Cập nhật Service
   → Thêm business logic, kiểm tra quyền role

5. Cập nhật Controller
   → Thêm endpoint, gắn @Roles() nếu cần

6. Export Module nếu cần dùng ở module khác
```

### 5.2 Flutter
```
1. Cập nhật Model (nếu API thay đổi response)
   → lib/data/models/

2. Cập nhật Repository (thêm API call)
   → lib/data/repositories/

3. Tạo/cập nhật Provider
   → lib/features/<feature>/providers/

4. Tạo/cập nhật Screen
   → lib/features/<feature>/screens/

5. Đăng ký route (nếu screen mới)
   → lib/core/utils/app_router.dart

6. Thêm vào BottomNav (nếu cần)
   → lib/shared/widgets/app_scaffold.dart
```

---

## 6. QUẢN LÝ MÔI TRƯỜNG

### 6.1 Backend — .env
```
# KHÔNG commit .env vào git
# Chỉ commit .env.example
.env          → thông tin thật (gitignored)
.env.example  → template không có giá trị thật
```

### 6.2 Flutter — API URL
```dart
// lib/core/constants/api_constants.dart
// Thay đổi baseUrl theo môi trường:

// Android emulator
static const String baseUrl = 'http://10.0.2.2:3000/api/v1';

// iOS simulator
static const String baseUrl = 'http://localhost:3000/api/v1';

// Production
static const String baseUrl = 'https://api.yourdomaim.com/api/v1';
```

---

## 7. BẢO MẬT

### 7.1 Không bao giờ
- Commit `.env` hoặc file chứa credentials lên git
- Log access token / password ra console
- Return `password` hoặc `refreshToken` trong API response
- Dùng `Role.ADMIN` mặc định khi tạo user

### 7.2 Luôn luôn
- Hash password bằng bcrypt (cost factor = 10)
- Validate input với DTO trước khi vào service
- Kiểm tra ownership trước khi UPDATE/DELETE
- Dùng HTTPS trên production
- Set JWT expiry ngắn (15 phút) + refresh token (7 ngày)

### 7.3 Image Upload
- Validate MIME type: chỉ `image/jpeg`, `image/png`, `image/webp`
- Giới hạn file size: tối đa 10MB/file
- Giới hạn số ảnh: tối đa 20 ảnh/phòng
- Upload lên Cloudinary, không lưu file trên server

---

## 8. TÀI KHOẢN MẶC ĐỊNH

| Thông tin | Giá trị |
|-----------|---------|
| Username  | `Admin` |
| Password  | `Abcd@1234` |
| Role      | `ADMIN` |

> ⚠️ Đổi password ngay sau khi deploy production

---

## 9. GIT WORKFLOW

```
main          → production code (stable)
develop       → integration branch
feature/<tên> → tính năng mới
fix/<tên>     → bug fixes
```

### Commit Message Format
```
feat: thêm chức năng giữ phòng 30 phút
fix: sửa lỗi calendar không load đúng tháng
refactor: tách RoomCard thành component riêng
chore: cập nhật dependencies
docs: cập nhật AI_CODING_STANDARDS
```

---

## 10. CHECKLIST TRƯỚC KHI COMMIT

### Backend
- [ ] `npx tsc --noEmit` — không có TypeScript error
- [ ] DTO đã validate đầy đủ input
- [ ] Service đã kiểm tra quyền role
- [ ] Response đúng format `{ message, data }`
- [ ] Không có `console.log` debug trong code

### Flutter
- [ ] `flutter analyze` — no issues
- [ ] AsyncValue.when xử lý đủ 3 case
- [ ] Không hard-code URL, string dùng constants
- [ ] Dispose controller trong `dispose()`
- [ ] Không có unused import

---

## 11. GHI CHÚ CỤ THỂ CHO DỰ ÁN NÀY

### 11.1 Backend
- **CORS**:
  - Dev: có thể tạm dùng `origin: '*'`.
  - Prod: **bắt buộc** cấu hình danh sách domain cụ thể (không để `*`).
- **JWT**:
  - Secret phải lấy từ biến môi trường (`JWT_SECRET`, `JWT_REFRESH_SECRET`).
  - Không dùng secret mặc định trong production.
- **Partner API Key**:
  - Header chuẩn: `X-Partner-Key`.
  - Guard `PartnerApiKeyGuard` phải:
    - Validate tồn tại và `isActive = true`.
    - Gán `request.partner` để downstream có thể dùng.

### 11.2 Flutter/Mobile
- **Theme**:
  - Tất cả screen phải dùng `AppTheme` và `AppColors`, không hard-code màu "magic number" trong UI mới.
  - Button, input, card ưu tiên dùng style mặc định từ `AppTheme`.
- **Scaffold + Bottom Nav**:
  - Screen chính phải bọc trong `AppScaffold` để đảm bảo app bar, avatar user, và bottom navigation thống nhất.
  - Khi thêm tab mới:
    - Cập nhật route trong `app_router.dart`.
    - Cập nhật `_BottomNav` trong `app_scaffold.dart` cho khớp route.
- **API Call**:
  - Không dùng trực tiếp `Dio` trong UI; luôn gọi qua Repository (`AuthRepository`, `RoomRepository`, `BookingRepository`, ...) và trả về `ApiResponse`.
  - Khi xử lý lỗi, ưu tiên dùng `parseDioError` để thông báo message thống nhất.
- **AsyncValue**:
  - Khi dùng `FutureProvider`/`StreamProvider`, UI bắt buộc dùng `when(loading, error, data)`:
    - `loading`: dùng `LoadingWidget` hoặc skeleton tương ứng.
    - `error`: dùng `ErrorWidget_` với nút "Thử lại" nếu có thể retry.
    - `data`: render nội dung, nếu list rỗng dùng `EmptyWidget`.

---

*Cập nhật lần cuối: 2026-03-14 (bổ sung ghi chú backend/mobile)*
