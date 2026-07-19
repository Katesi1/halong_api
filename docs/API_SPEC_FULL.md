# Halong24h Backend — Full API Spec for Frontend

> Tài liệu chính thức cho team FE Web (Next.js admin/host) và App Mobile (Android/iOS).
> Bao gồm tất cả endpoint, schema response, business rule, WebSocket guide và integration checklist.
>
> **Cập nhật**: 2026-07-13 (v1.41 — Bắt buộc OWNER có SĐT trước khi đăng/sửa cơ sở + mời SALE → 403 `PHONE_REQUIRED`. Xem §2A.5, changelog §21) · **BE base**: NestJS 11 · **DB**: PostgreSQL + Prisma · **Auth**: JWT · **Real-time**: Socket.IO

---

## Mục lục

1. [Quy ước chung](#1-quy-ước-chung)
2. [Auth & RBAC](#2-auth--rbac)
2A. [**Phân quyền & Authorization — ĐỌC TRƯỚC KHI WIRE**](#2a-phân-quyền--authorization--quy-tắc-tổng)
3. [Users](#3-users)
4. [Properties](#4-properties)
5. [Bookings](#5-bookings)
6. [Calendar](#6-calendar)
7. [Reviews](#7-reviews)
8. [Notifications & Devices](#8-notifications--devices)
9. [KYC](#9-kyc)
10. [Payment & Subscription](#10-payment--subscription)
11. [Staff Invites](#11-staff-invites)
12. [Permissions](#12-permissions)
13. [Disputes](#13-disputes)
14. [Audit Log](#14-audit-log)
15. [Leads](#15-leads)
16. [Admin Emails](#16-admin-emails)
17. [Chat (REST + WebSocket)](#17-chat-rest--websocket)
18. [App Version](#18-app-version)
19. [Enums reference](#19-enums-reference)
20. [FE integration checklist](#20-fe-integration-checklist)
21. [Changelog & Bug fixes](#21-changelog--bug-fixes)
22. [FE Q&A — Confirms & Design decisions](#22-fe-qa--confirms--design-decisions)
23. [Uploads — Generic file upload cho Chat & các module khác](#23-uploads--generic-file-upload)
24. [Mobile Profile Endpoints](#24-mobile-profile-endpoints-support--feedback--data-export--consents--notification-prefs)
25. [FE Web Admin v2 — Bổ sung 2026-06-23](#25-fe-web-admin-v2--bổ-sung-2026-06-23)
26. [**System SALE — Admin-grade SALE (v1.15)**](#26-system-sale--admin-grade-sale-v115--2026-06-26)
27. [**Du thuyền (Yachts) — v1.40**](#27-du-thuyền-yachts--v140--2026-07-13)

---

## 1. Quy ước chung

### 1.1 Base URL

| Environment | URL |
|---|---|
| Production | `https://api.halong24h.com` |
| Dev (nếu có) | `http://localhost:3000` |

Không có prefix `/api/v1`. Endpoint gọi thẳng `/auth/login`, `/properties`...

### 1.2 Headers

| Header | Bắt buộc | Mô tả |
|---|---|---|
| `Authorization: Bearer <accessToken>` | Có (trừ endpoint `Public`) | JWT access token (15 phút) |
| `Accept-Language` | Không | `vi` (mặc định) hoặc `en` — quyết định ngôn ngữ message |
| `Content-Type: application/json` | Có (POST/PUT/PATCH) | Trừ multipart upload |
| `X-Partner-Key` | Có (partner only) | Chỉ cho `/partner/*` |
| `X-Client-Type` | Nên (v1.19+) | `mobile` (app Android/iOS/Flutter) hoặc `web` (browser). Chỉ ảnh hưởng 5 endpoint auth cấp token (`/auth/login|register|google|apple`, `/staff/invites/accept`). Xem §1.6.1 |

### 1.3 Response envelope

**Thành công (2xx)**:
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": { ... }
}
```

**Lỗi (4xx/5xx)**:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": {
    "email": ["Email đã được sử dụng"],
    "password": ["Mật khẩu phải có ít nhất 8 ký tự"]
  },
  "path": "/auth/register",
  "timestamp": "2026-06-04T10:30:00.000Z"
}
```

FE đọc `errors[field]` để hiện inline error per-field.

### 1.4 HTTP status mapping

| Status | Ý nghĩa | Hành động FE |
|---|---|---|
| 200/201 | OK | Đọc `data` |
| 400 | Validation lỗi | Hiển thị `errors` từng field |
| 401 | Token sai/hết hạn | Tự gọi `/auth/refresh`, retry. Fail → logout |
| 403 | Không có quyền | Toast `message` |
| 404 | Không tìm thấy | "Không tìm thấy..." |
| 409 | Conflict (trùng email, trùng date, ...) | Hiển thị `message` |
| 410 | Gone (token đã dùng / expired) | Hiển thị `message` |
| 422 | Validation | Như 400 |
| 429 | Rate limit | "Quá nhiều yêu cầu, thử lại sau" |
| 5xx | Server error | Toast + retry exponential backoff 3 lần |

> **Global DB error mapping (v1.24 · 2026-07-05)** — Trước đây lỗi ràng buộc DB (trùng unique, không tìm thấy row, sai khoá ngoại) chưa được service bắt sẽ rơi ra **500 thô**. Từ v1.24, `AllExceptionsFilter` tự dịch lỗi Prisma phổ biến sang HTTP status hợp lý + `code` máy-đọc-được, **áp dụng cho MỌI endpoint**:
>
> | Lỗi DB | HTTP | `code` | `message` | Extra |
> |---|---|---|---|---|
> | Trùng unique (P2002) | **409** | `DUPLICATE_ENTRY` | "Dữ liệu đã tồn tại (bị trùng)" | `conflictFields: string[]` (vd `["phone"]`) |
> | Không tìm thấy row để update/delete (P2025) | **404** | `NOT_FOUND` | "Không tìm thấy dữ liệu" | — |
> | Sai khoá ngoại (P2003) | **400** | `INVALID_REFERENCE` | "Dữ liệu tham chiếu không hợp lệ" | — |
> | Giá trị sai/quá dài (P2000/P2005/P2006), Prisma validation | **400** | `INVALID_DATA` / `PRISMA_VALIDATION` | "Dữ liệu không hợp lệ" | — |
>
> Đây là **lưới an toàn** — endpoint có message nghiệp vụ riêng vẫn trả message cụ thể trước (vd tạo/sửa user trùng phone → 409 "Số điện thoại đã được đăng ký"). FE nên ưu tiên đọc `message` để hiển thị; dùng `code` khi cần phân nhánh logic. `conflictFields` giúp FE highlight đúng ô bị trùng.

### 1.5 Kiểu dữ liệu

| Kiểu | Format | Ví dụ |
|---|---|---|
| Date chỉ ngày | `YYYY-MM-DD` | `2026-06-15` |
| DateTime | ISO 8601 UTC | `2026-06-04T10:30:00.000Z` |
| Tiền VND | Integer (không thập phân) | `1500000` = 1.500.000đ |
| Phone | 10 số bắt đầu `0` | `0901234567` |
| UUID | 36 ký tự v4 | `7c9e6679-7425-40de-944b-e07fc1f90ae7` |

### 1.6 Rate limit

| Nhóm | Giới hạn |
|---|---|
| `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` | 5 req/giờ/IP |
| `/auth/login`, `/auth/google`, `/auth/apple` | 10 req/15 phút/IP |
| `/staff/invites/verify/:token`, `/leads (POST public)` | 10 req/phút/IP |
| Mặc định | 100 req/phút/IP (qua ThrottlerGuard) |

Vượt → `429 Too Many Requests`.

### 1.6.1 Client type — Session slot (v1.19+, 2026-07-01)

> **Đây là section BẮT BUỘC đọc cho cả team Web và App.** Nếu wire sai, user sẽ bị đá session ngẫu nhiên hoặc không refresh được token.

#### 1.6.1.1 Business rule

Hệ thống giới hạn phiên đăng nhập song song **theo loại client**:

| Loại | Số phiên tối đa đồng thời |
|---|---|
| App native (Android + iOS + Flutter) | **1 phiên** |
| Web browser (mọi trình duyệt, mọi tab của cùng browser) | **1 phiên** |
| Tổng cộng | **2 phiên** (1 app + 1 web) |

**Ví dụ hành vi:**

| Kịch bản | Kết quả |
|---|---|
| User đang login app iPhone + đang login web Chrome | ✅ Cả 2 chạy song song |
| User đang login app iPhone, cài app trên iPad rồi login | iPhone bị đá, iPad thắng |
| User đang login web Chrome, mở web Firefox rồi login | Chrome bị đá, Firefox thắng |
| User đang login web Chrome, đăng nhập lại trên app Android | ✅ Cả 2 vẫn chạy (khác slot) |
| Admin gọi ban / revoke-sessions / user đổi password | Đá **cả 2** phiên |
| User bấm Logout trên app | Web KHÔNG bị đá |
| User bấm Logout trên web | App KHÔNG bị đá |

#### 1.6.1.2 Cách phía FE báo BE mình là mobile hay web

Gửi header `X-Client-Type` với 1 trong 2 giá trị `mobile` | `web` khi gọi **5 endpoint cấp token**:

| Endpoint | Mô tả |
|---|---|
| `POST /auth/register` | Đăng ký |
| `POST /auth/login` | Đăng nhập email/phone + password |
| `POST /auth/google` | Đăng nhập Google |
| `POST /auth/apple` | Đăng nhập Apple |
| `POST /staff/invites/accept` | Accept invite tạo SALE |

**KHÔNG cần** gửi header cho các endpoint khác (bao gồm `/auth/refresh`, `/auth/logout`, `/auth/profile`, ...). Lý do: JWT phát ra ở lần login đã nhúng sẵn `clientType` trong payload — refresh/logout đọc từ token.

**Giá trị chấp nhận** (BE `normalizeClientType` tự nhận diện):

| FE gửi | BE hiểu là |
|---|---|
| `mobile`, `app`, `ios`, `android` | `mobile` |
| `web`, hoặc chuỗi khác | `web` |
| Không gửi | Default: `/auth/apple` → `mobile`; các endpoint còn lại → `web` |

#### 1.6.1.3 Snippet code theo platform

**Web (Axios interceptor — Next.js admin, customer web):**

```typescript
import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL, // https://api.halong24h.com
});

// Attach X-Client-Type cho mọi request (harmless cho endpoint không cần)
api.interceptors.request.use((config) => {
  config.headers['X-Client-Type'] = 'web';
  return config;
});
```

**Flutter (Dio interceptor — dùng chung Android + iOS):**

```dart
import 'package:dio/dio.dart';
import 'dart:io' show Platform;

final dio = Dio(BaseOptions(baseUrl: 'https://api.halong24h.com'));

dio.interceptors.add(InterceptorsWrapper(
  onRequest: (options, handler) {
    options.headers['X-Client-Type'] = 'mobile';
    // Optional: chi tiết platform cho analytics BE
    // options.headers['X-Device-Platform'] = Platform.isIOS ? 'ios' : 'android';
    handler.next(options);
  },
));
```

**iOS native (Swift + URLSession):**

```swift
extension URLRequest {
    mutating func addClientTypeHeader() {
        self.setValue("mobile", forHTTPHeaderField: "X-Client-Type")
    }
}

// Hoặc dùng URLSessionConfiguration.default để set global
let config = URLSessionConfiguration.default
config.httpAdditionalHeaders = ["X-Client-Type": "mobile"]
let session = URLSession(configuration: config)
```

**Android native (Kotlin + OkHttp interceptor):**

```kotlin
val clientTypeInterceptor = Interceptor { chain ->
    val request = chain.request().newBuilder()
        .header("X-Client-Type", "mobile")
        .build()
    chain.proceed(request)
}

val okHttp = OkHttpClient.Builder()
    .addInterceptor(clientTypeInterceptor)
    .build()
```

#### 1.6.1.4 Hiện tượng khi phiên bị đá + cách handle

Khi 1 device khác cùng loại login → phiên hiện tại bị đá **NGAY** (v1.37+): JWT nhúng `sid` (session id), mỗi request BE so `sid` với phiên hiện tại trong DB — login mới đổi `sid` nên **access token cũ bị 401 ngay ở request kế tiếp**, KHÔNG chờ hết 15 phút. Request đang chạy bị **401** (do phiên bị đá, không phải token hết hạn) → FE thử refresh → refresh token cũ cũng đã bị ghi đè → **403** → logout. Chi tiết refresh:

```http
POST /auth/refresh
{ "refreshToken": "<token cũ>" }

→ 403 Forbidden
{
  "success": false,
  "statusCode": 403,
  "message": "Refresh token không hợp lệ",
  "code": "invalidRefreshToken"
}
```

**FE phải làm gì khi nhận 403 ở `/auth/refresh`**:

1. Xoá tokens local (Keychain / EncryptedSharedPreferences / cookie).
2. Xoá state user (Redux/Zustand/Riverpod).
3. Hiển thị toast: **"Tài khoản đã đăng nhập ở thiết bị khác. Vui lòng đăng nhập lại."**
4. Chuyển user về màn login.

**Không** retry endpoint gốc. **Không** hiển thị error kỹ thuật "Invalid refresh token".

**Web (Axios response interceptor)**:

```typescript
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // 401 access token expire → try refresh
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data } = await api.post('/auth/refresh', {
          refreshToken: tokenStorage.getRefreshToken(),
        });
        tokenStorage.save(data.data.accessToken, data.data.refreshToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch (refreshErr: any) {
        // 403 → phiên bị đá do login ở thiết bị khác
        if (refreshErr.response?.status === 403) {
          tokenStorage.clear();
          store.dispatch(clearUser());
          toast.error('Tài khoản đã đăng nhập ở thiết bị khác. Vui lòng đăng nhập lại.');
          router.push('/login');
        }
        throw refreshErr;
      }
    }
    throw error;
  },
);
```

**Flutter (Dio auth interceptor)**:

```dart
class AuthInterceptor extends Interceptor {
  final AuthService authService;
  final Dio dio;
  AuthInterceptor(this.authService, this.dio);

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401 && err.requestOptions.extra['retry'] != true) {
      try {
        await authService.refresh();
        final opts = err.requestOptions;
        opts.extra['retry'] = true;
        opts.headers['Authorization'] = 'Bearer ${authService.accessToken}';
        final response = await dio.fetch(opts);
        return handler.resolve(response);
      } on DioException catch (refreshErr) {
        if (refreshErr.response?.statusCode == 403) {
          // Phiên bị đá do login ở device khác
          await authService.logoutLocal(); // clear tokens + state, KHÔNG gọi API
          navigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (_) => false);
          ScaffoldMessenger.of(navigatorKey.currentContext!).showSnackBar(
            const SnackBar(content: Text('Tài khoản đã đăng nhập ở thiết bị khác. Vui lòng đăng nhập lại.')),
          );
        }
        return handler.next(refreshErr);
      }
    }
    return handler.next(err);
  }
}
```

#### 1.6.1.5 Logout — chỉ đá phiên hiện tại

`POST /auth/logout` (Bearer required) chỉ clear cột `refreshTokenMobile` HOẶC `refreshTokenWeb` tương ứng với `clientType` trong access token đang gọi. Phiên còn lại (nếu có) **không bị ảnh hưởng**.

Ví dụ:
- User đang login app + web.
- User bấm Logout trên web → BE clear `refreshTokenWeb`. App tiếp tục hoạt động bình thường.
- User bấm Logout trên app → BE clear `refreshTokenMobile`. Web tiếp tục hoạt động bình thường.

**Nếu FE muốn "Đăng xuất khỏi tất cả thiết bị"**: hiện chưa có endpoint dedicated. Workaround: dùng flow đổi mật khẩu (`POST /auth/change-password`) — flow này chưa clear session, cần bổ sung sau. Hoặc admin gọi `POST /users/:id/revoke-sessions`.

> **Roadmap**: bổ sung `POST /auth/logout-all` (Bearer) — clear cả 2 cột — nếu FE cần. Chưa implement ở v1.19, mở ticket khi cần.

#### 1.6.1.6 JWT payload

Payload access + refresh token giờ có field mới:

```jsonc
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "role": 1,
  "clientType": "mobile",   // ← NEW v1.19: "mobile" | "web"
  "iat": 1735689600,
  "exp": 1735690500
}
```

FE **không cần** decode payload — chỉ BE dùng để phân định slot. FE truyền refresh token nguyên bản qua body `POST /auth/refresh`, BE tự trích `clientType` từ signature-verified payload.

#### 1.6.1.7 Backward-compat khi deploy

Token phát **trước v1.19** không có `clientType` trong payload. BE dùng fallback:

- Xem như phiên `web` (default).
- Compare refresh token với cột legacy `refreshToken` (cũ) → nếu match → issue token mới vào cột `refreshTokenWeb`.

**Tác động thực tế:**
- User đang login web-only → không cảm nhận gì. Lần refresh tiếp theo tự "migrate" sang cột `web`.
- User đang login app-only → sau lần refresh, session được xem là `web`. Nếu sau đó có ai login web → app bị đá. **Đề xuất**: FE App deploy đồng thời với BE để header `X-Client-Type: mobile` xuất hiện ngay lần login mới → migrate sang cột `mobile` đúng slot.
- User đang login cả web + app: sau khi deploy, một trong hai (cái refresh sau) sẽ chiếm cột `web` → cái còn lại bị đá 1 lần khi refresh. Sau khi FE App wire `X-Client-Type: mobile` và user login lại app → phiên app vào slot `mobile`, không đá web nữa.

#### 1.6.1.8 Test cases để FE tự verify

**Test 1 — App + Web song song (case đúng)**:
- Login web Chrome → OK.
- Login app iPhone (cùng account) → OK, web KHÔNG bị đá.
- Web gọi API bất kỳ → OK (còn hoạt động).
- App gọi API bất kỳ → OK.

**Test 2 — 2 web browser**:
- Login web Chrome → OK.
- Login web Firefox (cùng account) → OK.
- Đợi 15 phút (hoặc trigger refresh trên Chrome bằng cách để access token hết hạn).
- Chrome gọi API → 401 → tự refresh → 403 → logout local, toast.
- Firefox: hoạt động bình thường.

**Test 3 — 2 app device**:
- Login iPhone → OK.
- Login iPad (cùng account) → OK.
- iPhone refresh sau khi access token hết → 403 → logout local, toast.
- iPad: hoạt động bình thường.

**Test 4 — Logout không đá phiên còn lại**:
- Login web + app.
- Bấm logout trên web → OK.
- App vẫn hoạt động bình thường (thử gọi `GET /auth/profile`).

**Test 5 — Ban đá tất cả**:
- Login web + app.
- Admin gọi `POST /users/:id/ban { reason: "..." }`.
- Web refresh → 401 access hết hạn → refresh → 401 `accountDisabled`.
- App refresh → tương tự.
- Cả 2 device đều logout.

**Test 6 — Header sai giá trị**:
- Login với header `X-Client-Type: xyz` → BE normalize về `web` → OK (không lỗi).
- Login không gửi header trên `/auth/login` → BE default `web` → OK.
- Login không gửi header trên `/auth/apple` → BE default `mobile` → OK.

#### 1.6.1.9 Checklist migration cho FE

**Web (Next.js admin + customer)**:
- [ ] Thêm interceptor Axios/Fetch gắn `X-Client-Type: web` cho mọi request.
- [ ] Response interceptor: 401 → refresh → 403 → clear local + toast + redirect login.
- [ ] Toast message chuẩn: "Tài khoản đã đăng nhập ở thiết bị khác. Vui lòng đăng nhập lại."
- [ ] Verify test case 2 (2 browser), test case 4 (logout không đá app).

**App (Flutter chung Android + iOS)**:
- [ ] Thêm interceptor Dio gắn `X-Client-Type: mobile` cho mọi request.
- [ ] Auth interceptor: 401 → refresh → 403 → `logoutLocal()` (xoá tokens + state, KHÔNG gọi API) + Snackbar + navigate login.
- [ ] Verify test case 3 (2 device), test case 4.

**iOS native (nếu có app Swift riêng)**:
- [ ] `URLSessionConfiguration.httpAdditionalHeaders = ["X-Client-Type": "mobile"]`.
- [ ] Handler cho refresh flow như trên.

**Android native (nếu có app Kotlin riêng)**:
- [ ] OkHttp interceptor gắn `X-Client-Type: mobile`.
- [ ] Authenticator handle 403 → clear tokens + redirect login.

### 1.7 Token refresh flow

| Token | TTL |
|---|---|
| `accessToken` | **15 phút** |
| `refreshToken` | **14 ngày** |

```
Request gốc → 401
  ↓ (Authenticator lock mutex)
POST /auth/refresh { refreshToken } → tokens mới
  ↓
Lưu access + refresh mới (httpOnly cookie / EncryptedSharedPreferences)
  ↓
Retry request gốc
  ↓ Nếu refresh fail (401) → logout về /login
```

> Refresh token rotate mỗi lần gọi `/auth/refresh` (token cũ bị invalidate qua bcrypt-compare với hash trong DB). Hết 14 ngày không hoạt động → user phải login lại.

---

## 2. Auth & RBAC

### 2.1 Roles

| Code | Role | Tạo bằng |
|---|---|---|
| `0` | ADMIN | Seed trong DB |
| `1` | OWNER | Tự đăng ký |
| `2` | SALE | Owner mời qua staff invite hoặc admin tạo |
| `3` | CUSTOMER | Tự đăng ký |

### 2.2 Endpoints

| Method | Path | Auth | Body |
|---|---|---|---|
| `POST` | `/auth/register` | Public | `{ name, email, password, role: 1\|3, phone? }` — `role=1` (OWNER) được BE tự cấp **trial ngầm 60 ngày** (`subscriptionStatus="trial"`, `trialEndsAt = now + 60d`). FE iOS không hiển thị trial; xem §2A.5 “Subscription / entitlement required”. |
| `POST` | `/auth/login` | Public | `{ identifier, password }` (`identifier` = email hoặc phone) |
| `POST` | `/auth/google` | Public | `{ idToken, role? }` (`role` bắt buộc cho user mới) — user mới với `role=1` cũng được cấp trial ngầm 60 ngày như `/auth/register`. |
| `POST` | `/auth/apple` | Public | `{ idToken, role?, email?, name?, identityToken? }` — user mới với `role=1` được cấp trial ngầm 60 ngày. |
| `POST` | `/auth/refresh` | Public | `{ refreshToken }` |
| `POST` | `/auth/forgot-password` | Public | `{ identifier }` — `identifier` = email **hoặc** phone đã đăng ký. BE gửi link reset (hết hạn **10 phút**) qua email nếu user có email + SMTP đã cấu hình. Luôn trả `200 success` kể cả khi user không tồn tại (chống enumeration). SMS chưa hỗ trợ — user chỉ có phone phải dùng email khác để reset. |
| `POST` | `/auth/reset-password` | Public | `{ token, newPassword }` — `token` là JWT (purpose='reset') lấy từ query `?token=...` trong link email. `newPassword` ≥ 6 ký tự. Sau khi reset BE clear `refreshToken` → mọi device bị logout. |
| `POST` | `/auth/logout` | Bearer | — |
| `GET` | `/auth/profile` | Bearer | — |
| `POST` | `/auth/change-password` | Bearer | `{ currentPassword, newPassword }` |

### 2.3 Response shape — Pattern QUAN TRỌNG cho cả Web và Mobile

> ⚠️ **BREAKING từ v1.7 (2026-06-05)** — Tất cả endpoint auth KHÔNG trả `user` object nữa. Chỉ trả `accessToken` + `refreshToken`. FE phải gọi `GET /auth/profile` riêng để lấy thông tin user.
>
> Lý do: tách concern (login = cấp token, profile = đọc info). Pattern này là **industry standard** — Auth0, Firebase Auth, OAuth 2.0 / OIDC đều theo cách này.

#### Response của `/login`, `/register`, `/google`, `/apple`, `/refresh`:

```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

**KHÔNG còn** `data.user`. Nếu FE đang parse `data.user.xxx` → sẽ crash `undefined`.

#### Response của `POST /staff/invites/accept`:

Cũng cùng pattern (chỉ tokens, không có user).

#### NGOẠI LỆ — Google/Apple sign-in với user mới chưa chọn role

Khi user lần đầu Google/Apple sign-in và chưa truyền `role` trong body → BE KHÔNG cấp tokens, mà trả:

```json
{
  "success": true,
  "message": "Vui lòng chọn vai trò để hoàn tất đăng ký",
  "data": {
    "isNewUser": true,
    "googleProfile": { "email": "...", "name": "...", "avatar": "...", "sub": "..." }
    // hoặc "appleProfile": { ... } cho Apple
  }
}
```

FE phải prompt user chọn `role` (OWNER hoặc CUSTOMER), gọi lại `/google` hoặc `/apple` kèm `role` → lúc đó BE mới trả tokens. Pattern này KHÔNG đổi.

### 2.4 Flow chuẩn cho FE (cả Web + Mobile)

#### Sau khi login thành công, GỌI THÊM 1 REQUEST để lấy user info:

```typescript
// Pattern đúng — 2 request
async function login(identifier: string, password: string) {
  // Step 1: cấp tokens
  const loginRes = await api.post('/auth/login', { identifier, password });
  const { accessToken, refreshToken } = loginRes.data;
  await tokenStorage.save(accessToken, refreshToken);

  // Step 2: lấy user info
  const profile = await fetchProfile();
  state.setUser(profile);

  return profile;
}

async function fetchProfile() {
  // HTTP client đã attach Authorization header qua interceptor
  const res = await api.get('/auth/profile');
  return res.data; // shape ở §2.5
}
```

#### Khi nào gọi `/auth/profile`?

| Trường hợp | Có cần gọi? |
|---|---|
| Ngay sau `/login`, `/register`, `/google`, `/apple` thành công | ✅ Bắt buộc |
| App khởi động lại có refresh token cũ → auto-login | ✅ Gọi để sync state (subscription có thể đã đổi) |
| Sau `/auth/refresh` (token hết hạn) | ⚠️ Optional — chỉ cần nếu nghi state user đã đổi |
| Sau khi update profile (`PATCH /users/:id`) | ✅ Re-fetch để sync |
| Sau khi user thanh toán thành công (`subscriptionStatus` đổi) | ✅ Re-fetch hoặc đợi FCM push rồi gọi |
| Mỗi lần gọi API khác | ❌ KHÔNG — không cần spam endpoint |

#### Sai lầm thường gặp

❌ **SAI**: Parse `loginRes.data.user.role` → undefined → app crash với "thiếu thông tin người dùng"

✅ **ĐÚNG**: 
```typescript
await tokenStorage.save(loginRes.data.accessToken, loginRes.data.refreshToken);
const user = await api.get('/auth/profile');
state.setUser(user.data);
```

### 2.5 GET /auth/profile — Shape đầy đủ

```json
{
  "success": true,
  "message": "Profile retrieved",
  "data": {
    "id": "uuid",
    "name": "Test Owner",
    "email": "owner-test@halong24h.com",
    "phone": "0900000001",
    "avatar": "https://...",
    "role": 1,
    "ownerId": null,
    "scope": "owner",
    "isActive": true,
    "emailVerified": true,
    "gender": null,
    "dateOfBirth": null,
    "bankBin": "970436",
    "bankName": "Vietcombank",
    "bankAccountNumber": "0123456789",
    "bankAccountName": "NGUYEN VAN A",
    "bankStatus": "approved",
    "bankRejectReason": null,
    "kycBypass": false,
    "kycStatus": "approved",
    "isKycVerified": true,
    "subscriptionStatus": "trial",
    "subscriptionPlanId": "rooms_5",
    "subscriptionCycle": "monthly",
    "subscriptionProvider": null,
    "subscriptionPriceOverride": null,
    "subscriptionFrozenAt": null,
    "subscriptionFrozenReason": null,
    "trialEndsAt": "2026-06-12T15:32:13.062Z",
    "nextChargeAt": "2026-06-12T15:32:13.062Z",
    "currentPeriodStart": "2026-06-06T00:00:00.000Z",
    "currentPeriodEnd": "2026-07-06T00:00:00.000Z",
    "pendingPlanId": null,
    "pendingCycle": null,
    "pendingEffectiveAt": null,
    "deletionScheduledAt": null,
    "permissions": [],
    "createdAt": "2026-06-05T15:21:20.741Z",
    "updatedAt": "2026-06-05T15:39:23.505Z"
  }
}
```

> **`scope` (`'owner' | 'system'`)** — profile **luôn trả** field này (đã có sẵn ở runtime). Dùng để FE phân biệt **SALE hệ thống** (`role=2 && scope='system'` → admin-grade, xem §26) với SALE thuộc OWNER (`role=2 && scope='owner'`). Các role khác (ADMIN/OWNER/CUSTOMER) mang `scope='owner'` vô nghĩa — bỏ qua. FE web quản lý muốn mở `/admin/*` cho SALE hệ thống: gate theo `role===0 || (role===2 && scope==='system')` thay vì chặn cứng `role!==0`.

> **Thông tin nhận tiền OWNER** — 4 field `bankBin` / `bankName` / `bankAccountNumber` / `bankAccountName` (đều `string | null`) = **giá trị ĐÃ DUYỆT** (dùng sinh VietQR cho khách trả cọc, xem `paymentInfo` trong BookingDto §5.3). `bankBin` = mã NAPAS 6 số; `bankAccountNumber` = 6–20 số.
>
> ⚠️ **BREAKING (v1.21)** — `PUT /users/:id` **KHÔNG còn nhận** 4 field bank (bị strip cho non-admin). OWNER tạo/sửa tài khoản nhận tiền phải qua luồng **duyệt bởi ADMIN**: `PUT /users/me/bank` → chờ ADMIN approve mới áp vào bank* live (xem §3.3). Profile trả thêm `bankStatus: 'none' | 'pending' | 'approved' | 'rejected'` + `bankRejectReason: string | null` để FE hiển thị trạng thái. Các role khác vẫn có field nhưng thường `null`.

`permissions[]` chỉ có entries cho SALE (qua module `UserPermission`):
```json
"permissions": [
  { "module": "properties", "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false },
  { "module": "bookings",   "canCreate": true,  "canRead": true,  "canUpdate": true,  "canDelete": false }
]
```
Với ADMIN/OWNER/CUSTOMER → `permissions: []` (mảng rỗng, KHÔNG phải `undefined`).

**`isKycVerified`** (derived flag, đọc-only) = `kycBypass === true || kycStatus === 'approved'`. FE app dùng cờ này để quyết định banner:

- `isKycVerified = true` + `kycStatus = 'approved'` → user tự nộp KYC và được duyệt → ẩn banner KYC.
- `isKycVerified = true` + `kycBypass = true` (kèm bất kỳ `kycStatus` nào, kể cả `none/pending/rejected`) → admin cấp bypass → **ẩn banner KYC, KHÔNG nhắc user lên KYC nữa**.
- `isKycVerified = false` → hiển thị banner / CTA "Hoàn tất KYC" như cũ.

Cùng quy tắc đã dùng cho `host.isKycVerified` ở §4.11.

### 2.6 Lợi ích của pattern này

| | Pattern cũ (login trả user) | Pattern mới (tách 2 endpoint) |
|---|---|---|
| **Số request login** | 1 | 2 (chậm thêm ~100ms — không cảm nhận được) |
| **Maintenance** | Mỗi lần thay User shape → fix 5 endpoint | Chỉ fix 1 endpoint `/auth/profile` |
| **Auto-login khi mở app** | Phải cache `user` rồi invalidate phức tạp | Mở app → gọi `/auth/profile` → luôn fresh |
| **State sync sau subscription đổi** | Phải xoá cache, login lại | Chỉ cần re-fetch `/auth/profile` |
| **Compliance** | Custom | OAuth 2.0 / OpenID Connect standard |
| **Refresh flow** | Phức tạp (refresh xong vẫn không có user) | Đơn giản (refresh → có token → gọi /profile khi cần) |

### 2.7 Device anti-spam

Backend chặn quá 3 account tạo cùng 1 device trong 24h (dựa trên `User-Agent` + IP). App nên gắn UA ổn định.

---

## 2A. Phân quyền & Authorization — Quy tắc tổng

> **Đọc kỹ section này trước khi gọi bất kỳ endpoint nào.** FE đôi khi gặp 401/403 không hiểu vì sao — câu trả lời đa số nằm ở đây.
>
> ⚠️ **v1.15 (2026-06-26)** — Mọi endpoint admin giờ chấp nhận thêm **SALE hệ thống** (`role=2 + scope=system`) khi user có quyền tương ứng trong bảng `user_permissions`. Đọc §26 để hiểu mô hình mới đầy đủ. PermissionGuard giờ check cả `users / kyc / subscriptions / disputes / ...` chứ không chỉ 4 module owner-scope cũ.

### 2A.1 Ba lớp guard BE chạy theo thứ tự

Mọi request đi qua 3 lớp kiểm tra:

| # | Guard | Check gì | Fail → Status |
|---|---|---|---|
| 1 | `JwtAuthGuard` | Có token Bearer hợp lệ không, user còn active không, chưa bị banned không | **401 Unauthorized** |
| 2 | `RolesGuard` | Role user có trong whitelist `@Roles(...)` không | **403 Forbidden** |
| 3 | `PermissionGuard` | SALE có row `UserPermission` tương ứng với `@Permission(module, action)` không | **403 Forbidden** |

Ngoài 3 lớp guard, **trong service** còn check thêm:
- KYC required (cho OWNER thao tác property/booking)
- Subscription active required (block khi past_due/frozen)
- Ownership scope (OWNER A không xem được data của OWNER B)
- Resource state (vd: booking đang HOLD mới confirm được)

### 2A.2 Khi nào status 401 vs 403

| HTTP | Ý nghĩa | Khi nào FE thấy |
|---|---|---|
| **401** | Token sai/hết hạn/account disabled | Token hết hạn 15 phút → tự refresh. User bị admin ban → logout hẳn |
| **403** | Token OK, nhưng role/permission không cho phép | OWNER cố vào `/users` → bị chặn, hiển thị toast "Bạn không có quyền" |
| **404** | Resource không tồn tại HOẶC tồn tại nhưng không thuộc về caller | OWNER A xem property của OWNER B → trả 404 (giả vờ không có, tránh leak) |

FE flow xử lý 401 (đã document §1.7):
- Tự gọi `/auth/refresh` → retry request gốc
- Refresh fail → logout về login

FE flow xử lý 403:
- Không retry — không có cách auto-fix
- Toast `message` từ response BE (đã dịch theo locale)

### 2A.3 Bảng tổng — Role nào vào endpoint nào

#### A. Public endpoints (không cần login)

| Endpoint | Mục đích |
|---|---|
| `POST /auth/register, /login, /google, /apple, /refresh, /forgot-password, /reset-password` | Auth flow |
| `GET /properties/public` | Khách tìm cơ sở |
| `GET /properties/share/:id` | Trang share link |
| `GET /calendar/public-grid` | Khách xem lịch trống |
| `GET /calendar/admin-contact` | Khách xem SĐT admin |
| `GET /billing/plans` | Khách xem giá gói |
| `GET /app/version` | Mobile force-update check |
| `POST /leads` (rate limit 10/phút/IP) | Form contact public |
| `GET /staff/invites/verify/:token` | Verify invite link |
| `POST /staff/invites/accept` | Accept invite tạo SALE |
| `POST /payments/bank-webhook` | Webhook Sepay/Casso (auth qua secret header) |
| `GET /partner/*` (qua `X-Partner-Key`) | Đối tác OTA |

#### B. Authenticated (bất kỳ role nào)

| Endpoint | Mục đích |
|---|---|
| `GET /auth/profile, POST /auth/logout, POST /auth/change-password` | Profile self-service |
| `PUT /users/:id` (chỉ chính mình, ADMIN sửa được người khác) | Update profile |
| `DELETE /users/me`, `GET /users/me/deletion-status`, `POST /users/me/restore` | Self-delete + khôi phục trong grace 30d |
| `GET /properties/:id` (cơ sở approved) | Xem detail |
| `POST /devices, DELETE /devices/:token, GET /devices` | FCM token management |
| `GET /notifications, /unread-count, PATCH /:id/read, /read-all` | Inbox |
| `POST /uploads` (rate 30/phút) | Upload file |

#### C. CUSTOMER only

| Endpoint | Mục đích |
|---|---|
| `POST /bookings/customer-hold` | Đặt phòng (giữ chỗ 30 phút) |
| `GET /bookings/my-bookings` | Lịch sử đặt |
| `PATCH /bookings/:id/customer-cancel` | Huỷ HOLD của mình |
| `POST /properties/:id/reviews` | Review sau khi COMPLETED |

#### D. OWNER + SALE (manager)

| Endpoint | Mục đích |
|---|---|
| `GET, POST, PATCH, DELETE /properties` | CRUD cơ sở của team |
| `POST /properties/:id/images, /:id/prices` | Upload ảnh, set giá |
| `GET /bookings` | List booking team |
| `POST /bookings/hold` | Staff hold 30 phút |
| `PATCH /bookings/:id/confirm, /paid, /cancel, PUT /:id` | Quản lý booking |
| `GET /calendar/grid, /properties` | Lịch nội bộ |
| `POST /calendar/lock, /sold, /bulk, DELETE /calendar/lock` | Khoá ngày |
| `GET /dashboard/stats, /reports` | KPI |
| `GET /leads` | List lead của team |
| `POST /payments/initiate, /renew` (OWNER only) | Mua gói |
| `GET /payments/active, POST /payments/:id/cancel` (OWNER only) | Rehydrate / huỷ session pending |
| `GET /subscriptions/me` | Xem gói team |

> SALE còn cần row `UserPermission` cho từng module — xem §2A.4.

#### E. OWNER only (không SALE)

| Endpoint | Mục đích |
|---|---|
| `POST /kyc/upload-cccd-front, /-back, /-selfie, /submit, /:id/resubmit` | KYC định danh |
| `GET /kyc/status` | Xem trạng thái KYC |
| `POST /staff/invites, GET /staff/invites, DELETE /staff/invites/:id` | Mời SALE |
| `GET /staff, DELETE /staff/:userId` | Quản lý team |
| `POST /users/my-staff, DELETE /users/my-staff/:id` | Thêm/gỡ SALE đã có account |
| `POST /properties/:id/reviews/:reviewId/reply` | Reply review (ADMIN cũng được) |

#### F. ADMIN only (toàn quyền hệ thống)

| Endpoint | Mục đích |
|---|---|
| `GET /users?role&withStats&q`, `POST /users` | Quản trị user — `q` search theo name/phone/email |
| `POST /users/:id/ban, /unban, /revoke-sessions, /reset-password` | Moderation |
| `PATCH /users/:id/role, /:id/kyc-bypass` | Đổi role, cấp bypass |
| `DELETE /users/:id` | Xoá user |
| `POST /properties/:id/approve, /reject, /suspend` | Moderation cơ sở |
| `GET /admin/kyc/queue?filter=0\|1\|2\|3&q=keyword` | Danh sách KYC admin (một endpoint) — hỗ trợ search `q` theo tên/SĐT/email owner |
| `GET /admin/kyc/count-pending` | Badge (deprecated — dùng `pendingCount` trong queue) |
| `POST /admin/kyc/submissions/:id/approve, /reject` | Duyệt KYC |
| `GET /admin/subscriptions, /count-overdue, /sum-paid` | Báo cáo subscription |
| `GET /admin/users/:id/subscription` | Snapshot |
| `POST /admin/users/:id/trial, DELETE /trial` | Cấp/thu hồi trial |
| `PATCH /admin/users/:id/subscription/price` | Set giá custom |
| `POST /admin/users/:id/subscription/mark-paid, /freeze, /unfreeze` | Quản lý gói |
| `GET /admin/payments, POST /admin/payments/:id/mark-paid` | Manual reconcile bank |
| `GET /admin/disputes, /count-active, /:id` | Quản lý dispute |
| `POST /admin/disputes/:id/investigate, /resolve, /reject` | Xét xử |
| `GET /admin/reviews, /count-flagged, /:reviewId` | Moderation review |
| `DELETE /admin/reviews/:reviewId, POST /restore` | Ẩn/khôi phục |
| `GET /admin/audit-log` | Nhật ký kiểm toán |
| `GET /admin/emails/templates, POST /admin/emails/test` | Email template |
| `POST /admin/app-version` | Set version mobile |
| `GET, PUT /permissions/:userId` | Cấu hình quyền SALE |
| Tất cả endpoint của các role khác | ADMIN bypass (xem các property bất kỳ, gỡ booking bất kỳ, v.v.) |

### 2A.4 Permission cho SALE — Lớp thứ 4

OWNER có thể giới hạn SALE qua bảng `UserPermission` (đã có UI hoặc qua `PUT /permissions/:userId`).

4 module có thể cấu hình:
- `properties` — CRUD cơ sở
- `bookings` — CRUD booking
- `calendar` — Khoá/mở ngày
- `reviews` — Reply / quản lý review

Mỗi module có 4 action: `canCreate, canRead, canUpdate, canDelete`.

**Mặc định khi accept invite** (BE tự seed):

| Module | canCreate | canRead | canUpdate | canDelete |
|---|:---:|:---:|:---:|:---:|
| properties | ❌ | ✅ | ❌ | ❌ |
| bookings | ✅ | ✅ | ✅ | ❌ |
| calendar | ✅ | ✅ | ✅ | ✅ |
| reviews | ❌ | ✅ | ✅ | ❌ |

OWNER có thể nâng/giảm quyền sau qua `PUT /permissions/:userId`.

> SALE thiếu permission cụ thể → endpoint trả **403 Forbidden** với message rõ.

### 2A.5 Điều kiện business — Bị block ngoài role/permission

Ngoài 3 lớp guard, BE còn từ chối request trong service nếu:

#### KYC required

| Điều kiện | Áp dụng cho |
|---|---|
| User role=OWNER, `kycStatus !== "approved"`, `kycBypass=false` | Tạo/sửa property, mời SALE |
| → Trả 403 với `msg.kyc.propertyRequiresKyc` |  |

ADMIN có thể cấp `kycBypass=true` qua `PATCH /users/:id/kyc-bypass` để skip KYC.

#### Số điện thoại bắt buộc (v1.41 · 2026-07-13)

Vì đăng ký Google/Apple **không lấy được số điện thoại**, còn listing công khai lại cần SĐT liên hệ (khách trả cọc, `ownerPhone` trên `calendar/public-grid`, link share Zalo `by-owner`), BE nay **bắt buộc OWNER phải có `phone`** trước khi vận hành.

| Điều kiện | Áp dụng cho |
|---|---|
| OWNER (hoặc owner được SALE thao tác hộ) có `phone` rỗng/`null` | `POST /properties`, `PUT/PATCH /properties/:id`, `POST /staff/invites` |
| → Trả **403** với `code: "PHONE_REQUIRED"` + message "Vui lòng cập nhật số điện thoại trong hồ sơ trước khi đăng/sửa cơ sở." (hoặc "…mời nhân viên." cho staff invite) |  |

- **ADMIN bỏ qua** (tạo/sửa hộ không bị chặn), giống các gate KYC/entitlement/trial-cap khác.
- SALE thao tác cho owner được gán → check theo `phone` của **owner đó**.
- FE: bắt `code === "PHONE_REQUIRED"` → điều hướng user sang màn cập nhật hồ sơ (`PATCH /auth/profile { phone }`) rồi thử lại. User cập nhật SĐT xong → thao tác pass ngay, không cần re-login.

#### Subscription / entitlement required (Apple IAP compliance)

App iOS không có UI thanh toán (Apple Guideline 3.1.1 cấm chuyển khoản ngoài đối với app dạng quản lý). Web + Google Play vẫn giữ luồng thanh toán cũ.

**Owner trial ngầm khi đăng ký:**

- OWNER mới đăng ký qua bất kỳ kênh nào (`/auth/register`, `/auth/google`, `/auth/apple`) **đều** được BE set `subscriptionStatus="trial"` + `trialEndsAt = now + 60 ngày` ngay tại thời điểm tạo account.
- FE iOS **KHÔNG** hiển thị countdown, KHÔNG để user nhìn thấy còn bao nhiêu ngày trial — coi như tài khoản đang dùng bình thường.
- Trong 60 ngày này, OWNER **bắt buộc hoàn tất KYC** rồi mới dùng được tính năng quản lý (tạo property, mời 1 SALE). KYC vẫn hiển thị bình thường vì là requirement hợp pháp.

**Gate entitlement (BE enforce ở service layer):**

OWNER được phép dùng tính năng quản lý khi thoả MỘT trong:

- `kycBypass = true` (ADMIN cấp tay), HOẶC
- `subscriptionStatus = "active"` (đã được admin duyệt thanh toán), HOẶC
- `subscriptionStatus = "trial"` **và** `trialEndsAt > now`.

Hết trial mà chưa có thanh toán được duyệt → các endpoint sau **trả 403 với message generic `subscription.featureLocked`** ("Tài khoản chưa có quyền dùng tính năng này"):

| Endpoint | Hành vi |
|---|---|
| `POST /properties` | Hết trial → 403 `subscription.featureLocked` · Còn trial nhưng đã có 1 cơ sở → 403 `code: "PROPERTY_LIMIT_REACHED"` (xem trial cap bên dưới) |
| `PUT /properties/:id` | 403 `subscription.featureLocked` |
| `POST /staff/invites` | 403 `subscription.featureLocked` (thay cho `staff.subscriptionRequired` cũ — không lộ trạng thái) |

SALE inherit entitlement của OWNER được gán (`user.ownerId`). Nếu OWNER hết trial → SALE cũng bị 403 generic.

**Unlock**: khi ADMIN duyệt thanh toán qua `POST /admin/users/:id/subscription/mark-paid` (luồng manual_bank/web/Google Play) → `subscriptionStatus` chuyển `active` → tất cả endpoint trên hoạt động trở lại ngay lập tức, không cần re-login.

**Note**: Các status khác (`past_due`, `cancelled`, `frozen`) cũng làm `isOwnerEntitled` trả false → cùng message `featureLocked`. Riêng `frozen` vẫn giữ logic block ở payment endpoints (existing).

**Trial cap số cơ sở (v1.39)**: OWNER đang ở **trial ngầm chưa mua gói** (`subscriptionStatus="trial"` **và** `subscriptionPlanId=null`) chỉ được đăng **tối đa 1 cơ sở** (1 villa / 1 homestay / 1 khách sạn — mọi `type` tính chung). Khi đã có ≥ 1 cơ sở chưa xoá, `POST /properties` trả **403 `code: "PROPERTY_LIMIT_REACHED"`**, message trung tính (không lộ trial/gói/thanh toán để an toàn Apple review): *"Tài khoản của bạn hiện chỉ có thể đăng tối đa 1 cơ sở. Vui lòng liên hệ hỗ trợ nếu cần đăng thêm."*
- Gỡ cap ngay khi owner **mua bất kỳ gói nào** (`subscriptionPlanId` khác null) hoặc được ADMIN cấp `kycBypass`.
- ADMIN tạo hộ (`POST /properties` với `ownerId`) **không** bị cap.
- SALE tạo cho owner được gán → cap tính theo owner đó.

OWNER xem được subscription detail qua `GET /subscriptions/me` (chỉ Web/Android dùng để hiển thị "Gia hạn ngay"; iOS ẩn).

#### Account banned

| Điều kiện | Áp dụng cho |
|---|---|
| `User.bannedAt != null` hoặc `isActive=false` | Tất cả endpoint — login fail, refresh token bị xoá |
| → Trả 401 với `msg.auth.accountDisabled` |  |

#### Ownership scope (silent 404)

OWNER A không thấy được property/booking/lead của OWNER B → BE trả 404 (thay vì 403) để KHÔNG leak sự tồn tại của data đó.

SALE thấy được data của OWNER mình (qua `ownerId`).

ADMIN bypass tất cả ownership check.

#### Resource state

Một số action chỉ hợp lệ ở state nhất định:

| Action | State yêu cầu | Trả lỗi nếu sai |
|---|---|---|
| `PATCH /bookings/:id/confirm` | Booking đang HOLD | 400 `onlyConfirmHold` |
| `PATCH /bookings/:id/customer-cancel` | Booking đang HOLD và thuộc customer | 400 `onlyCancelHold` hoặc `notYourBooking` |
| `POST /properties/:id/reviews` | Booking COMPLETED, đã qua 12h trưa ngày checkout, chưa review | 400 `bookingNotCompleted` / `reviewNotYetAllowed` hoặc 409 `alreadyReviewed` |
| `POST /admin/disputes/:id/resolve` | Dispute đang pending/investigating | 400 `alreadyClosed` |
| `POST /admin/subscriptions/.../mark-paid` | Trong 10 giây vừa rồi chưa có mark-paid khác | 409 `markPaidDuplicate` (chống double-click) |
| `POST /admin/users/:id/trial` | User KHÔNG đang ACTIVE và KHÔNG đang FROZEN | 409 `alreadyActive` hoặc `cannotGrantTrialFrozen` |

### 2A.6 Special case — Endpoint cho phép nhiều role nhưng behavior khác nhau

#### `GET /properties`

| Role | Hành vi |
|---|---|
| ADMIN | Xem tất cả property toàn hệ thống. Cần `?includeInactive=true` để thấy inactive |
| OWNER | Tự động thấy property của mình kể cả pending/rejected/suspended (KHÔNG cần `?includeInactive`) |
| SALE | Tự động thấy property của OWNER mình kể cả pending/rejected/suspended |

#### `GET /staff/invites`, `GET /staff`

| Role | Hành vi |
|---|---|
| OWNER | Chỉ thấy invite/staff của mình |
| ADMIN | Thấy tất cả. Có thể filter theo `?ownerId=` |

#### `POST /staff/invites`

| Role | Hành vi |
|---|---|
| OWNER | Tự tạo invite cho team mình |
| ADMIN | Tạo invite **thay mặt** OWNER — phải truyền `ownerId` trong body |

#### `POST /disputes`

ACL:
- OWNER/SALE của property
- CUSTOMER của booking
- ADMIN luôn được

Khác → 403.

#### `GET /admin/audit-log`

ADMIN only. Nhưng audit log **tự ghi** khi admin thực hiện action — FE/client KHÔNG được gọi endpoint POST log (không tồn tại).

### 2A.7 Bypass đặc biệt

| Role | Bypass |
|---|---|
| ADMIN | Bypass tất cả check ownership. Tham gia conversation chat bất kỳ để moderate. Xem inactive property/banned user/hidden review |
| `User.kycBypass=true` | OWNER skip KYC requirement. Chỉ ADMIN cấp được |

### 2A.8 Các status mã chống nhầm lẫn

| Status | Có nghĩa | Lý do thường gặp |
|---|---|---|
| 401 | Unauthorized | Token sai/hết hạn, account disabled, account banned |
| 403 | Forbidden | Role không cho phép, hoặc SALE thiếu permission, hoặc KYC chưa approved, hoặc subscription frozen |
| 404 | Not found | Resource không tồn tại HOẶC tồn tại nhưng không thuộc về caller (silent) |
| 409 | Conflict | Race condition, duplicate, hoặc state transition không hợp lệ |
| 410 | Gone | Token đã dùng / đã expired (vd: staff invite token) |
| 429 | Rate limited | Quá quota — đợi và retry |
| 422 | Validation | Input không hợp lệ (giống 400, nhưng nhiều BE/lib dùng 422 riêng) |

### 2A.9 Checklist FE khi wire 1 endpoint mới

Trước khi wire 1 endpoint, hỏi 4 câu:

1. **Endpoint này public hay cần auth?** → xem cột "Auth" trong bảng endpoint
2. **Role nào được vào?** → xem `@Roles(...)` hoặc tra trong §2A.3
3. **Có cần permission cho SALE không?** → xem `@Permission(module, action)` — nếu có thì SALE phải có row UserPermission
4. **Có business rule khác không?** → KYC approved? Subscription active? Resource state?

Nếu FE thấy 403 → check 4 điểm trên, thường ra ngay nguyên nhân.

---

## 3. Users

Base path: `/users`. Tất cả cần Bearer.

### 3.1 Owner / Admin endpoints

| Method | Path | Role | Body / Query | Mô tả |
|---|---|---|---|---|
| `GET` | `/users?role=` | ADMIN | `?role` (0-3) | List toàn hệ |
| `GET` | `/users/available-staff` | ADMIN/OWNER | — | SALE chưa gán owner |
| `GET` | `/users/my-staff` | OWNER | — | Nhân viên của tôi |
| `GET` | `/users/:id` | ADMIN/OWNER | — | Admin: bất kỳ; Owner: SALE thuộc team |
| `POST` | `/users` | ADMIN | `{ name, email, password?, phone?, role, ownerId? }` | Admin tạo user |
| `POST` | `/users/my-staff` | OWNER | `{ email }` | Owner add SALE đã có account vào team |
| `PUT` | `/users/:id` | Any auth | `{ name?, phone?, email?, gender?, dateOfBirth?, avatar? }` | Admin sửa anyone, user khác sửa chính mình |
| `PATCH` | `/users/:id/kyc-bypass` | ADMIN | `{ bypass: boolean }` | Cấp/thu hồi quyền bỏ qua KYC |
| `DELETE` | `/users/me` | Any auth | `{ reason? }` | Self-delete (NĐ 13) — tạo grace 30 ngày, không xoá ngay. Trả `data: { scheduledDeleteAt, graceDays: 30, canRestoreUntil }`. **Tự động tạo in-app notification + gửi email** "Yêu cầu xoá tài khoản — đăng nhập lại trước ngày X để khôi phục". Login lại trong grace → auto-cancel + notification + email "đã khôi phục". Có thể gọi `POST /users/me/restore` để chủ động huỷ. Sau 30 ngày cron thực thi soft-delete + **wipe toàn bộ KYC + dữ liệu cá nhân**: xoá `KycSubmission`/`KycUpload`, `UserDevice`, `UserConsent`, `NotificationPreference`, `DataExportRequest`, `UserPermission`, `SupportTicket`(+messages); anonymize `Feedback.userId=null`; reset trên User: `name='Deleted User'`, `email/phone` rename free unique, clear `password/avatar/gender/dateOfBirth/google-appleSub/registerDeviceId/registerIp`, reset `kycStatus='none'/kycBypass=false/kycSubmissionId=null` + toàn bộ field `subscription*`/`trialEndsAt`/`pendingPlan*`. Giữ lại `Booking`/`Property`/`Subscription`/`PaymentSession` (yêu cầu retention tài chính — `PaymentSession.submissionId` được set null trước khi xoá KYC để không cascade mất lịch sử). Re-register cùng email/phone sau đó tạo User mới hoàn toàn sạch. |
| `GET` | `/users/me/deletion-status` | Any auth | — | Trả `data: { pending: boolean, scheduledDeleteAt: ISO\|null, daysRemaining: number }`. FE check để show banner "Tài khoản đang chờ xoá vào dd/mm/yyyy — Khôi phục". `GET /auth/profile` cũng đã trả `deletionScheduledAt` để FE tiết kiệm 1 round-trip. |
| `POST` | `/users/me/restore` | Any auth | — | Huỷ yêu cầu xoá đang pending. Trả 400 `users.deletionNotPending` nếu không có request đang chờ. Tạo notification + email "đã khôi phục". |
| `DELETE` | `/users/my-staff/:id` | OWNER | — | Owner gỡ nhân viên |
| `DELETE` | `/users/:id` | ADMIN | — | Admin xoá user |

### 3.2 Admin moderation actions

| Method | Path | Body | Mô tả |
|---|---|---|---|
| `POST` | `/users/:id/ban` | `{ reason }` (≥5 chars) | Ban user, xoá refresh token + FCM |
| `POST` | `/users/:id/unban` | — | Gỡ ban |
| `POST` | `/users/:id/revoke-sessions` | — | Xoá refresh token + tất cả FCM token |
| `POST` | `/users/:id/reset-password` | `{ newPassword? }` | Không truyền → BE sinh mật khẩu tạm và trả về 1 lần trong `data.tempPassword` |
| `PATCH` | `/users/:id/role` | `{ role: 0\|1\|2\|3 }` | Đổi role; ADMIN/OWNER/CUSTOMER → tự clear ownerId |

> Mỗi action tự ghi audit log.

### 3.3 Tài khoản nhận tiền OWNER — luồng duyệt bởi ADMIN (v1.21)

> **Business rule**: OWNER tạo hoặc sửa tài khoản ngân hàng nhận tiền **phải được ADMIN duyệt** mới có hiệu lực. Giá trị đang chờ duyệt KHÔNG được dùng sinh VietQR — `paymentInfo` (§5.3) chỉ dùng giá trị đã duyệt (`bankStatus='approved'`).

**Trạng thái** (`User.bankStatus`): `none` (chưa cấu hình) → `pending` (OWNER đã gửi, chờ duyệt) → `approved` (đã duyệt, live có hiệu lực) hoặc `rejected` (bị từ chối, giữ giá trị duyệt trước đó nếu có).

#### OWNER endpoints

| Method | Path | Role | Body |
|---|---|---|---|
| `GET` | `/users/me/bank` | OWNER | — |
| `PUT` | `/users/me/bank` | OWNER | `{ bankBin, bankName?, bankAccountNumber, bankAccountName }` |

- `bankBin` (6 số NAPAS), `bankAccountNumber` (6–20 số), `bankAccountName` **bắt buộc**; `bankName` optional.
- `PUT` ghi vào **pending** + set `bankStatus='pending'` — KHÔNG áp vào tài khoản đang dùng. Gửi lại khi đang pending → ghi đè pending.
- Gửi thành công → BE push notification tới ADMIN (`pushType='bank_submitted'`, deepLink `/admin/bank-accounts`).
- `role != OWNER` → 403 `users.bankOnlyOwner`.

**Response (`GET` + `PUT`)** — `data`:
```json
{
  "status": "pending",
  "current": { "bankBin": "970436", "bankName": "Vietcombank", "bankAccountNumber": "0123456789", "bankAccountName": "NGUYEN VAN A" },
  "pending": { "bankBin": "970418", "bankName": "ACB", "bankAccountNumber": "99988877", "bankAccountName": "NGUYEN VAN A" },
  "rejectReason": null,
  "submittedAt": "2026-07-04T10:00:00.000Z",
  "reviewedAt": null
}
```
- `current` = giá trị đã duyệt (đang dùng cho VietQR); `null` field nếu chưa từng duyệt.
- `pending` != `null` **chỉ khi** `status='pending'`.
- `rejectReason` != `null` **chỉ khi** `status='rejected'`.

#### ADMIN endpoints — queue duyệt

| Method | Path | Role / Permission | Body / Query |
|---|---|---|---|
| `GET` | `/admin/bank-accounts?status&page&limit` | ADMIN / `users.canRead` | `status`: `pending`(default)`\|approved\|rejected\|all` |
| `POST` | `/admin/users/:id/bank/approve` | ADMIN / `users.canUpdate` | — |
| `POST` | `/admin/users/:id/bank/reject` | ADMIN / `users.canUpdate` | `{ reason }` (5–500 ký tự) |

- `GET /admin/bank-accounts` → `data: { filter, pendingCount, total, page, limit, items[] }`. Mỗi item: `{ id, name, email, phone, avatar, status, current, pending, rejectReason, submittedAt, reviewedAt }`. `pendingCount` dùng cho badge sidebar.
- **approve** → copy `pending*` → `bank*` live, `bankStatus='approved'`, clear pending. Notify OWNER (`bank_approved`). Audit `user.bank_approve`.
- **reject** → giữ `bank*` live cũ, clear pending, lưu `reason`, `bankStatus='rejected'`. Notify OWNER (`bank_rejected`). Audit `user.bank_reject`.
- approve/reject khi user không có yêu cầu đang chờ (`status != pending`) → 400 `users.bankNoPending`.

> **Lưu ý dữ liệu cũ**: OWNER đã cấu hình bank trước v1.21 được backfill `bankStatus='approved'` → VietQR tiếp tục hoạt động, không phải gửi duyệt lại. Chỉ lần tạo/sửa **tiếp theo** mới đi qua luồng duyệt.

#### 3.3.1 Hướng dẫn tích hợp cho App (OWNER)

> Màn "Tài khoản nhận tiền" trong app OWNER. App **KHÔNG** gửi bank qua `PUT /users/:id` nữa (đã bị strip). Dùng đúng 2 endpoint dưới.

**Luồng màn hình:**

1. **Mở màn** → `GET /users/me/bank` → render theo `status`:
   - `none` → form trống, nút "Thêm tài khoản nhận tiền".
   - `approved` → hiển thị `current` (tài khoản đang dùng) + nút "Sửa".
   - `pending` → hiển thị `pending` + banner "Đang chờ duyệt", **khoá nút Sửa** (hoặc cho sửa = gửi lại, ghi đè pending).
   - `rejected` → hiển thị `current` (nếu có) + banner đỏ `rejectReason` + nút "Gửi lại".
2. **Submit form** → `PUT /users/me/bank` với `{ bankBin, bankName?, bankAccountNumber, bankAccountName }`:
   - Validate client: `bankBin` đúng 6 số, `bankAccountNumber` 6–20 số, `bankAccountName` không rỗng.
   - Thành công (200) → response trả `status='pending'`; app hiện toast "Đã gửi, chờ quản trị viên duyệt" + chuyển UI sang trạng thái pending. **KHÔNG** coi là đã kích hoạt.
   - 403 `users.bankOnlyOwner` → chỉ OWNER dùng được (SALE/CUSTOMER ẩn màn này).
3. **Nhận kết quả duyệt** → push FCM:
   - `bank_approved` → gọi lại `GET /users/me/bank` (hoặc `GET /auth/profile`) → chuyển UI sang `approved`. Từ giờ VietQR dùng số tài khoản này.
   - `bank_rejected` → refetch → hiển thị `rejectReason`, cho gửi lại.
4. **Đồng bộ nhanh**: `GET /auth/profile` đã trả `bankStatus` + `bankRejectReason` → app có thể suy trạng thái mà không cần gọi `/users/me/bank` nếu chỉ cần badge.

**Push handler bổ sung** (thêm vào bảng §20.2):
- `bank_submitted` → (ADMIN app, nếu có) mở `/admin/bank-accounts`.
- `bank_approved`, `bank_rejected` → (OWNER app) mở màn "Tài khoản nhận tiền".

**Checklist App (OWNER):**
- [ ] Màn "Tài khoản nhận tiền": `GET /users/me/bank` khi mở, render 4 trạng thái.
- [ ] Submit qua `PUT /users/me/bank` (KHÔNG dùng `PUT /users/:id` cho bank nữa).
- [ ] Sau submit: hiển thị trạng thái "chờ duyệt", không hiển thị "đã kích hoạt".
- [ ] Handle push `bank_approved` / `bank_rejected` → refetch + cập nhật UI.
- [ ] Trạng thái `rejected`: hiển thị `rejectReason`, nút gửi lại.
- [ ] Ẩn màn này cho non-OWNER.

---

## 4. Properties

Base path: `/properties`.

### 4.1 Public

> **Visibility rule (BẮT BUỘC — áp dụng cho TẤT CẢ public endpoint dưới)**: chỉ trả property thoả **đủ 2 nhóm điều kiện**:
>
> **(A) Property-level:** `isActive=true` AND `deletedAt=null` AND `moderationStatus='approved'`.
>
> **(B) Owner-level (v1.16.5+):** owner phải còn quyền dùng tính năng (gate giống lúc tạo phòng):
> - Owner `isActive=true`, `bannedAt=null`, `deletedAt=null`, **VÀ**
> - `kycBypass=true` **HOẶC** (`kycStatus='approved'` **AND** subscription entitled).
> - Subscription entitled = `subscriptionStatus='active'` **HOẶC** (`subscriptionStatus='trial'` **AND** `trialEndsAt > now`).
>
> Owner mất entitlement (hết trial chưa thanh toán, admin freeze, KYC bị thu hồi, banned…) → **TẤT CẢ property của họ tự động biến mất khỏi web khách hàng** (search/list/detail/share/by-owner/similar). Slug/id của property bị filter → **404 NotFound**.
>
> Áp dụng tăng tiến:
> - **v1.16.2 (2026-06-29)** — fix property-level filter (chỉ moderationStatus).
> - **v1.16.5 (2026-06-29)** — bổ sung owner-level entitlement filter (gate đối xứng với create flow).

| Method | Path | Query |
|---|---|---|
| `GET` | `/properties/public` | `checkinDate?, checkoutDate?, guests?, adults?, children?, minPrice?, maxPrice?, type?, view?` — **array phẳng PropertyCardDto[]** (legacy, dùng cho mobile). `adults` lọc theo `standardGuests`, `children` lọc theo `standardChildren` |
| `GET` | `/properties/search` | Full filter + pagination + sort — **dùng cho customer web list/search** (xem §4.7) |
| `GET` | `/properties/public/:slug` | **Chi tiết phòng cho customer web** (kèm giá + host) — xem §4.11 |
| `GET` | `/properties/public/:slug/similar?limit=8` | **Cơ sở tương tự** (carousel cuối trang detail) — xem §4.12 |
| `GET` | `/properties/public/by-owner/:ownerId` | **Danh sách phòng công khai của 1 chủ nhà** (no auth) — dùng cho link Zalo "lịch phòng" — xem §4.13 |
| `GET` | `/properties/share/:id` | **Preview share link 1 phòng** — KHÔNG trả giá bán + KHÔNG trả host info. CÓ trả surcharge + đầy đủ thông tin phòng. Dùng cho `preview.halong24h.com`. Xem §4.14 |

### 4.2 Authenticated CRUD

| Method | Path | Role |
|---|---|---|
| `GET` | `/properties?includeInactive&view&moderationStatus` | ADMIN/OWNER/SALE |
| `GET` | `/properties/:id` | Any auth |
| `POST` | `/properties` | ADMIN/OWNER (+ permission) |
| `PATCH` | `/properties/:id` | ADMIN/OWNER/SALE (+ permission) |
| `PUT` | `/properties/:id/prices` | ADMIN/OWNER/SALE (+ permission) |
| `DELETE` | `/properties/:id` | ADMIN/OWNER (+ permission) |

> **Required price fields (v1.16.7+, 2026-07-01)**: Mọi field giá tiền **bắt buộc, không được null/để trống**.
> - `POST /properties` — `weekdayPrice`, `weekendPrice`, `holidayPrice`, `adultSurcharge`, `childSurcharge` **đều required** (`int >= 0`). Trước đây optional.
> - `PUT /properties/:id/prices` — cả 5 field trên **đều required**, FE phải gửi đủ (không còn partial update).
> - `PATCH /properties/:id` — 5 field giá vẫn optional (chỉ gửi field cần update), nhưng **nếu gửi thì KHÔNG được null** — gửi `null` → 400 validation error.
> - Booking `depositAmount` (cả `POST /bookings/hold`, `PATCH /bookings/:id`) — optional nhưng **nếu gửi thì không được null**.
> - `PATCH /bookings/:id/mark-paid` body `amount` — optional với fallback `totalAmount`/`depositAmount`, **nếu gửi thì không được null**.

**`GET /properties` query params:**

| Param | Kiểu | Mô tả |
|---|---|---|
| `includeInactive` | bool | ADMIN truyền `true` để thấy property `isActive=false`. OWNER/SALE tự động thấy hết property của mình (kể cả inactive), không cần truyền. |
| `view` | `sea \| city \| mountain \| garden \| pool` | Lọc theo view |
| `moderationStatus` | `pending \| approved \| rejected \| suspended` | **(v1.16.3 NEW)** Lọc server-side theo trạng thái duyệt. Dùng cho admin tab "Chờ duyệt / Đã duyệt / Từ chối / Tạm ngưng". Giá trị khác → ignore. |
| `page` | int | **(NEW)** Phân trang **opt-in**. Xem ghi chú shape response bên dưới. |
| `limit` | int | **(NEW)** Số item/trang, mặc định `20`, tối đa `100`. Chỉ có tác dụng khi bật phân trang. |

**Response DTO** trả về tất cả scalar fields của Property (do Prisma `include`), bao gồm: `moderationStatus`, `isHot`, `slug`, `ratingAvg`, `reviewCount`, `isActive`, `deletedAt`, `moderationRejectedReason`, `moderationReviewedAt`, `moderationReviewedBy` — cộng `owner: {id, name, phone}`, `images[]`, `_count: { bookings }`. Xem shape mẫu §4.5.

> **Phân trang opt-in (NEW)** — giữ backward-compat, **KHÔNG** đổi hành vi cũ:
> - **Không** truyền `page`/`limit` → `data` là **mảng** `Property[]` như trước (FE hiện tại không cần đổi).
> - Truyền `page` hoặc `limit` → `data` chuyển sang object phân trang: `{ items: Property[], total, page, limit, totalPages }`.
>
> Khuyến nghị FE (đặc biệt màn admin có nhiều cơ sở) chuyển sang truyền `page`/`limit` để tránh kéo toàn bộ bảng + ảnh mỗi request.

> **Lưu ý isHot trong list admin/owner**: Sample JSON §4.5 không liệt kê đủ field nhưng response thực tế **có** `isHot: boolean`. Toggle Hot ở admin FE đọc thẳng field này, không cần endpoint riêng.

### 4.3 Images (multipart)

| Method | Path |
|---|---|
| `POST` | `/properties/:id/images` — field `images[]`, max 20 file × 10MB, JPG/PNG/WEBP |
| `DELETE` | `/properties/:id/images/:imageId` |
| `PATCH` | `/properties/:id/images/:imageId/cover` |

### 4.4 Admin moderation

| Method | Path | Body |
|---|---|---|
| `POST` | `/properties/:id/approve` | — |
| `POST` | `/properties/:id/reject` | `{ reason }` (≥5 chars) |
| `POST` | `/properties/:id/suspend` | `{ reason? }` |
| `PATCH` | `/properties/:id/hot` | `{ isHot: true \| false }` — bật/tắt badge Hot (xem §4.10) |

> ⚠️ **Business rule ĐỔI LẠI (v1.25 · 2026-07-06) — ADMIN duyệt phòng OWNER đăng**: OWNER/SALE `POST /properties` (vẫn cần KYC + subscription entitled) → tạo ở **`moderationStatus = "pending"`**, `isActive = true` — **KHÔNG public cho tới khi ADMIN duyệt**. Chỉ khi caller là **ADMIN** thì tạo `approved` ngay. Trước v1.25 mọi property mới auto-`approved`; nay quay lại có hàng chờ duyệt.
> **Điều kiện tạo phòng**: KYC approved (hoặc `kycBypass`) + subscription entitled — vẫn là 2 cổng độc lập; đạt 2 cổng này mới tạo được (dạng `pending`), rồi ADMIN duyệt để public.
> **OWNER/SALE list:** `GET /properties` tự động bao gồm property `pending/inactive/rejected/suspended` của mình (không cần truyền `?includeInactive=true`). ADMIN/khác phải truyền `?includeInactive=true` mới thấy inactive.
> **Response khi tạo (pending)**: message = `properties.createPendingSuccess` ("Đã gửi cơ sở, vui lòng chờ quản trị viên duyệt"). FE hiển thị trạng thái "chờ duyệt", KHÔNG coi là đã public.
>
> **Tab "Chờ duyệt" của admin FE:** Giờ **có dữ liệu thật** — mọi phòng OWNER/SALE đăng mới + phòng bị reject rồi OWNER sửa lại (xem dưới). Admin duyệt qua `POST /properties/:id/approve` (→ approved + isActive=true → public) hoặc `POST /properties/:id/reject`. Lọc queue bằng `GET /properties?moderationStatus=pending`. BE push `property_pending_review` (deepLink `/admin/properties/:id`) tới toàn bộ ADMIN mỗi khi có phòng mới chờ duyệt.

**Moderation status**:
- `pending` — **(v1.25) trạng thái mặc định của phòng OWNER/SALE mới đăng** — chờ ADMIN duyệt; KHÔNG public (web khách + calendar public-grid đều ẩn). Public khi ADMIN approve.
- `approved` — property đã duyệt; public khi `isActive = true`. Là trạng thái khi ADMIN tạo trực tiếp, hoặc sau khi ADMIN approve.
- `rejected` — admin từ chối → `isActive = false`; OWNER edit lại → **về `pending`** (gửi duyệt lại, KHÔNG auto-approve nữa — đổi ở v1.25).
- `suspended` — admin tạm ngưng property đang hoạt động → `isActive = false`; OWNER **không** tự bật lại (`PATCH isActive=true` → 403); cần admin `POST /properties/:id/approve`.

### 4.5 PropertyDto (admin/owner — full)

```json
{
  "id": "uuid",
  "ownerId": "uuid",
  "name": "Villa Hạ Long View",
  "slug": "villa-ha-long-view-vl001",
  "type": 0,
  "code": "VL001",
  "view": "sea",
  "address": "Bãi Cháy, Hạ Long",
  "latitude": 20.95, "longitude": 107.05,
  "mapLink": "https://maps.google.com/...",
  "isActive": true,
  "moderationStatus": "approved",
  "moderationRejectedReason": null,
  "moderationReviewedAt": null,
  "moderationReviewedBy": null,
  "isHot": false,
  "ratingAvg": 4.92,
  "reviewCount": 37,
  "bedrooms": 3, "bathrooms": 2,
  "standardGuests": 6, "standardChildren": 2, "maxGuests": 8,
  "floorArea": 120,
  "weekdayPrice": 2000000, "weekendPrice": 3000000, "holidayPrice": 4500000,
  "adultSurcharge": 200000, "childSurcharge": 100000,
  "amenities": ["wifi", "pool"],
  "cancellationPolicy": 1,
  "rules": "...", "services": ["..."], "description": "...",
  "checkInTime": "14:00", "checkOutTime": "12:00",
  "images": [{ "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }]
}
```

### 4.6 PropertyCardDto (public list — `/properties/public`, `/properties/search`)

Shape rút gọn cho card khách hàng. Tính sẵn `minPrice`, `rating`, `reviewCount`, `isGuestFavorite`, `coverImageUrl` để FE không phải post-process.

```json
{
  "id": "uuid",
  "slug": "villa-ha-long-view-vl001",
  "name": "Villa Hạ Long View",
  "code": "VL001",
  "type": 0,
  "view": "sea",
  "address": "Bãi Cháy, Hạ Long",
  "latitude": 20.95, "longitude": 107.05,
  "bedrooms": 3, "bathrooms": 2,
  "standardGuests": 6, "standardChildren": 2, "maxGuests": 8,
  "floorArea": 120,
  "amenities": ["wifi", "pool", "seaview"],
  "weekdayPrice": 2000000, "weekendPrice": 3000000, "holidayPrice": 4500000,
  "minPrice": 2000000,
  "rating": 4.92,
  "reviewCount": 37,
  "isGuestFavorite": true,
  "isHot": false,
  "isFavorited": false,
  "coverImageUrl": "https://res.cloudinary.com/.../cover.jpg",
  "images": [{ "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }]
}
```

- `slug` — duy nhất toàn hệ thống; auto-gen từ name + code khi tạo property (Vietnamese-aware). FE dùng cho URL `/property/{slug}`.
- `minPrice` — `min(weekdayPrice, weekendPrice, holidayPrice)` bỏ qua giá null/0.
- `rating` / `reviewCount` — đã denormalized vào `properties` (cập nhật mỗi khi review create/hide/restore).
- `isGuestFavorite` — derived **global**: `rating >= 4.8 && reviewCount >= 5` (badge "được khách yêu thích").
- `isHot` — **admin curated global**: bật/tắt bằng `PATCH /properties/:id/hot` (ADMIN only). Hot property tự pop lên đầu khi `sort=featured` và có thể lọc bằng `?hot=true` (xem §4.10).
- `isFavorited` — **per-user**: true nếu user hiện tại (JWT) đã save property này. Anonymous → luôn false. Toggle bằng `POST/DELETE /properties/:id/favorite` (xem §4.9).
- `coverImageUrl` — ảnh có `isCover = true`; fallback ảnh đầu danh sách.

### 4.7 `GET /properties/search` (customer web)

Paginated + filter + sort, **toàn bộ ở server-side**. Lý do: FE chỉ thấy 1 trang nên lọc/sort client sẽ sai. Không hỗ trợ FE filter sau khi nhận data.

> **Visibility**: tuân theo visibility rule §4.1 — chỉ trả property `isActive=true, deletedAt=null, moderationStatus='approved'`. Property chờ duyệt / bị từ chối / bị tạm ngưng tự ẩn khỏi kết quả search (kể cả khi match keyword `q`).

**Query params** (tất cả optional):

| Param | Kiểu | Ghi chú |
|---|---|---|
| `checkinDate`, `checkoutDate` | `YYYY-MM-DD` | Loại property bị HOLD/CONFIRMED đè ngày trùng |
| `guests` | int ≥1 | `maxGuests >= guests` (tổng khách cả căn) |
| `adults` | int ≥1 | `standardGuests >= adults` (sức chứa người lớn tiêu chuẩn) |
| `children` | int ≥0 | `standardChildren >= children` (sức chứa trẻ em tiêu chuẩn) |
| `bedrooms` | int ≥0 | `bedrooms >= bedrooms` (min) |
| `minPrice`, `maxPrice` | float | So với `weekdayPrice` |
| `type` | 0\|1\|2 | VILLA/HOMESTAY/HOTEL |
| `view` | enum | `sea \| city \| mountain \| garden \| pool` |
| `amenities` | CSV / array | **AND-match** các amenity (xem enum §4.8) |
| `minRating` | float 0–5 | `ratingAvg >= minRating` |
| `q` | string | Contains trong `name`, `code`, `address` |
| `sort` | enum | `price_asc \| price_desc \| rating \| newest \| featured` (default `featured`) |
| `page` | int ≥1 | Default `1` |
| `limit` | int 1–50 | Default `20` |
| `favorited` | bool | `true` → chỉ trả property user hiện tại đã save. **Yêu cầu Authorization header** — anonymous → 403. |
| `hot` | bool | `true` → chỉ trả property admin đã đánh dấu Hot. Public, không cần auth. |

> **Auth tuỳ chọn**: endpoint `@Public()` nhưng nếu FE gửi kèm Authorization header, BE sẽ populate `isFavorited` cho từng item dựa trên danh sách favorite của user. Không gửi token → `isFavorited` luôn `false`.

**Response**:

```json
{
  "success": true,
  "message": "...",
  "data": {
    "items": [PropertyCardDto, ...],
    "total": 124,
    "page": 1,
    "limit": 20,
    "totalPages": 7
  }
}
```

Sort `featured` = **isHot desc** → ratingAvg desc → reviewCount desc → createdAt desc. Hot property luôn nổi lên đầu.

### 4.8 Vocabulary

- **`view` enum** (cột riêng trên Property): `sea | city | mountain | garden | pool | null`.
- **`amenities` keys** (kebab-case, string khớp tuyệt đối). Validate trong DTO. Mở rộng tại `src/modules/properties/property-enums.ts`. Tổng cộng **46 key**, chia 6 nhóm:

  - **Core / filterable (12)**: `wifi`, `pool`, `bbq`, `kitchen`, `parking`, `ac`, `gym`, `breakfast`, `spa`, `restaurant`, `jacuzzi`, `bar`.
  - **Views (5)**: `seaview`, `bayview`, `cityview`, `gardenview`, `mountainview`.
  - **Bếp & đồ ăn (5)**: `fridge`, `microwave`, `induction-cooker`, `dishware`, `free-water`.
  - **Phòng tắm & phòng ngủ (9)**: `bathtub`, `shower`, `hot-water`, `hair-dryer`, `towels`, `toiletries`, `washing-machine`, `wardrobe`, `iron`.
  - **Tiện ích chung & giải trí (11)**: `tv`, `elevator`, `kids-area`, `heater`, `karaoke`, `safe-box`, `speaker`, `balcony`, `rooftop`, `garden`, `minibar`.
  - **An toàn & chính sách (4)**: `pet-friendly`, `security-camera`, `smoke-detector`, `first-aid-kit`.

  FE có thể gửi `?amenities=wifi,pool,bbq` (CSV) hoặc `?amenities[]=wifi&amenities[]=pool` (array). Sai key → 400.

### 4.9 Favorites (per-user wishlist)

Per-user. Chỉ **CUSTOMER** dùng được — Owner/Sale/Admin gọi → 403.

| Method | Path | Body | Mô tả |
|---|---|---|---|
| `POST` | `/properties/:id/favorite` | — | Lưu vào wishlist. Idempotent (gọi 2 lần không lỗi). Property inactive/đã xoá → 404. |
| `DELETE` | `/properties/:id/favorite` | — | Bỏ. Idempotent (xoá row không tồn tại không lỗi). |
| `GET` | `/users/me/favorites?page&limit` | — | List `PropertyCardDto[]` user đã save, mới nhất trước. Mỗi item `isFavorited = true`. |

**Response add/remove**:
```json
{ "success": true, "message": "...", "data": { "propertyId": "uuid", "isFavorited": true } }
```

**Hiển thị heart icon trên list/search**: BE đã populate `isFavorited` per item nếu FE gửi kèm token → không cần FE call thêm endpoint nào.

**Lọc chỉ wishlist**: `GET /properties/search?favorited=true` (kèm token). Tận dụng được pagination + filter + sort hiện có.

### 4.10 Hot badge (admin curated)

Admin tự chọn property nổi bật để lên top + hiển thị badge "Hot" trên web khách hàng.

| Method | Path | Role | Body |
|---|---|---|---|
| `PATCH` | `/properties/:id/hot` | ADMIN | `{ isHot: true \| false }` |

Response:
```json
{ "success": true, "message": "...", "data": { "id": "uuid", "name": "...", "code": "...", "isHot": true } }
```

**Cách FE web khách hàng dùng:**
- `PropertyCardDto.isHot` đã có sẵn → hiển thị badge "Hot" trên card.
- Section "Hot/Trending" → gọi `GET /properties/search?hot=true&sort=newest&limit=N`.
- Default list (`sort=featured`) tự đẩy hot property lên đầu, không cần tách section riêng nếu không muốn.

**Cách web admin dùng:**
- Trang quản lý property có toggle "Đánh dấu Hot" gọi `PATCH /properties/:id/hot` với `{ isHot }` tương ứng.
- Audit log: action `property.set_hot`, metadata `{ isHot }`.

### 4.11 Public detail by slug — `GET /properties/public/:slug`

Endpoint **chi tiết phòng cho FE web khách hàng** (`webhalong24h.com/property/{slug}`). Không cần auth.

- Tra theo `slug` (vd `b1503-03`). Slug ổn định, unique, không đổi khi rename — FE bookmark/cache 60s an toàn.
- Chỉ trả property `isActive=true, deletedAt=null, moderationStatus='approved'`. Slug không tồn tại / inactive / chưa duyệt / bị reject / bị suspend → **404**.
- Kèm **đầy đủ giá** (`weekdayPrice`, `weekendPrice`, `holidayPrice`) — khác với `/share/:id` (không có giá).
- **Không** trả `phone`/`email` chủ nhà (chat-mediated). Host info chỉ gồm name + avatar + KYC badge + memberSince + totalProperties.

**Response shape:**

```json
{
  "success": true,
  "message": "...",
  "data": {
    "id": "uuid",
    "slug": "b1503-03",
    "name": "B1503",
    "code": "03",
    "type": 1,
    "view": "sea",
    "address": "Toà Alacarte",
    "city": "Hạ Long",
    "district": "Bãi Cháy",
    "latitude": null,
    "longitude": null,
    "mapLink": null,
    "description": "Alacarte căn góc",
    "amenities": ["ac", "wifi", "tv"],
    "rules": "Check-in sau 14:00...",
    "services": [],
    "bedrooms": 0,
    "bathrooms": 1,
    "standardGuests": 2,
    "standardChildren": 1,
    "maxGuests": 2,
    "floorArea": null,
    "weekdayPrice": 1100000,
    "weekendPrice": 1600000,
    "holidayPrice": 1800000,
    "cancellationPolicy": 1,
    "checkInTime": "14:00",
    "checkOutTime": "12:00",
    "rating": 4.92,
    "reviewCount": 37,
    "isHot": false,
    "images": [
      { "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }
    ],
    "ratingBreakdown": {
      "overall": 4.92,
      "cleanliness": 4.9,
      "location": 4.95,
      "amenities": 4.8,
      "service": 4.9,
      "value": 4.85,
      "accuracy": 4.95,
      "count": 37
    },
    "host": {
      "name": "Nguyễn Văn A",
      "avatarUrl": "https://res.cloudinary.com/.../avatar.jpg",
      "isKycVerified": true,
      "memberSince": "2024-01",
      "totalProperties": 5,
      "responseRate": null
    }
  }
}
```

Ghi chú field:
- `city`, `district` — owner điền tay trong form admin/owner, **null** nếu chưa điền. FE tự ẩn dòng location nếu cả 2 null.
- `rating`, `reviewCount` — denormalized từ `Property.ratingAvg/reviewCount`, đồng bộ với card list.
- `ratingBreakdown.count` = số review visible. Nếu chưa có review → tất cả score = 0, FE tự ẩn section breakdown khi `count === 0`.
- `host.isKycVerified` = `kycBypass === true || kycStatus === 'approved'`.
- `host.memberSince` định dạng `YYYY-MM` (UTC) — FE format hiển thị theo locale.
- `host.responseRate` — luôn `null` ở v1, sẽ tính sau khi có data response time từ chat module.
- `isHot` — admin curated badge (xem §4.10).

**FE migration**: bỏ workaround scan `/properties/search` → map slug → id → `/share/:id`. Gọi thẳng `/properties/public/:slug`.

### 4.12 Similar properties — `GET /properties/public/:slug/similar`

Carousel "Cơ sở khác" ở cuối trang property detail customer web. Public, không cần auth.

**Query**:

| Param | Kiểu | Default | Ghi chú |
|---|---|---|---|
| `limit` | int 1–20 | 8 | Số lượng tối đa trả về |

**Algorithm**:
1. Tra property nguồn theo `slug` (`isActive=true, deletedAt=null`); slug không tồn tại → 404.
2. Build `OR` filter theo độ ưu tiên: cùng `district` → cùng `city` → cùng `type` (PostgreSQL gộp tất cả, không weighted scoring).
3. Loại bỏ chính property nguồn + bất kỳ property `inactive | deleted | moderationStatus != 'approved'`.
4. Sort: `isHot desc → ratingAvg desc → reviewCount desc → createdAt desc`. Lấy top `limit`.

**Response**:

```json
{
  "success": true,
  "message": "Lấy danh sách cơ sở thành công",
  "data": [PropertyCardDto, PropertyCardDto, ...]
}
```

Mỗi item dùng shape `PropertyCardDto` (§4.6). `isFavorited` luôn `false` (endpoint public, không attempt resolve user).

### 4.13 Public list theo owner — `GET /properties/public/by-owner/:ownerId`

Endpoint **public** (no auth) cho use case "chủ nhà share lịch phòng vào nhóm Zalo": OWNER copy link `webhalong24h.com/zalo-cal/<ownerId>`, dán vào nhóm Zalo, các SALE click → mở web thấy hết phòng của OWNER kèm SĐT để bấm Zalo gọi nhanh, không cần đăng nhập.

- Tra theo `ownerId` (UUID của User). Owner không tồn tại / `isActive=false` / `bannedAt != null` / `deletedAt != null` → **404**.
- Chỉ trả property `isActive=true, deletedAt=null, moderationStatus='approved'` (không lộ pending/rejected/suspended).
- Sort: `isHot desc → name asc`.
- Không cần filter ngày — endpoint chỉ liệt kê phòng, SALE bấm sang `GET /calendar/public-grid?propertyId=...` (§6.1) để xem lịch trống.

**Response**:

```json
{
  "success": true,
  "message": "Lấy danh sách cơ sở của chủ nhà thành công",
  "data": {
    "owner": {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "phone": "0901234567",
      "avatarUrl": "https://res.cloudinary.com/.../avatar.jpg"
    },
    "items": [PropertyCardDto, PropertyCardDto, ...],
    "total": 10
  }
}
```

Mỗi item dùng shape `PropertyCardDto` (§4.6). `isFavorited` luôn `false` (public, không attempt resolve user). `owner.phone` có thể `null` nếu OWNER chưa cập nhật SĐT — FE phải handle gracefully (ẩn nút Zalo).

> **Lưu ý quyền riêng tư**: endpoint này tiết lộ SĐT của OWNER và danh sách phòng. Đây là chủ ý — OWNER chủ động share link Zalo cho team SALE. Nếu sau này cần revoke được link (vd: thay đổi đội ngũ), sẽ phải thêm field `User.publicShareToken` và đổi endpoint sang `/properties/public/by-token/:token` (defer khi cần).

### 4.14 Public share detail — `GET /properties/share/:id`

Endpoint **public** (no auth) cho use case "OWNER share thông tin 1 phòng cụ thể qua Zalo/Messenger/Facebook" — link trỏ về `https://preview.halong24h.com/{propertyId}`. Trang preview hiển thị **đầy đủ thông tin phòng** nhưng **CHE giá bán**:

- **CÓ** trả `host` (tên + avatar + KYC + memberSince + totalProperties) — **v1.38**: bổ sung để trang preview hiển thị chủ nhà. **Vẫn KHÔNG** trả SĐT/email chủ nhà (chat-mediated).
- **CÓ** trả `ratingBreakdown` (6 tiêu chí) + `rating` (alias `ratingAvg`) — **v1.38**: đồng bộ với `GET /properties/public/:slug`.
- **KHÔNG** trả giá bán phòng (`weekdayPrice`, `weekendPrice`, `holidayPrice` — tuyệt đối không xuất hiện trong response).
- **CÓ** trả giá phụ thu (`adultSurcharge`, `childSurcharge`) — vì đây là policy phòng, không phải giá bán.

Visibility: tuân theo rule §4.1 (property `isActive=true, deletedAt=null, moderationStatus='approved'` + owner còn entitlement). Sai → **404**.

**Response shape (v1.38 — bổ sung `host` + `ratingBreakdown` + `rating`; v1.16.6 — surcharge + floorArea + city/district + slug + isHot):**

```json
{
  "success": true,
  "message": "...",
  "data": {
    "id": "uuid",
    "slug": "b1503-03",
    "name": "B1503",
    "code": "03",
    "type": 1,
    "view": "sea",
    "address": "Toà Alacarte",
    "city": "Hạ Long",
    "district": "Bãi Cháy",
    "latitude": 20.95,
    "longitude": 107.05,
    "mapLink": "https://maps.google.com/...",
    "bedrooms": 2,
    "bathrooms": 1,
    "standardGuests": 2,
    "standardChildren": 2,
    "maxGuests": 4,
    "floorArea": 45,
    "adultSurcharge": 200000,
    "childSurcharge": 100000,
    "amenities": ["ac", "wifi", "tv", "pool"],
    "description": "Alacarte căn góc...",
    "rules": "Check-in sau 14:00...",
    "services": ["Đưa đón sân bay"],
    "cancellationPolicy": 1,
    "checkInTime": "14:00",
    "checkOutTime": "12:00",
    "ratingAvg": 4.92,
    "rating": 4.92,
    "reviewCount": 37,
    "isHot": false,
    "images": [
      { "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }
    ],
    "ratingBreakdown": {
      "overall": 4.92,
      "cleanliness": 4.9,
      "location": 4.95,
      "amenities": 4.8,
      "service": 4.9,
      "value": 4.85,
      "accuracy": 4.95,
      "count": 37
    },
    "host": {
      "name": "Nguyễn Văn A",
      "avatarUrl": "https://res.cloudinary.com/.../avatar.jpg",
      "isKycVerified": true,
      "memberSince": "2024-01",
      "totalProperties": 5,
      "responseRate": null
    }
  }
}
```

Ghi chú field:
- `host` (v1.38) — chủ nhà: `name`, `avatarUrl`, `isKycVerified` (`kycBypass || kycStatus='approved'`), `memberSince` (`YYYY-MM` UTC), `totalProperties` (số phòng active), `responseRate` (luôn `null` ở v1). **Không** có SĐT/email.
- `rating` (v1.38) — alias của `ratingAvg` để đồng bộ tên với public/:slug.
- `ratingBreakdown` (v1.38) — điểm 6 tiêu chí của review visible; `count=0` khi chưa có review → FE tự ẩn section.
- `floorArea` (m²) — `null` nếu owner chưa điền. FE tự ẩn dòng diện tích.
- `adultSurcharge`, `childSurcharge` (VND) — có thể `null` nếu owner chưa cấu hình → FE hiểu là "không thu phụ thu" / "miễn phí".
- `city`, `district` — display-only (owner điền tay), `null` nếu chưa nhập.
- `mapLink` — link Google Maps owner gắn, có thể `null`.
- `cancellationPolicy` — 0=FLEXIBLE, 1=MODERATE, 2=STRICT (xem [§19 Enums](#19-enums-reference)).
- `ratingAvg`, `reviewCount` — denormalized; `ratingAvg=0` khi `reviewCount=0` → FE tự ẩn rating section.
- `isHot` — admin curated badge.
- `images[]` — đã sort `order` asc; mỗi item có `isCover` để FE chọn ảnh đầu.

**Field cố ý KHÔNG trả** (để FE biết chắc không phải BE quên):
- `weekdayPrice`, `weekendPrice`, `holidayPrice` — giá bán phòng (vẫn ẩn ở link preview).
- `ownerId`, SĐT/email chủ nhà — chỉ trả `host` (name/avatar/KYC/memberSince), KHÔNG có liên hệ trực tiếp.
- `moderationStatus`, `isActive`, `deletedAt` — trạng thái internal.

---

## 5. Bookings

Base path: `/bookings`. Auth required.

### 5.1 Endpoints

| Method | Path | Role | Body / Query |
|---|---|---|---|
| `GET` | `/bookings?propertyId&status&page&limit` | ADMIN/OWNER/SALE | — |
| `GET` | `/bookings/my-bookings?status&page&limit` | Any auth | — |
| `GET` | `/bookings/calendar/:propertyId?year&month` | ADMIN/OWNER/SALE | Lịch tháng cho 1 property |
| `GET` | `/bookings/:id` | Any auth (xem §5.3.1) | ADMIN/OWNER/SALE thấy booking trong scope; **CUSTOMER thấy booking của chính mình** (`booking.customerId === user.id`). Khác → 403 |
| `POST` | `/bookings/hold` | ADMIN/OWNER/SALE (CUSTOMER bị chặn) | Hold 30 phút |
| `POST` | `/bookings/customer-hold` | CUSTOMER (+all) | Hold 30 phút |
| `PATCH` | `/bookings/:id/confirm` | ADMIN/OWNER/SALE | HOLD → CONFIRMED |
| `PATCH` | `/bookings/:id/paid` | ADMIN/OWNER/SALE | `{ amount? }` Ghi nhận thu tiền (cọc). Xem §5.4 |
| `PATCH` | `/bookings/:id/checkin` | ADMIN/OWNER/SALE | `{ amount? }` **(v1.31)** Xác nhận khách nhận phòng + thu nốt tiền → COMPLETED. Xem §5.5 |
| `POST` | `/bookings/:id/deposit-proof` | Any auth (khách của booking) | `{ proofUrl }` **(v1.31)** Khách gửi ảnh bill CK cọc. Xem §5.6 |
| `PATCH` | `/bookings/:id/cancel` | ADMIN/OWNER/SALE | Body optional `{ reason?: string }` (10–500 ký tự nếu gửi). Reason KHÔNG lưu DB; được forward vào email gửi khách + subtitle push notification. |
| `PATCH` | `/bookings/:id/customer-cancel` | Any auth | Customer huỷ HOLD của mình |
| `PUT` | `/bookings/:id` | ADMIN/OWNER/SALE | Update customerName/Phone/guests/notes/deposit |

### 5.2 POST /bookings/hold body

```json
{
  "propertyId": "uuid",
  "checkinDate": "2026-06-15",
  "checkoutDate": "2026-06-17",
  "customerName": "Nguyễn Văn A",
  "customerPhone": "0901234567",
  "depositAmount": 500000,
  "guestCount": 4,
  "notes": "..."
}
```

**Validate ngày** (áp dụng cả `POST /bookings/hold` và `POST /bookings/customer-hold`):
- `checkin < checkout` — sai → 400 `checkoutBeforeCheckin`.
- `checkin >= hôm nay` (đầu ngày theo lịch VN, UTC+7) — cho phép **đặt từ hôm nay trở đi**; chỉ ngày đã qua mới 400 `checkinInPast`. (Trước đây so với thời điểm hiện tại nên chặn nhầm cả hôm nay — đã sửa.)

### 5.2.1 POST /bookings/customer-hold body (v1.26 · 2026-07-07 — thu đủ thông tin khách)

Khách (CUSTOMER) đặt giữ chỗ **30 phút** (v1.35 · trước là 24h). Từ v1.26 **bắt buộc gửi thông tin liên hệ** để booking có đủ dữ liệu (trước đây chỉ lưu `customerId`). Hết 30 phút không được owner xác nhận → cron tự huỷ (chuyển CANCELLED). Countdown dùng `holdRemainingSeconds` (server-computed).

```json
{
  "propertyId": "uuid",           // bắt buộc
  "checkinDate": "2026-07-10",    // bắt buộc, >= hôm nay
  "checkoutDate": "2026-07-12",   // bắt buộc, > checkin
  "customerName": "Nguyễn Văn A", // BẮT BUỘC (≤100 ký tự)
  "customerPhone": "0901234567",  // BẮT BUỘC — 10 số bắt đầu 0
  "customerEmail": "a@example.com", // optional — validate email nếu gửi
  "adults": 2,                    // optional — số người lớn (>=1)
  "children": 0,                  // optional — trẻ em 6–11 tuổi (>=0)
  "guestCount": 2,                // optional legacy — nếu gửi adults thì BE tự tính tổng = adults + children
  "notes": "Yêu cầu đặc biệt..."  // optional, ≤500 ký tự
}
```

| Field | Bắt buộc | Validate / lỗi |
|---|---|---|
| `customerName` | ✅ | string ≤100. Thiếu → 400 |
| `customerPhone` | ✅ | `^0\d{9}$` (10 số, bắt đầu 0). Sai → 400 |
| `customerEmail` | ❌ | định dạng email ≤150 nếu gửi |
| `adults` / `children` | ❌ | int; tổng khách = `adults + children`. Nếu không gửi adults → fallback `guestCount` hoặc 2 |
| Tổng khách > `property.maxGuests` | — | **400 `bookings.guestExceedsMax`** |

> **Breaking cho FE khách**: `customerName` + `customerPhone` giờ **bắt buộc** — form web/app đặt phòng phải gửi (đúng như form "Thông tin liên hệ" đang có). Client cũ chỉ gửi propertyId/ngày sẽ nhận 400 với `errors` từng field. `POST /bookings/hold` (staff) không đổi.

### 5.3 BookingDto

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "saleId": "uuid?",
  "customerId": "uuid?",
  "customerName": "Nguyễn Văn A",
  "customerPhone": "0901234567",
  "customerEmail": "a@example.com",
  "adults": 2,
  "children": 0,
  "checkinDate": "2026-06-15",
  "checkoutDate": "2026-06-17",
  "status": 0,
  "holdExpireAt": "2026-06-04T11:00:00.000Z",
  "holdRemainingSeconds": 1700,
  "depositAmount": 500000,
  "totalAmount": 4000000,
  "paidAmount": 0,
  "remainingAmount": 4000000,
  "paidAt": null,
  "priceBreakdown": {
    "nights": 2,
    "lineItems": [
      { "date": "2026-06-15", "type": "weekday", "amount": 2000000 },
      { "date": "2026-06-16", "type": "weekday", "amount": 2000000 }
    ],
    "extraAdults": 0,
    "extraChildren": 0,
    "surchargePerNight": 0,
    "surchargeTotal": 0,
    "roomTotal": 4000000,
    "total": 4000000
  },
  "guestCount": 4,
  "notes": "...",
  "propertyName": "Villa Bãi Cháy",
  "nights": 2,
  "code": "HL-A1B2C3D4",
  "propertySlug": "villa-bai-chay-vl001",
  "coverImageUrl": "https://res.cloudinary.com/.../cover.jpg",
  "host": { "name": "Nguyễn Văn A", "phone": null },
  "cancellationPolicy": 1,
  "hasReview": false,
  "canReview": false,
  "reviewUnlockAt": "2026-06-17T05:00:00.000Z",
  "depositDeadlineAt": "2026-06-04T11:00:00.000Z",
  "depositProofUrl": null,
  "checkedInAt": null,
  "completedAt": null
}
```

Status: `0=HOLD, 1=CONFIRMED, 2=CANCELLED, 3=COMPLETED, 4=NO_SHOW`

**Field check-in / bill cọc (v1.31 · 2026-07-09):**
- `depositProofUrl: string | null` — URL ảnh bill chuyển khoản cọc khách gửi (§5.6). Owner xem để đối chiếu trước khi ghi nhận cọc.
- `checkedInAt: ISO | null` — thời điểm owner xác nhận khách nhận phòng (§5.5).

**Field mở rộng cho customer web (v1.16, áp dụng cho `findOne`, `getMyBookings`, `findAll`):**

| Field | Kiểu | Ghi chú |
|---|---|---|
| `code` | `string` | Mã hiển thị `HL-XXXXXXXX` (8 ký tự hex đầu của booking id, upper-case). Khách dùng để đối chiếu khi liên hệ chủ nhà. Derive ở BE — không lưu DB |
| `propertySlug` | `string \| null` | Slug property → FE build URL `/property/{slug}` |
| `coverImageUrl` | `string \| null` | Ảnh cover (fallback ảnh đầu danh sách) |
| `host` | `{ name, phone } \| null` | Chủ nhà. **`phone` CHỈ trả khi `status >= CONFIRMED` (= 1, 3, 4)** — tránh leak số trước khi cọc. HOLD/CANCELLED → `phone = null` |
| `cancellationPolicy` | `0 \| 1 \| 2 \| null` | Chính sách huỷ của property: 0=FLEXIBLE, 1=MODERATE, 2=STRICT. Xem [§19 Enums](#19-enums-reference) |
| `hasReview` | `boolean` | True nếu customer đã review booking này. |
| `canReview` (v1.33) | `boolean` | True **chỉ khi**: `status=COMPLETED` **và** chưa review **và** đã qua **12h trưa ngày trả phòng**. FE dùng cờ này để enable nút "Đánh giá" (KHÔNG chỉ dựa `status=COMPLETED` — vì check-in có thể đưa booking sang COMPLETED sớm khi khách chưa trả phòng). |
| `reviewUnlockAt` (v1.33) | `ISO \| null` | Mốc mở đánh giá = `checkoutDate + 12h trưa VN`. FE hiển thị "Đánh giá sau {ngày}" khi chưa tới mốc. `null` nếu thiếu checkoutDate. |
| `depositDeadlineAt` | `ISO \| null` | Hạn cọc: HOLD = `holdExpireAt` (countdown khách phải cọc trong cửa sổ này); CONFIRMED/CANCELLED/... = `null` (chưa có business rule riêng cho CONFIRMED) |
| `paymentInfo` | `object \| null` | **Thông tin chuyển khoản + VietQR động** cho khách trả cọc. Xem shape bên dưới |

**`paymentInfo`** — khác `null` khi **đủ tất cả**: `status = CONFIRMED (1)` **và** `paidAt = null` (chưa thu tiền) **và** OWNER đã cấu hình bank đã duyệt (`bankBin` + `bankAccountNumber`). Số tiền cọc (`amount`) = `depositAmount` nếu đã set (staff hold), **fallback tự động 50% `totalAmount`** khi khách tự đặt không có `depositAmount` (v1.40). Chỉ `null` khi: chưa CONFIRMED, đã trả (`paidAt`), owner chưa có bank, **hoặc** booking không có cả `depositAmount` lẫn `totalAmount` (không tính được số tiền — chỉ xảy ra khi property chưa có giá).

> ⚠️ **v1.40 fix**: trước đây `paymentInfo` yêu cầu `depositAmount > 0` mới hiện — nhưng khách **tự đặt** (`POST /bookings/customer-hold`) không bao giờ set `depositAmount` (và `confirm` cũng không set) → `paymentInfo` luôn `null` dù owner đã duyệt bank → FE hiện nhầm fallback "Chủ nhà chưa cấu hình VietQR". Nay dùng fallback 50% `totalAmount` (đồng bộ với logic `mark-paid`), nên booking CONFIRMED của khách **luôn** có `paymentInfo` khi owner có bank. **FE web KHÔNG cần nhánh fallback nữa** — nếu vẫn nhận `null` trên booking CONFIRMED thì đó là owner thật sự chưa cấu hình bank (hiếm, vì bank là bắt buộc).

```json
{
  "amount": 500000,                 // depositAmount, hoặc 50% totalAmount (fallback khách tự đặt)
  "content": "HL ABC12345",         // nội dung CK = mã booking đã sanitize (owner đối soát)
  "bank": {
    "bin": "970436",
    "name": "Vietcombank",
    "accountNumber": "0123456789",
    "accountName": "NGUYEN VAN A"
  },
  "qrPayload": "00020101021238..."  // chuỗi EMV VietQR — FE render thành ảnh QR (KHÔNG phải URL ảnh)
}
```

> FE render `qrPayload` thành QR bằng thư viện QR client-side (vd `qrcode`). Khách quét → app ngân hàng tự điền đúng số tiền + nội dung. Sau v1.40, `paymentInfo` trên booking CONFIRMED của khách **luôn** có khi owner đã duyệt bank → FE web đọc thẳng `paymentInfo`, **không dựng nhánh fallback** ("Chủ nhà chưa cấu hình VietQR") nữa. Nhánh đó chỉ đúng khi owner thật sự chưa có bank (case hiếm) — coi như lỗi cấu hình cần báo, không phải trạng thái bình thường.

> **Bảo mật (mới):** trong mọi booking response (`findAll`, `findOne`, `getMyBookings`), `property.owner` CHỈ gồm `{ id, name, phone }` — **KHÔNG** chứa 4 field bank (`bankBin` / `bankName` / `bankAccountNumber` / `bankAccountName`). Thông tin bank chỉ được lộ qua `paymentInfo` khi đủ điều kiện (CONFIRMED + chưa trả + owner đã cấu hình bank). Trước đây các field bank bị include raw trên mọi row (kể cả HOLD/CANCELLED, và với cả SALE) — nay đã strip khỏi response.

**Luồng thanh toán đầy đủ**: khách gửi yêu cầu đặt (HOLD) → OWNER/SALE `PATCH /bookings/:id/confirm` (→ CONFIRMED, `paymentInfo` xuất hiện) → khách quét QR chuyển cọc → OWNER/SALE `PATCH /bookings/:id/mark-paid` (set `paidAt`, `paymentInfo` → `null`). **Mới:** khi `mark-paid` thành công, nếu khách có tài khoản + email + SMTP cấu hình → BE tự gửi **email xác nhận booking** (`sendBookingConfirmed`: mã booking, ngày nhận/trả, số tiền đã thu, liên hệ chủ nhà). Fire-and-forget, không chặn response.

**Field tạm thời chưa có (BE đang chờ schema):**

- ~~`vietqr` CHƯA trả về~~ → **ĐÃ CÓ** (mới): xem field `paymentInfo` bên dưới. OWNER cấu hình bank trong profile (`bankBin`, `bankName`, `bankAccountNumber`, `bankAccountName`); BE tự sinh VietQR động cho khách trả cọc.
- `approvedAt` (timestamp HOLD → CONFIRMED) — **CHƯA có field DB riêng**. FE dùng `updatedAt` làm proxy khi `status >= CONFIRMED` (chấp nhận sai số nếu booking đã được update sau confirm). BE sẽ bổ sung field `confirmedAt` trong migration sau nếu FE cần độ chính xác.

**Status `3=COMPLETED` (auto-complete)**: cron mỗi giờ tự chuyển booking `CONFIRMED` → `COMPLETED` khi đã qua **12h trưa (giờ VN) ngày trả phòng**. `checkoutDate` lưu dạng `00:00Z` của ngày trả → mốc hoàn thành = `checkoutDate + 5h` (12h VN). VD booking 4/7–6/7 → hoàn thành ~12h trưa 6/7. Khi COMPLETED, set `completedAt`. Mục đích: đóng booking để khách **đánh giá được căn** (review yêu cầu `status=COMPLETED`, xem §review). Độ trễ tối đa ~1h sau mốc trưa.

**Status `4=NO_SHOW`** (v1.14): cron mỗi ngày 03:30 tự đánh khi booking `CONFIRMED` đã qua `checkoutDate > 24h` mà `paidAt = null` (khách không tới + không hoàn tất thanh toán tại chỗ). FE hiển thị label "Khách không đến". App mobile cũ không biết status 4 → rơi vào nhánh default; nên cập nhật bản tiếp theo để hiển thị đúng. **LƯU Ý (mới):** từ khi có auto-complete tại 12h trưa checkout, mọi `CONFIRMED` đã chuyển `COMPLETED` trước mốc +24h nên cron NO_SHOW gần như không còn khớp — giữ lại làm fallback. Nếu cần phát hiện khách không đến, cân nhắc chuyển mốc NO_SHOW sang theo `checkinDate`.

**Field `completedAt: ISO | null`** (mới): timestamp lúc cron auto-complete chạy. Null với booking chưa hoàn thành.

**Tracking cancellation** (v1.14): mọi booking ở status `CANCELLED` có thêm các field:
- `cancelledAt: ISO | null`
- `cancelledByUserId: string | null` (null = system/cron expire)
- `cancelledByRole: 0|1|2|3 | null` (0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER)
- `cancelledReason: string | null` (pass-through từ body cancel, không enforce length)

**Tiền booking (v1.29 · 2026-07-09 — BE tự tính totalAmount, tách bạch cần thu vs đã thu):**

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `totalAmount` | `int \| null` | **Tổng tiền phòng** BE tự tính từ bảng giá cơ sở, **set ở MỌI trạng thái** (hold/customer-hold, tính lại khi confirm + `PUT /bookings/:id`). `null` **chỉ khi** property chưa cấu hình giá (`weekdayPrice = null`) — FE hiện "Chưa chốt giá", KHÔNG hardcode 0 ₫. |
| `depositAmount` | `int \| null` | Tiền cọc **CẦN thu** (staff nhập lúc `POST /bookings/hold`, hoặc `PUT`). Booking khách (`customer-hold`) mặc định `null`. **KHÔNG phải** tiền đã thu. |
| `paidAmount` | `int` | Tiền **ĐÃ thu** — **mặc định `0`** (không còn null), set thực khi `PATCH /bookings/:id/paid`. |
| `remainingAmount` | `int \| null` | `= max(0, totalAmount − paidAmount)`. `null` khi `totalAmount = null`. BE trả sẵn — FE không tự trừ. |
| `paidAt` | `ISO \| null` | `null` cho tới khi mark-paid. |
| `priceBreakdown` | `object \| null` | Chi tiết tính giá để hiển thị minh bạch (xem dưới). `null` khi chưa cấu hình giá. |

**`priceBreakdown` shape:**
```json
{
  "nights": 3,
  "lineItems": [
    { "date": "2026-07-15", "type": "weekday", "amount": 1000000 },
    { "date": "2026-07-16", "type": "weekday", "amount": 1000000 },
    { "date": "2026-07-17", "type": "weekend", "amount": 1500000 }
  ],
  "extraAdults": 2,
  "extraChildren": 1,
  "surchargePerNight": 500000,
  "surchargeTotal": 1500000,
  "roomTotal": 3500000,
  "total": 5000000
}
```

**Công thức `totalAmount`** (chốt 2026-07-09):
- `nightly(d)` = `holidayPrice` nếu d là ngày lễ; `weekendPrice` (fallback `weekdayPrice` nếu null) nếu `dow(d) ∈ {0=CN, 5=T6, 6=T7}`; ngược lại `weekdayPrice`.
- `extraAdults = max(0, adults − standardGuests)`; `extraChildren = max(0, children − standardChildren)`.
- `surchargePerNight = extraAdults × adultSurcharge + extraChildren × childSurcharge` (field null → 0).
- `totalAmount = Σ nightly(d) + surchargePerNight × nights`.
- Staff hold chỉ có `guestCount` → coi toàn bộ là người lớn (children=0) cho phụ thu.
- **Ngày lễ (v1.30)**: BE tự áp `holidayPrice` cho **lễ dương lịch cố định** (lặp hằng năm): **01/01** (Tết Dương lịch), **30/04**, **01/05**, **02/09**. Lễ **âm lịch** (Tết Nguyên đán, Giỗ Tổ 10/3 ÂL) đổi ngày dương mỗi năm → hiện **chưa** liệt kê; sẽ bổ sung theo từng năm khi cần (constant `LUNAR_HOLIDAY_DATES` trong `booking-pricing.ts`).

- **Countdown HOLD**: dùng `holdRemainingSeconds` (server-computed, đã tính cả lệch giờ client), không tự tính `holdExpireAt - Date.now()`.
- **mark-paid**: `PATCH /bookings/:id/paid { amount? }` ghi `paidAmount = amount`; nếu bỏ trống → fallback `depositAmount` (giữ hành vi cũ: ghi nhận cọc), rồi `totalAmount`. **KHÔNG** ghi đè `totalAmount`. "Tổng" và "Đã thu" là 2 số độc lập.

### 5.3.1 GET /bookings/:id — quyền truy cập + response giàu hơn list

**Quyền truy cập (v1.16):**
- ADMIN/OWNER/SALE: theo scope effective owner như cũ.
- **CUSTOMER**: truy cập được nếu `booking.customerId === user.id`. Người khác → 403 `bookings.forbiddenAccess`.

FE web khách hàng giờ gọi `GET /bookings/:id` trực tiếp thay vì lọc trong `/bookings/my-bookings` để lấy detail.

Detail include thêm so với item trong list:
- `property.images` — 5 ảnh đầu (sort `order` asc), không bị giới hạn `isCover`.
- `property.owner` — `{ id, name, phone }`.
- `property.cancellationPolicy` — số 0/1/2.
- `sale` — `{ id, name, phone }` (giống list).
- `review` — `{ id }` hoặc null (dùng để derive `hasReview`).

Field flatten thêm so với list: tất cả field §5.3 mở rộng (`code`, `propertySlug`, `coverImageUrl`, `host`, `cancellationPolicy`, `hasReview`, `depositDeadlineAt`) đều có ở cả detail và list.

### 5.3.2 PATCH /bookings/:id/cancel — Email khách kèm lý do

- Body optional: `{ reason?: string }` (`MinLength=10`, `MaxLength=500` nếu gửi). Bỏ trống cũng huỷ được.
- Reason **không lưu DB** (theo yêu cầu sản phẩm) — chỉ pass-through vào:
  - Email `booking_cancelled` gửi `booking.customer.email` (nếu khách có account + có email + SMTP cấu hình). Email kèm `propertyName`, `checkinDate`, `checkoutDate`, `reason`, `owner.name`, `owner.phone` để khách tiện liên hệ lại.
  - In-app notification subtitle của customer (vd: "Villa A đã được huỷ — Chủ nhà có việc đột xuất").
- Email không chặn flow: thất bại SMTP → log, vẫn trả `cancelSuccess`.
- Booking từ luồng customer chưa có account (`customerId=null`) → bỏ qua email.

### 5.4 PATCH /bookings/:id/paid

Body optional: `{ amount? }` — số tiền cọc OWNER ghi nhận. Ghi `paidAmount` + `paidAt`. Nếu booking đang HOLD → tự chuyển sang CONFIRMED + clear `holdExpireAt`. **KHÔNG** ghi đè `totalAmount`.

**Số cọc ghi nhận (v1.34 · 2026-07-09)** — thứ tự ưu tiên:
1. `amount` OWNER nhập trong body.
2. `depositAmount` đã set lúc tạo booking (staff hold).
3. **Tự động 50% `totalAmount`** (khi property đã có giá) — mặc định mới.
4. `0` → 400 `paidAmountRequired` (property chưa cấu hình giá, OWNER phải nhập tay).

> Trước v1.34 fallback bước 3 là `totalAmount` (100%). Nay đổi sang 50% cho đúng nghiệp vụ "ghi nhận **cọc**". OWNER muốn thu khác 50% thì nhập `amount` tường minh; thu nốt phần còn lại ở bước check-in (§5.5).

**Email xác nhận cho khách (v1.34)** — khi ghi nhận cọc thành công, BE gửi email `booking_confirmed` (mã booking + ngày nhận/trả + tổng/cọc/còn lại + liên hệ chủ nhà). Gửi tới **email tài khoản khách HOẶC email liên hệ trên form đặt (`customerEmail`)** — trước đây chỉ gửi khi khách có tài khoản kèm email, nay khách đặt bằng SĐT + điền email liên hệ cũng nhận được. Fire-and-forget.

> **Phân biệt luồng thanh toán** (FE đa nền tảng phải wire đúng):
> - `PATCH /bookings/:id/paid` — **OWNER/SALE ghi nhận tiền cọc/tiền phòng của KHÁCH** (chuyển khoản tay, tiền mặt, thanh toán offline). Chỉ ảnh hưởng `Booking.paidAmount/paidAt`.
> - `POST /payments/initiate` (§10.2) — **OWNER mua/gia hạn gói subscription của hệ thống Halong24h** (VietQR). Tạo `PaymentSession`, không liên quan booking khách.
> - 2 endpoint này không thay thế nhau. Dùng đúng theo use case.

### 5.5 PATCH /bookings/:id/checkin — Xác nhận nhận phòng + thu nốt → hoàn tất (v1.31)

Bước cuối luồng booking: đến ngày nhận phòng, owner xác nhận khách đã đến và thu nốt tiền phòng.

- **Role**: ADMIN / OWNER / SALE (+ permission `bookings.canUpdate`).
- **Yêu cầu**: booking đang `CONFIRMED (1)` → sai trạng thái 400 `bookings.onlyCheckinConfirmed`.
- Body optional `{ amount? }`:
  - `amount` gửi → **cộng dồn**: `paidAmount = paidAmount_cũ + amount`.
  - `amount` bỏ trống → thu cho đủ: `paidAmount = totalAmount` (phần còn lại). Nếu property chưa có giá (`totalAmount=null`) → giữ nguyên `paidAmount`.
- Side-effect: set `checkedInAt = now`, `paidAt` (nếu chưa có), chuyển `status = COMPLETED (3)` + `completedAt = now`.
- Notify owner (`booking_completed`) + khách (`booking_completed`, "có thể đánh giá"). Gửi email hoàn tất cho khách (kèm tổng/cọc/đã thu/còn lại).
- Sau COMPLETED → khách **đánh giá được** (review yêu cầu `status=COMPLETED`).

> **"Done" của booking**: (1) owner chủ động qua `PATCH /checkin` (khuyến nghị — đúng luồng nghiệp vụ), HOẶC (2) **fallback** cron auto-complete lúc 12h trưa ngày trả phòng nếu owner không thao tác. Cả hai đều đưa về `COMPLETED`.

**Nhắc check-in tự động**: cron mỗi ngày **15h (giờ VN)** push owner (`booking_checkin_reminder`) cho mọi booking `CONFIRMED` có `checkinDate = hôm nay` và chưa check-in (`checkedInAt=null`) → owner vào xác nhận nhận phòng + thu nốt.

### 5.6 POST /bookings/:id/deposit-proof — Khách gửi ảnh bill CK cọc (v1.31)

Sau khi owner xác nhận (CONFIRMED), khách chuyển khoản cọc rồi **gửi ảnh bill** để owner đối chiếu.

- **Auth**: Bearer — chỉ **khách của booking** (`customerId === user.id`) hoặc ADMIN/owner-scope. Người khác → 403.
- **Yêu cầu**: booking `CONFIRMED` **và** chưa ghi nhận thanh toán (`paidAt = null`) → sai → 400 `bookings.depositProofInvalidState`.
- Body: `{ proofUrl }` — URL **https** (khách upload ảnh qua `POST /uploads` §23 trước, lấy URL gửi vào đây). 1 ảnh/booking (gửi lại → ghi đè).
- Lưu `depositProofUrl`; push owner (`booking_deposit_proof`) để vào đối chiếu và bấm `PATCH /bookings/:id/paid` ghi nhận cọc.
- Response: BookingDto (có `depositProofUrl`).

**Luồng đầy đủ (khách web + owner app):**
```
Khách đặt (customer-hold, HOLD)
  → Owner xác nhận (PATCH /confirm → CONFIRMED)
  → Khách chuyển cọc + POST /deposit-proof {proofUrl}  ← khách gửi ảnh bill
  → Owner đối chiếu ảnh, PATCH /paid {amount} ghi nhận cọc  → BE gửi email đơn+giá cho khách
  → (Ngày nhận phòng 15h) cron nhắc owner
  → Owner PATCH /checkin {amount?} xác nhận nhận phòng + thu nốt  → COMPLETED
  → Khách đánh giá
```

---

## 6. Calendar

Base path: `/calendar`.

### 6.1 Endpoints

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/calendar/properties?type&ownerId` | Bearer | List properties cho calendar |
| `GET` | `/calendar/public-grid?startDate&endDate&propertyId?&propertyIds?&type?` | Public | Master calendar không cần auth |
| `GET` | `/calendar/grid?startDate&endDate&propertyId?&propertyIds?&type?` | Bearer | Same nhưng kèm note (tên khách) |
| `POST` | `/calendar/lock` | Bearer | `{ propertyId, date, status? }` → `{ message, data: null }` |
| `DELETE` | `/calendar/lock` | Bearer | `{ propertyId, date }` → `{ message, data: null }` |
| `PATCH` | `/calendar/sold` | Bearer | `{ propertyId, date }` → `{ message, data: null }` |
| `POST` | `/calendar/bulk` | Bearer | `{ mode: "lock"\|"unlock", items: [{propertyId, date}] }` (≤100 items) |
| `GET` | `/calendar/admin-contact` | Public | Phone/email admin để khách liên hệ |

**Query params (grid / public-grid):**

- `startDate`, `endDate` (YYYY-MM-DD, required)
- `propertyId` (UUID, optional) — chọn 1 property
- `propertyIds` (optional) — chọn nhiều property cùng lúc. Chấp nhận **CSV** (`?propertyIds=uuid1,uuid2`) **hoặc** array repeat (`?propertyIds=uuid1&propertyIds=uuid2`)
- `type` (optional, number) — filter theo loại property
- Nếu không truyền `propertyId` và `propertyIds` → trả tất cả properties của user (grid) hoặc tất cả properties public (public-grid)

> **Visibility `public-grid` (v1.25 · 2026-07-06)**: chỉ trả property `isActive=true` AND `deletedAt=null` AND **`moderationStatus='approved'`** — đồng bộ với web khách hàng (§4.1). Phòng đã xóa (`isActive=false`), chờ duyệt (`pending`), bị từ chối/tạm ngưng đều **KHÔNG** hiện trên public-grid. `GET /calendar/grid` (auth, nội bộ) vẫn hiển thị phòng của OWNER/SALE kể cả pending để họ quản lý.

### 6.2 Grid response

```json
{
  "properties": [
    {
      "id": "uuid", "name": "...", "type": 0,
      "ownerPhone": "0912345678",
      "days": [
        { "date": "2026-06-15", "status": "available", "note": null, "bookingId": null },
        { "date": "2026-06-16", "status": "hold", "note": "Nguyễn Văn A", "bookingId": "..." },
        { "date": "2026-06-17", "status": "booked", "note": "...", "bookingId": "..." },
        { "date": "2026-06-18", "status": "locked", "note": null, "bookingId": null }
      ]
    }
  ]
}
```

Status string: `available | hold | booked | locked`.

`ownerPhone`: số điện thoại owner của property (lấy từ `User.phone` qua `Property.ownerId`). Có thể `null` nếu owner chưa cập nhật phone — FE phải handle gracefully (vd nút Zalo no-op). Trả về ở cả `/calendar/grid` và `/calendar/public-grid`.

### 6.3 Bulk response

```json
{
  "mode": "lock",
  "total": 30,
  "succeeded": 28,
  "failed": 2,
  "results": [
    { "propertyId": "...", "date": "2026-06-15", "ok": true },
    { "propertyId": "...", "date": "2026-06-16", "ok": false, "error": "Ngày này đã được khoá hoặc đặt" }
  ]
}
```

---

## 7. Reviews

### 7.1 Customer + Public

| Method | Path | Role | Body |
|---|---|---|---|
| `POST` | `/properties/:id/reviews` | CUSTOMER | `{ bookingId, cleanliness, location, amenities, service, value, accuracy (1-5), comment?, photos?[] }` |
| `GET` | `/properties/:id/reviews?page&pageSize&sort&minRating` | Public | sort: `newest\|oldest\|highest\|lowest` |

> **Điều kiện đánh giá (v1.33)**: booking phải `status=COMPLETED` **VÀ** đã qua **12h trưa (giờ VN) ngày trả phòng** (`checkoutDate + 5h`) **VÀ** chưa review. Chưa tới mốc → 400 `reviews.reviewNotYetAllowed` ("Chỉ có thể đánh giá sau 12h trưa ngày trả phòng"). Lý do: owner check-in (§5.5) đưa booking sang COMPLETED **sớm** khi khách vừa nhận phòng (chưa trả phòng) — nhưng đánh giá chỉ hợp lệ sau khi kết thúc kỳ lưu trú. FE dùng `booking.canReview` / `booking.reviewUnlockAt` (§5.3) để enable nút, không tự suy từ `status`.
| `POST` | `/properties/:id/reviews/:reviewId/reply` | ADMIN/OWNER | `{ reply }` |

### 7.2 Admin moderation

| Method | Path | Body |
|---|---|---|
| `GET` | `/admin/reviews?status=visible\|hidden\|all&rating&search&page&pageSize` | — |
| `GET` | `/admin/reviews/count-flagged` | Badge sidebar |
| `DELETE` | `/admin/reviews/:reviewId` | `{ reason }` ≥5 chars (hide) |
| `POST` | `/admin/reviews/:reviewId/restore` | — |

### 7.3 ReviewDto

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "bookingId": "uuid",
  "customerId": "uuid",
  "cleanliness": 5, "location": 4, "amenities": 5,
  "service": 5, "value": 4, "accuracy": 5,
  "avgRating": 4.67,
  "comment": "Phòng đẹp...",
  "photos": ["https://..."],
  "ownerReply": "Cảm ơn...", "ownerReplyAt": "...",
  "isHidden": false, "hiddenReason": null,
  "createdAt": "...", "updatedAt": "..."
}
```

---

## 7A. Dashboard & Reports

Endpoints KPI cho Owner/Sale/Admin. Auth: Bearer. Roles: ADMIN, OWNER, SALE.

### 7A.1 Endpoints

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/dashboard/stats` | KPI realtime tổng quan hôm nay (occupancy, doanh thu hôm nay/tháng, checkout today) |
| `GET` | `/reports?period&from&to&month?&year?` | Báo cáo mở rộng theo kỳ — KPI, trend, top rooms, ratings, reviews |

**Scope dữ liệu:**
- **OWNER**: chỉ property của mình
- **SALE**: theo `ownerId` được gán (auto-resolve qua `getEffectiveOwnerId`)
- **ADMIN**: toàn hệ thống

### 7A.2 GET /reports — Query params

| Param | Bắt buộc | Giá trị | Ghi chú |
|---|---|---|---|
| `period` | optional | `today` \| `week` \| `month` \| `year` \| `custom` | Mặc định `month`. Timezone server (Asia/Ho_Chi_Minh) |
| `from` | **bắt buộc khi `period=custom`** | `YYYY-MM-DD` | Ngày bắt đầu (inclusive) |
| `to` | **bắt buộc khi `period=custom`** | `YYYY-MM-DD` | Ngày kết thúc (inclusive) |
| `month` | legacy optional | 1–12 | Tương thích API cũ |
| `year` | legacy optional | YYYY | Tương thích API cũ |

**Định nghĩa kỳ:**

| `period` | Khoảng |
|---|---|
| `today` | 00:00 → 24:00 hôm nay |
| `week` | Tuần hiện tại, **Monday-based** (T2 00:00 → T2 tuần sau 00:00) |
| `month` | Tháng dương lịch hiện tại |
| `year` | Năm dương lịch hiện tại |
| `custom` | `[from 00:00, to 23:59]` inclusive |

> ⏱ **Timezone**: Mọi ranh giới ngày (today/week/month/year/custom, validation `to`, label `revenueByDay`, `dayOfWeekOccupancy`) đều tính theo **Asia/Ho_Chi_Minh (UTC+7)**, không phụ thuộc TZ của server. `from`/`to` định dạng `YYYY-MM-DD` được hiểu là ngày VN.

**`previousPeriod`** = kỳ ngay trước cùng độ dài. `custom` N ngày → N ngày trước `from`.

### 7A.3 Validation 400 (mới v1.10)

| Rule | i18n key | Message vi |
|---|---|---|
| `period=custom` thiếu `from` hoặc `to` | `dashboard.missingDateRange` | "Vui lòng cung cấp from và to khi dùng period=custom" |
| `from >= to` hoặc date parse fail | `dashboard.invalidDateRange` | "Ngày from phải trước ngày to" |
| `to` ở tương lai (sau ngày hôm nay theo giờ VN) | `dashboard.toInFuture` | "Ngày to không được ở tương lai" |
| `period` không thuộc 5 giá trị hợp lệ | `dashboard.invalidPeriod` | "Giá trị period không hợp lệ (today \| week \| month \| year \| custom)" |

### 7A.4 Response data shape

```jsonc
{
  "success": true,
  "message": "Lấy dữ liệu báo cáo thành công",
  "data": {
    // ─── KPI (4 ô đầu) ───
    "revenue": 15000000,            // VND tổng kỳ
    "adr": 850000,                  // Average Daily Rate
    "occupancyRate": 72.5,          // 0..100 (%) — top-level scale
    "totalBookings": 42,

    // ─── Donut (status counts trong kỳ) ───
    "holdCount": 3,                 // status=0
    "confirmedCount": 10,           // status=1
    "cancelledCount": 4,            // status=2
    "completedCount": 25,           // status=3

    // ─── So sánh kỳ trước ───
    "previousPeriod": {
      "revenue": 12000000,
      "bookings": 38,
      "occupancy": 65.0,            // 0..100
      "adr": 800000
    },

    // ─── Chart xu hướng (1 điểm/ngày) ───
    "revenueByDay": [
      {
        "date": "2026-06-01",
        "revenue": 500000,
        "bookings": 2,
        "occupancy": 0.75           // 0..1 — chart scale
      }
    ],

    // ─── Top phòng (top 5 theo revenue) ───
    "topRooms": [
      {
        "roomId": "uuid",
        "name": "Phòng 101",
        "coverImage": "https://...",
        "revenue": 3000000,
        "bookings": 8,
        "occupancy": 0.8            // 0..1
      }
    ],

    // ─── Phân tích lưu trú ───
    "dayOfWeekOccupancy": {
      "values": [0.6, 0.7, 0.65, 0.8, 0.9, 0.95, 0.85]  // index 0=T2, 6=CN, 0..1
    },
    "lengthOfStay": {
      "oneNight": 10,
      "twoToThree": 20,
      "fourToSeven": 8,
      "eightPlus": 2
    },

    // ─── Booking gần đây (10 bản, sort createdAt desc) ───
    "recentBookings": [
      {
        "id": "uuid",
        "propertyId": "uuid",
        "checkinDate": "2026-06-10",
        "checkoutDate": "2026-06-12",
        "status": 1,
        "customerName": "Nguyễn A",
        "guestCount": 2,
        "property": { "id": "uuid", "name": "Homestay X", "code": "HS001" },
        "sale": { "id": "uuid", "name": "Sale name" }
      }
    ],

    // ─── Reviews ───
    "ratingSummary": {
      "avgRating": 4.4,               // weighted avg across all properties
      "totalReviews": 25,
      "totalProperties": 3,
      "distribution": { "5": 15, "4": 7, "3": 3, "2": 0, "1": 0 },
      "breakdown": {
        "cleanliness": 4.5, "location": 4.3, "amenities": 4.2,
        "service": 4.6, "value": 4.1, "accuracy": 4.4
      }
    },
    "propertyRatings": [ /* per-property breakdown, sort by avgRating desc */ ],
    "recentReviews": [ /* 5 review mới nhất */ ],

    // ─── Legacy / backward-compat ───
    "totalRooms": 10,
    "activeRooms": 8,
    "totalDeposit": 15000000,        // = revenue (deprecated, FE nên dùng `revenue`)
    "thisMonthBookings": 42,
    "roomsWithCover": 8,
    "roomsWithPrice": 7
  }
}
```

**Scale convention** (CRITICAL — FE đa nền tảng dễ nhầm):
- `occupancyRate` top-level + `previousPeriod.occupancy` = **0..100** (đã ×100, FE chỉ append `%`)
- `revenueByDay[].occupancy` + `topRooms[].occupancy` + `dayOfWeekOccupancy.values[]` = **0..1** (FE ×100 khi plot)

**Nguồn doanh thu (sửa v1.32)**: aggregate **`Booking.paidAmount`** (tiền THỰC thu) của booking `status ∈ {CONFIRMED, COMPLETED}` overlapping kỳ. Revenue mỗi ngày = chia đều `paidAmount / số đêm`. Trước v1.32 dùng `depositAmount` → booking khách (`customer-hold`, `depositAmount=null`) cho doanh thu = 0 dù đã thu đủ tiền; nay dùng `paidAmount` phản ánh đúng tiền đã nhận.

### 7A.5 GET /admin/reports/risk-kpis — Risk KPIs cho trang admin reports

Role: ADMIN. Trả 1 lần đủ cho cards + bảng top host cancel + delta vs kỳ trước.

Query: `?range=week|month|quarter|year` (default `month`). Window: trailing N days.

| range | N ngày |
|---|---|
| week | 7 |
| month | 30 |
| quarter | 90 |
| year | 365 |

Mỗi metric trả `{ value, prev }` để FE tính delta. `prev` = cùng window N ngày liền trước.

```jsonc
{
  "range": "month",
  "rangeDays": 30,
  "disputesOpen":        { "value": 5, "prev": 4 },
  "flaggedReviews":      { "value": 3, "prev": 5 },
  "kycPending":          { "value": 8, "prev": 6 },
  "subscriptionOverdue": { "value": 2, "prev": 2 },   // snapshot — prev = current
  "revenuePaid":         { "value": 15000000, "prev": 12500000 },
  "deletionRequests":    { "value": 2, "prev": 1, "note": "Proxy: User.deletedAt trong kỳ" },
  "cancelRate":          { "value": 3.2, "prev": 3.6, "note": "Aggregate cancelled / total — không tách host vs customer" },
  "hostCancelRate":      { "value": 3.2, "prev": 3.6, "note": "..." },
  "noShowRate":          { "value": 1.8, "prev": 2.0, "note": "..." },
  "topHostCancel": [
    { "ownerId": "uuid", "name": "...", "propertyCount": 3, "bookingCount": 42, "cancelCount": 6, "cancelRate": 14.3 }
  ]
}
```

**Caveats** (FE phải hiển thị note hoặc dấu ":" để user hiểu):
- `disputesOpen`, `flaggedReviews`, `kycPending` đếm theo **createdAt/updatedAt trong kỳ**, không phải snapshot tại thời điểm cuối kỳ. Đủ cho hiển thị delta dạng "biến động trong kỳ".
- `subscriptionOverdue` là **snapshot hiện tại** (past_due bây giờ). `prev = value` vì không có cách rẻ tính snapshot quá khứ. FE ẩn delta cho metric này.
- `deletionRequests` (v1.14): đếm `AccountDeletionRequest` được tạo trong kỳ (cả `pending`, `completed`, `cancelled`). Phản ánh "số yêu cầu xoá account đã nhận trong kỳ".
- `cancelRate` = tổng booking CANCELLED / tổng booking trong kỳ.
- `hostCancelRate` (v1.14, đã unblock): cancellation `cancelledByRole ∈ {OWNER, SALE, ADMIN}` trong kỳ / booking đã cọc (`status ∈ {CONFIRMED, COMPLETED}` hoặc `paidAt != null`) trong kỳ. Booking row cũ trước v1.14 không có `cancelledByRole` → không tính vào tử số (under-count nhẹ trong giai đoạn migration ~30 ngày).
- `noShowRate` (v1.14, đã unblock): số booking có `status=NO_SHOW` đánh trong kỳ / booking đã cọc trong kỳ. Cron mark mỗi ngày 03:30 (xem §19 enum reference). **LƯU Ý (mới):** sau khi thêm auto-complete tại 12h trưa checkout, `CONFIRMED` đã chuyển `COMPLETED` trước mốc +24h → `noShowRate` thực tế sẽ ~0. FE không nên coi đây là chỉ số đáng tin cho tới khi mốc NO_SHOW được rework theo `checkinDate`.
- `topHostCancel`: top 5 owner theo cancellation **host-side** (`cancelledByRole ∈ {OWNER, SALE}`) trong kỳ. `cancelRate` của 1 owner = host-cancel / total bookings của owner đó trong kỳ.

### 7A.7 Endpoints CHƯA wire (roadmap)

FE hiện gom hết vào `GET /reports`. Các path sau đã reserve nhưng **không cần implement** cho release này:

- `GET /reports/occupancy`
- `GET /reports/adr`
- `GET /reports/revpar`
- `POST /reports/export?format=csv|xlsx`

---

## 8. Notifications & Devices

### 8.1 Notifications

Base path: `/notifications`. Auth required.

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/notifications?type&isRead&page&limit` | List — **Shape B** (xem dưới) |
| `GET` | `/notifications/unread-count` | `{ count }` |
| `PATCH` | `/notifications/:id/read` | Mark 1 read |
| `PATCH` | `/notifications/read-all` | Mark all read |

> **Response shape `GET /notifications` (Shape B — đính chính 2026-07-09)**: `data` là **MẢNG** `NotificationDto[]`, phân trang ở `meta` top-level (sibling của `data`), KHÔNG bọc trong object `{ items }`:
> ```jsonc
> { "success": true, "message": "...", "data": [ /* NotificationDto */ ], "meta": { "total": 120, "page": 1, "limit": 50 } }
> ```
> App parse `response.data['data'] as List` → ĐÚNG. Đọc paging ở `response.data['meta']`. (Trước đây §22 C3 liệt kê nhầm endpoint này ở Shape A — đã sửa.)

### 8.2 NotificationDto

```json
{
  "id": "uuid",
  "title": "Đặt phòng được xác nhận",
  "subtitle": "Villa A — booking đã confirm",
  "type": 0,
  "isRead": false,
  "createdAt": "...",
  "targetId": "<bookingId>",
  "targetType": "booking"
}
```

Type: `0=BOOKING, 1=PAYMENT, 2=SYSTEM`.

### 8.3 Devices (FCM)

Base path: `/devices`. Auth required.

| Method | Path | Body | Khi nào gọi |
|---|---|---|---|
| `POST` | `/devices` | `{ fcmToken, platform: "ios"\|"android", deviceModel?, osVersion?, appVersion?, locale? }` | Sau login + mỗi `onNewToken` |
| `DELETE` | `/devices/:token` | — | Trước khi logout |
| `GET` | `/devices` | — | Màn "Quản lý phiên" |

> Idempotent: gọi lại cùng token → no-op. Nếu token đang gắn user khác → tự transfer sang user mới.

### 8.4 FCM push payload

BE gửi **hybrid message** — kèm cả `notification` block (tray auto-display) và `data` block (deep link + metadata). Không phải data-only.

**Top-level `notification`** (Firebase auto-fanout sang cả FCM Android + APNs iOS):
```json
{
  "notification": { "title": "Booking mới", "body": "Villa A — booking đã confirm" },
  "data": {
    "type": "booking_confirmed",
    "targetId": "<bookingId>",
    "deepLink": "/bookings/<bookingId>"
  }
}
```

**APNs config (iOS)** — v1.19+ (2026-07-01) set tường minh `aps.alert` + `mutable-content: 1` + header `apns-push-type: alert` + `apns-priority: 10`:
```json
{
  "apns": {
    "headers": { "apns-priority": "10", "apns-push-type": "alert" },
    "payload": {
      "aps": {
        "alert": { "title": "Booking mới", "body": "..." },
        "sound": "default",
        "badge": 1,
        "mutable-content": 1
      }
    }
  }
}
```

**Vì sao set tường minh**: trước v1.19, chỉ set top-level `notification` + `apns.payload.aps = { sound, badge }` (không có `alert`). Firebase Admin không tự merge `notification` vào `aps.alert` khi `aps` đã được ghi thủ công → APNs coi payload là silent push → iOS **KHÔNG hiện tray khi app killed**. Android không bị ảnh hưởng.

**FE mobile handler** (tránh double notification khi socket vẫn online):
- Foreground: đã có event `message:new` từ WebSocket → FE suppress notification tray thủ công.
- Background/killed: OS tự hiện tray từ `apns.alert` / Android `notification` block. Tap → mở `data.deepLink`.

`pushType` (nằm trong `data.type`): `booking_*` (gồm `booking_created | booking_confirmed | booking_paid | booking_deposit_proof | booking_checkin_reminder | booking_completed`), `payment_*`, `subscription_*`, `chat_message`, `lead_new`, `dispute_opened`, `dispute_resolved`, `subscription_frozen`, `subscription_price_changed`, `kyc_*`, `staff_invite_accepted`, `property_approved | rejected | suspended`, `property_pending_review` (gửi ADMIN khi có phòng mới chờ duyệt, deepLink `/admin/properties/:id`), `property_updated | property_price_updated | property_images_updated`, `calendar_locked | calendar_unlocked | calendar_sold | calendar_bulk_locked | calendar_bulk_unlocked`, `review_created` (gửi OWNER khi khách vừa đánh giá property, deepLink `/properties/:id/reviews`, targetType `review`), ...

> **Booking push mới (v1.31)** — `booking_deposit_proof` (gửi OWNER khi khách gửi ảnh bill cọc → mở booking detail đối chiếu + ghi nhận cọc), `booking_checkin_reminder` (gửi OWNER 15h ngày nhận phòng → xác nhận check-in + thu nốt), `booking_completed` (gửi OWNER + khách khi booking hoàn tất). deepLink `/bookings/:id`.

> **Đồng bộ cả TEAM khi sửa phòng / khoá lịch (NEW).** Khi **bất kỳ thành viên team** (owner hoặc SALE thuộc owner) **sửa phòng** (`property_updated` / `property_price_updated` / `property_images_updated`) hoặc **khoá/mở/đánh dấu-bán lịch** (`calendar_locked` / `calendar_unlocked` / `calendar_sold`) → BE tạo notification + push FCM tới **owner + tất cả SALE của owner đó**, **TRỪ người vừa thao tác** (không tự báo cho chính mình). Nhờ vậy mọi thành viên biết **phòng nào** bị lock/unlock, phòng nào sửa (message luôn kèm `Tên phòng (MÃ)`). Bulk lock/unlock (`POST /calendar/bulk`) gộp **1 push tổng mỗi property** (`calendar_bulk_locked/unlocked`) thay vì mỗi ngày. `deepLink = /host/properties/{propertyId}`, `targetType = 'property'`.

> **`kyc_submitted` (NEW) — gửi cho ADMIN, không phải owner.** Khi owner gửi hồ sơ KYC chờ duyệt (đủ 3 ảnh auto-submit, hoặc `POST /kyc/submit` thủ công), BE tạo notification + push tới **toàn bộ admin** để vào duyệt. `deepLink = /admin/kyc/{submissionId}`, `targetType = 'kyc'`. Phân biệt với `kyc_approved` / `kyc_rejected` gửi cho owner.

> **`review_created` (NEW) — gửi cho OWNER của property.** Khi khách tạo review (`POST /properties/:id/reviews`), BE tạo notification (chuông) + push FCM tới owner: `title = 'Đánh giá mới'`, subtitle `Tên property (MÃ) — khách vừa đánh giá {avgRating}★`. `type = SYSTEM`, `targetType = 'review'`, `targetId = review.id`, `deepLink = /properties/{propertyId}/reviews`. Best-effort, không chặn response tạo review.

---

## 9. KYC

### 9.1 Owner self KYC

Base path: `/kyc`. Role: OWNER.

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/kyc/upload-cccd-front` | multipart `image`, optional `ocrResult` (JSON string) |
| `POST` | `/kyc/upload-cccd-back` | Same |
| `POST` | `/kyc/upload-selfie` | Same |
| `POST` | `/kyc/submit` | Submit → status=pending |
| `GET` | `/kyc/status` | Owner xem trạng thái |
| `GET` | `/kyc/submissions/:id` | Detail (owner hoặc admin) |
| `POST` | `/kyc/submissions/:id/resubmit` | `{ items: ["cccdFront", "selfie"] }` |

Status string: `none | pending | approved | rejected`.

**Response `GET /kyc/status`** (v1.7):

```jsonc
{
  "status": "draft | kycSubmitted | paymentPending | awaitingApproval | approved | rejected | refunded",
  "submissionId": "uuid | null",
  "rejectReason": "string | null",
  "rejectedItems": ["cccdFront", "selfie"],
  "approvedAt": "ISO | null",
  "trialEndsAt": "ISO | null",
  "uploads": { "cccdFront": true, "cccdBack": true, "selfie": false },
  "latestPayment": {                       // null nếu user chưa từng tạo session
    "sessionId": "uuid",
    "status": "pending | paid | expired | failed | refunded",
    "totalAmount": 10000,
    "planId": "starter_test",
    "planLabel": "Starter Test · Tháng",
    "expiresAt": "ISO",
    "qrExpiresAt": "ISO",
    "createdAt": "ISO"
  },
  "subscriptionStatus": "none | trial | active | past_due | cancelled | frozen",
  "subscriptionPlanId": "string | null",
  "subscriptionCycle": "monthly | yearly | null",
  "subscriptionProvider": "string | null",
  "subscriptionExpiresAt": "ISO | null"
}
```

Field `latestPayment` cho phép FE rehydrate paywall/modal QR mà không cần persist `sessionId` ở client. Nếu cần full bank info / qrCode → gọi tiếp `GET /payments/active`.

**Response `GET /kyc/submissions/:id`** (v1.7.1 — admin/owner shared):

```jsonc
{
  "id": "uuid",
  "userId": "uuid",                        // (v1.7.1) tiện cho FE link sang user
  "user": {                                // (v1.7.1) admin trang chi tiết cần header chủ nhà
    "id": "uuid",
    "name": "string | null",
    "phone": "string | null",
    "email": "string | null"
  },
  "status": "draft | awaitingApproval | approved | rejected | ...",
  "rejectReason": "string | null",
  "rejectedItems": ["cccdFront", "selfie"],
  "approvedAt": "ISO | null",
  "trialEndsAt": "ISO | null",
  "chargeStartsAt": "ISO | null",
  "expectedRooms": 5,
  "uploads": {
    "cccdFront": { "id", "imageUrl", "imageUrlThumb", "ocrResult", "confidence", "faceMatchScore", "uploadedAt" },
    "cccdBack":  { ... },
    "selfie":    { ... }
  },
  "payment": { "id", "planId", "cycle", "rooms", "totalAmount", "method", "status", "paidAt" } | null,
  "createdAt": "ISO"
}
```

### 9.2 Admin KYC

Base path: `/admin/kyc`. Role: ADMIN.

> **Một endpoint list — không gọi 3–4 API song song.** FE chỉ cần `GET /admin/kyc/queue?filter=0|1|2|3` khi đổi tab. Text tab hiển thị ở FE; BE nhận/trả số enum.

#### Tab filter (`filter` query param)

| `filter` | Tab FE (gợi ý) | DB `KycSubmission.status` gom vào |
|---:|---|---|
| `0` | Tất cả | Mọi status **trừ** `draft` |
| `1` | Chờ duyệt | `kyc_submitted`, `payment_pending`, `awaiting_approval` |
| `2` | Đã duyệt | `approved`, `refunded` |
| `3` | Đã từ chối | `rejected` |

Mặc định khi không truyền `filter`: **`1` (chờ duyệt)**.

Query `status` string (vd. `awaiting_approval`) **deprecated** — map sang `filter` tương ứng để tương thích client cũ.

#### Endpoints

| Method | Path | Body / Query |
|---|---|---|
| `GET` | `/admin/kyc/queue?page&pageSize&filter&q` | `filter`: 0–3 (xem bảng trên). `q`: keyword search theo `user.name` / `user.phone` / `user.email` (không phân biệt hoa thường, max 100 ký tự). Response kèm `pendingCount` (badge) — **không cần** gọi thêm API badge. |
| `GET` | `/admin/kyc/count-pending` | **Deprecated** — dùng `data.pendingCount` từ `GET /queue`. |
| `GET` | `/kyc/submissions/:id` | Detail (admin gọi được) |
| `POST` | `/admin/kyc/submissions/:id/approve` | `{ trialDays? }` (default 7) |
| `POST` | `/admin/kyc/submissions/:id/reject` | `{ reason, items?[] }` |

#### Response `GET /admin/kyc/queue`

```jsonc
{
  "success": true,
  "message": "...",
  "data": {
    "filter": 1,              // tab đang lọc (0–3)
    "pendingCount": 3,        // số hồ sơ chờ duyệt (filter=1), dùng badge sidebar
    "total": 12,
    "page": 1,
    "pageSize": 20,
    "items": [
      {
        "id": "uuid",
        "status": "awaitingApproval",  // chi tiết nội bộ (camelCase)
        "statusFilter": 1,             // 1=chờ duyệt | 2=đã duyệt | 3=đã từ chối — FE map text tab
        "user": { "id", "name", "phone", "email" },
        "submittedAt": "ISO",
        "uploads": { "cccdFront", "cccdBack", "selfie" },
        "expectedRooms": 1,
        "plan": "starter_test | null",
        "totalPaid": 0,
        "createdAt": "ISO"
      }
    ]
  }
}
```

#### Luồng duyệt KYC (Option A — duyệt trước, thanh toán sau)

```
Owner upload + POST /kyc/submit  →  awaiting_approval  (user.kycStatus = pending)
Admin approve                    →  approved             (user.kycStatus = approved, chưa có subscription)
Owner POST /payments/initiate    →  payment_pending    (chỉ khi kycStatus = approved)
Thanh toán thành công            →  approved + kích hoạt subscription/trial
```

Admin queue tab **Chờ duyệt** (`filter=1`) hiển thị mọi hồ sơ owner đã nộp đủ ảnh và chờ admin xử lý.

#### Migration client (iOS / Android / Web)

| Trước (sai pattern) | Sau |
|---|---|
| 3× `GET /queue?status=awaiting_approval` + `approved` + `rejected` song song | 1× `GET /queue?filter=0\|1\|2\|3` mỗi lần đổi tab |
| `GET /count-pending` riêng | Dùng `data.pendingCount` từ response `GET /queue` |
| Map text tab ở BE | FE tự map: `0→Tất cả`, `1→Chờ duyệt`, `2→Đã duyệt`, `3→Đã từ chối` |
| Hiển thị `status` string | Ưu tiên `statusFilter` (1\|2\|3) cho badge/tab; `status` giữ cho màn chi tiết |

---

## 10. Payment & Subscription

### 10.1 Plans + Owner self

| Method | Path | Role | Mô tả |
|---|---|---|---|
| `GET` | `/billing/plans` | Public | Danh sách gói active (rooms_1, rooms_5, ...) |
| `GET` | `/admin/billing-plans` | ADMIN | List toàn bộ gói (cả `active=false`) |
| `POST` | `/admin/billing-plans` | ADMIN | Tạo gói mới |
| `PUT` | `/admin/billing-plans/:id` | ADMIN | Cập nhật gói |
| `DELETE` | `/admin/billing-plans/:id` | ADMIN | Xoá gói — hard delete nếu không có sub/payment, ngược lại soft delete (`active=false`) |
| `GET` | `/subscriptions/me` | OWNER/SALE | Subscription của mình (SALE tự resolve theo ownerId) |

**POST /admin/billing-plans body** (`CreateBillingPlanDto`):

```json
{
  "id": "rooms_5",                    // a-z0-9_ only, unique
  "name": "Starter",
  "pricePerRoom": 119800,              // VND/phòng (label legacy)
  "minCharge": 599000,                 // VND/tháng hiển thị
  "yearlyPrice": 5999000,              // optional, VND/năm
  "maxRooms": 5,                       // optional; null hoặc -1 = unlimited
  "yearlyDiscountPct": 16,             // optional, default 20
  "vatPct": 10,                        // optional, default 10
  "features": ["Booking + Calendar"],  // optional, default []
  "active": true,                      // optional, default true
  "sortOrder": 1                       // optional, default 0
}
```

**PUT /admin/billing-plans/:id body**: tất cả field giống POST nhưng đều optional (`UpdateBillingPlanDto`, không cho đổi `id`).

**Validation errors:**
- `billing.idInvalid` — id chứa ký tự ngoài `a-z 0-9 _`
- `billing.idExists` — đã có gói với id này
- `billing.planNotFound` — id không tồn tại (PUT/DELETE)

**DELETE behavior:**
- Nếu plan không bị bất kỳ `Subscription` / `PaymentSession` nào reference → hard delete, response `{ id, softDeleted: false }`, message `billing.deleteSuccess`.
- Nếu còn reference → soft delete (`active=false`), response `{ ...plan, softDeleted: true, subCount, payCount }`, message `billing.deactivateSuccess`. Gói vẫn còn trong DB để giữ FK nhưng không xuất hiện trong `/billing/plans`.

### 10.2 Owner payment

Base path: `/payments`. Role: OWNER.

| Method | Path | Body / Note |
|---|---|---|
| `POST` | `/payments/quote` | `{ planId, cycle, rooms? }` → **read-only**, trả `kind` + `breakdown` + `totalAmount`. FE nên gọi trước khi mở màn thanh toán thay vì tự tính. |
| `POST` | `/payments/initiate` | `{ planId, cycle, method, rooms, totalAmount }` → tạo session. BE tự branch theo trạng thái user: subscription / renew / upgrade / downgrade (xem §10.2.1). |
| `POST` | `/payments/renew` | `{ method }` — gia hạn cùng gói hiện tại (stack 1 kỳ). |
| `GET` | `/payments/active` | Trả session `pending` mới nhất của user (rehydrate UI khi reload). `data = null` nếu không có. |
| `GET` | `/payments/history?limit&cursor` | — Mỗi item có `kind` (`subscription | renew | upgrade | refund`). |
| `GET` | `/payments/:sessionId/status` | Poll trạng thái session |
| `POST` | `/payments/:sessionId/cancel` | User huỷ session `pending`. Chỉ cho phép khi `status=pending`, ngược lại 409 `cannotCancel`. Đồng thời revert KycSubmission `payment_pending → kyc_submitted` |
| `POST` | `/payments/:sessionId/refund` | — |

### 10.2.1 Branching trong `POST /payments/initiate`

BE tự nhận diện loại giao dịch — FE chỉ gửi `planId + cycle + rooms + totalAmount` như cũ. Logic:

| Trạng thái user | Điều kiện | `kind` trả về | Charge | Side-effect khi paid |
|---|---|---|---|---|
| Chưa có subscription (`none`) | KYC **đã được admin duyệt** (`user.kycStatus=approved`, submission `approved`) | `subscription` | Full 1 kỳ | Kích hoạt subscription/trial (không quay lại chờ duyệt) |
| Active/trial/past_due, cùng `planId + cycle` | — | `renew` | Full 1 kỳ | `currentPeriodEnd = max(now, currentPeriodEnd) + 1 cycle` |
| Active/trial/past_due, tier mới **cao hơn** | `tier(new) > tier(current)` | `upgrade` | **Prorate** (xem §10.2.2) | Đổi plan ngay, giữ nguyên `currentPeriodEnd` |
| Active/trial/past_due, tier mới **thấp hơn** | `tier(new) < tier(current)` | — | — | **409 `downgradeScheduled`** + `effectiveAt` + `pendingPlanId`; ghi `User.pendingPlanId/Cycle/EffectiveAt` |
| Active/trial/past_due, cùng tier, **khác cycle** | — | `renew` | Full 1 kỳ theo cycle mới | Stack 1 kỳ mới từ `currentPeriodEnd`, cycle cập nhật |
| `frozen` | — | — | — | **409 `subscriptionFrozen`** |

**Tier order** (thấp → cao):
`starter_test < rooms_1 < rooms_5 < rooms_10 < rooms_20 < rooms_50 < enterprise`

### 10.2.2 Công thức prorate (upgrade)

```
totalDays     = oldCycle == yearly ? 365 : 30
remainingDays = max(0, ceil((currentPeriodEnd - now) / 1d))   // clamp 0..totalDays
oldSubtotal   = subtotal(currentPlan, currentCycle, currentRooms, override)
newSubtotal   = subtotal(newPlan, newCycle, newRooms, override)
oldCredit     = round(oldSubtotal × remainingDays / totalDays)
due           = max(0, newSubtotal - oldCredit)
vat           = round(due × newPlan.vatPct / 100)
totalAmount   = due + vat
```

`subtotal(plan, cycle, rooms, override)`:
- Nếu `override != null` → `subtotal = override` (giá tuyệt đối/kỳ chưa VAT).
- Else: `months = cycle == yearly ? 12 : 1`; `base = max(plan.pricePerRoom × rooms, plan.minCharge) × months`; `subtotal = round(base × (1 - yearlyDiscount nếu yearly))`.

### 10.2.3 Quote API

`POST /payments/quote` body:
```json
{ "planId": "rooms_10", "cycle": "monthly", "rooms": 10 }
```

Response (200):
```json
{
  "success": true,
  "message": "...",
  "data": {
    "kind": "upgrade",
    "planId": "rooms_10",
    "cycle": "monthly",
    "rooms": 10,
    "totalAmount": 769450,
    "breakdown": {
      "listPrice": 999000,
      "creditApplied": 299500,
      "vat": 69950,
      "remainingDays": 15,
      "totalDays": 30,
      "currentPlanId": "rooms_5",
      "periodExtension": null
    }
  }
}
```

`breakdown.periodExtension`:
- `subscription` / `renew` → `{ "months": 1 }` hoặc `{ "months": 12 }`
- `upgrade` → `null` (giữ period)
- `downgrade` → `null` + thêm `effectiveAt` + `pendingPlanId` top-level data

Quote **không** tạo session, không ghi DB. FE có thể gọi mỗi khi user đổi plan/cycle để re-render order summary. Khi user confirm, FE gọi `POST /payments/initiate` với `totalAmount` lấy từ quote — BE vẫn tính lại và validate ±1%.

**Riêng nhánh `upgrade`** BE **không** validate `totalAmount` FE gửi (vì FE cũ gửi full giá gói mới chưa biết prorate). BE override `totalAmount` trong response session bằng số đã prorate; FE đọc lại từ response thay vì tự tính. Nhánh `subscription` / `renew` vẫn validate ±1% như cũ.

### 10.2.4 Mở rộng response của `initiate` / `renew`

Session response (trên hai endpoint này) trả thêm so với spec cũ:

```jsonc
{
  // ... fields cũ (sessionId, totalAmount, qrCode, bankInfo, expiresAt, ...)
  "kind": "renew",                    // 'subscription' | 'renew' | 'upgrade'
  "planId": "rooms_5",
  "cycle": "monthly",
  "breakdown": {
    "listPrice": 599000,
    "creditApplied": 0,                // > 0 chỉ trong upgrade
    "vat": 59900,
    "remainingDays": null,             // upgrade only
    "totalDays": null,                 // upgrade only
    "periodExtension": { "months": 1 } // upgrade → null
  }
}
```

### 10.2.5 Error codes (subscription billing)

| Code | HTTP | Khi |
|---|---|---|
| `amountMismatch` | 400 | `totalAmount` FE gửi ≠ BE tính (±1%) |
| `planNotFound` | 404 | `planId` không tồn tại / `active = false` |
| `noActiveSubscription` | 409 | `POST /payments/renew` khi `subscriptionStatus = none` |
| `subscriptionFrozen` | 409 | Mọi initiate/renew/quote khi `subscriptionStatus = frozen` |
| `downgradeScheduled` | 409 | `POST /payments/initiate` với tier thấp hơn. Body kèm `effectiveAt` + `pendingPlanId` |
| `cannotDowngradeInTrial` | 409 | (reserved) Trial chưa hết mà muốn hạ gói |
| `paymentPending` | 409 | User đã có session `pending` đang chờ duyệt/đối soát. Body kèm `pendingSession` (xem §10.2.6) |
| `markPaidDuplicate` | 409 | Đã paid trước đó |

### 10.2.6 Chặn tạo session khi đang có pending (v1.8+)

Khi user gọi `POST /payments/initiate` hoặc `POST /payments/renew` mà đã có session `status=pending` (bất kỳ kind nào) → **409 `paymentPending`**, KHÔNG tạo session mới.

```json
{
  "success": false,
  "statusCode": 409,
  "code": "paymentPending",
  "message": "Bạn đang có phiên thanh toán chờ duyệt. Vui lòng hoàn tất hoặc hủy phiên hiện tại trước khi tạo mới.",
  "pendingSession": {
    "sessionId": "uuid",
    "kind": "upgrade",
    "totalAmount": 769450,
    "planId": "rooms_10",
    "planLabel": "Standard · Tháng",
    "cycle": "monthly",
    "method": "bank_transfer",
    "createdAt": "2026-06-06T10:00:00.000Z",
    "expiresAt": "2026-06-07T10:00:00.000Z"
  }
}
```

**FE handle:**
- Khi nhận 409 `paymentPending` → điều hướng user về màn QR / order summary của `pendingSession.sessionId` (gọi `GET /payments/active` hoặc `GET /payments/:sessionId/status` để rehydrate).
- Hiển thị `message` BE trả về.
- Cho user 2 lựa chọn: **chờ duyệt** (tiếp tục) hoặc **hủy session cũ** (gọi `POST /payments/:sessionId/cancel` rồi mới tạo session mới).

**Auto-cancel 24h:** Session `pending` quá `expiresAt` (24h sau `createdAt`) sẽ tự động chuyển `expired` qua cron `expirePendingSessions` (chạy mỗi 5 phút). Đồng thời revert `KycSubmission.payment_pending → kyc_submitted` cho session thuộc nhánh subscription lần đầu. User KHÔNG cần thao tác — sau 24h sẽ tự động tạo session mới được.

Method values: `bank_transfer` (chỉ hỗ trợ duy nhất — VNPay và Apple IAP đã loại bỏ ở v1.4).

**Plan IDs hợp lệ** (`BillingPlan.id`):

| planId | name | monthlyPrice (minCharge) | maxRooms | Ghi chú |
|---|---|---:|---:|---|
| `starter_test` | Starter Test | 10,000 | 1 | Gói thử/QA/App review. `vatPct=0`, `yearlyDiscountPct=0` |
| `rooms_1` | Mini | 199,000 | 1 | |
| `rooms_5` | Starter | 599,000 | 5 | |
| `rooms_10` | Standard | 999,000 | 10 | |
| `rooms_20` | Pro | 1,799,000 | 20 | |
| `rooms_50` | Business | 3,999,000 | 50 | |
| `enterprise` | Enterprise | 0 | ∞ | Custom price qua `User.subscriptionPriceOverride` |

Công thức `totalAmount` mặc định: `max(pricePerRoom × rooms, minCharge) × months × (1 - yearlyDiscount) × (1 + vatPct/100)`. Khi `User.subscriptionPriceOverride` được set → override toàn bộ. FE phải gửi `totalAmount` khớp (tolerance 1%), sai → 400 `amountMismatch`.

**Response shape** (`initiate` / `renew` / `active`):

```jsonc
{
  "sessionId": "uuid",
  "status": "pending",
  "totalAmount": 10000,
  "method": "bank_transfer",
  "qrCode": "<EMV VietQR payload>",
  "bankInfo": { "bankName", "accountNumber", "accountName", "bankBin", "content", "vietQrPayload" },
  "redirectUrl": null,
  "payUrl": null,
  "expiresAt": "2026-06-07T10:00:00Z",       // 24h sau createdAt — session expiry cho cron + webhook
  "qrExpiresAt": "2026-06-06T10:15:00Z",     // 15 phút sau createdAt — countdown QR trên UI
  "reconcileWindowHours": 24,                  // info để FE label "Đối soát trong tối đa 24h"
  "createdAt": "2026-06-06T10:00:00Z",
  "planId": "starter_test",
  "planLabel": "Starter Test · Tháng",
  "cycle": "monthly",
  "rooms": 1
}
```

**Hai mốc thời gian** (v1.7):

| Hằng số | Giá trị | Mục đích |
|---|---:|---|
| `QR_EXPIRY_MINUTES` | 15 | QR code hết hạn để hiển thị countdown. Hết hạn → FE nên cho tạo session mới (gọi cancel + initiate lại). |
| `SESSION_EXPIRY_MINUTES_BANK` | 1440 (24h) | Session sống đủ lâu để webhook Sepay/Casso hoặc admin `mark-paid` xác nhận. Cron `expirePendingSessions` chạy mỗi 5 phút chuyển `pending → expired` khi quá `expiresAt`, đồng thời revert KycSubmission về `kyc_submitted` để user initiate lại được. |

**Hành vi khi initiate lần 2 trên cùng submission**: BE tự `updateMany` mọi session `pending` cũ của submission đó về `expired`. FE không cần gọi cancel trước.

**Quan hệ với KYC submission**:
- `POST /payments/initiate` thành công → `KycSubmission.status = payment_pending`.
- `POST /payments/:id/cancel` hoặc cron auto-expire → revert về `kyc_submitted`.
- Webhook / admin mark-paid → `paid` → `KycSubmission.status = awaiting_approval`.

### 10.2.7 Error response shape — extras nằm ở ROOT body

Mọi 4xx/5xx đi qua global filter `AllExceptionsFilter`. Shape chuẩn:

```jsonc
{
  "success": false,
  "statusCode": 409,
  "message": "string",        // i18n vi/en
  "code": "string | null",    // machine-readable: paymentPending, downgradeScheduled, ...
  "errors": null,             // field-level errors object (ValidationPipe)
  "path": "/payments/initiate",
  "timestamp": "ISO"
  // + extras
}
```

**Extras ở root**, KHÔNG nằm trong `data` (vì error response không có `data` wrapper):

| Code | Extras root-level |
|---|---|
| `paymentPending` | `pendingSession: { sessionId, kind, totalAmount, planId, planLabel, cycle, method, createdAt, expiresAt }` |
| `downgradeScheduled` | `effectiveAt: ISO`, `pendingPlanId: string` |

**Reserved keys** filter giữ riêng, không cho phép exception override: `message`, `errors`, `code`, `statusCode`, `error`. Mọi key khác trong `throw new HttpException(obj, status)` sẽ được **spread thẳng ra root body**.

**Tại sao note riêng:** Trước v1.8.1 filter chỉ extract `message`/`code`/`errors`, mọi field tùy chỉnh khác (`pendingSession`, `effectiveAt`, `pendingPlanId`) **bị drop** → FE nhận 409 trống extras. Fixed 2026-06-06. FE phải đọc các extras từ root `response.data` (axios) hoặc root JSON body, KHÔNG unwrap qua `.data`.

### 10.3 Admin manual reconcile (v1.6)

Phase hiện tại CHƯA setup webhook Sepay/Casso → ADMIN tự đối soát thủ công:

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/admin/payments?status=pending&from&to&search&page&limit` | List session để đối soát. Hydrate user info |
| `POST` | `/admin/payments/:sessionId/mark-paid` | Body `{ reference? }`. Idempotent. Cho phép mark cả session đã expired |

**Response shape `GET /admin/payments`** (per item):

```json
{
  "id": "uuid",
  "userId": "uuid",
  "kind": "subscription | renew | upgrade | refund",
  "planId": "rooms_1 | rooms_5 | rooms_10 | rooms_30",
  "planLabel": "Gói 5 phòng",
  "cycle": "monthly | yearly",
  "rooms": 5,
  "totalAmount": 250000,
  "method": "bank_transfer",
  "status": "pending | paid | failed | expired | refunded",
  "provider": "manual_bank | manual | casso | sepay | null",
  "providerTxnId": "string | null",
  "referenceCode": "FT26060512345678 | null",
  "reference": "FT26060512345678 | null",
  "invoiceNumber": "INV-2026-0001 | null",
  "bankInfo": { "bankName": "...", "accountNumber": "...", "accountName": "...", "bankBin": "...", "content": "HALONG24H abc123", "vietQrPayload": "..." },
  "ckContent": "HALONG24H abc123",
  "paidAt": "ISO | null",
  "refundedAt": "ISO | null",
  "expiresAt": "ISO",
  "createdAt": "ISO",
  "updatedAt": "ISO",
  "user": { "id": "uuid", "name": "string | null", "email": "string", "phone": "string | null" }
}
```

- `ckContent` = nội dung CK user thấy trên QR / app banking (deterministic `HALONG24H {sessionId}`, lấy từ `bankInfo.content`).
- `reference` = alias của `referenceCode` (FE chấp nhận cả 2 key).
- `user.email` luôn có để FE fallback hiển thị khi `user.name = null`.
- `search` match `id`, `planLabel`, `referenceCode`, `user.name`, `user.email`, `user.phone`.

**Workflow ADMIN**:
1. User trong app tạo session qua `POST /payments/initiate` → app hiện QR + nội dung `HALONG24H <sessionId>`
2. User chuyển khoản vào TK ACB
3. ADMIN mở app banking ACB → thấy giao dịch mới với nội dung `HALONG24H abc123`
4. ADMIN vào web admin → `GET /admin/payments?status=pending&search=abc123` → tìm session
5. ADMIN click "Đã nhận tiền" → `POST /admin/payments/:sessionId/mark-paid { reference: "FT26060512345678" }`
6. BE activate subscription + push user "Thanh toán thành công"

> **Audit log**: action `payment.session_mark_paid`, target `subscription/userId`. Mỗi mark-paid được lưu IP+UA admin để compliance.

### 10.3 Admin subscription management

Base path bắt đầu `/admin/users/:id/subscription` hoặc `/admin/subscriptions`. Role: ADMIN.

| Method | Path | Body | Mô tả |
|---|---|---|---|
| `GET` | `/admin/subscriptions?status&plan&search&page&limit` | — | List toàn hệ |
| `GET` | `/admin/subscriptions/count-overdue` | — | Badge |
| `GET` | `/admin/subscriptions/sum-paid?from&to` | — | Tổng doanh thu kỳ |
| `GET` | `/admin/users/:id/subscription` | — | Snapshot user |
| `POST` | `/admin/users/:id/trial` | `{ days, planId?, cycle?, rooms?, reason? }` | Cấp/gia hạn trial |
| `DELETE` | `/admin/users/:id/trial?reason` | — | Thu hồi trial |
| `PATCH` | `/admin/users/:id/subscription/price` | `{ priceOverride: number\|null, reason? }` | **Điều chỉnh giá** cho user (VND/kỳ). `null` = xoá override |
| `POST` | `/admin/users/:id/subscription/mark-paid` | `{ amount, days?, planId?, cycle?, rooms?, reference?, note? }` | Manual mark-paid |
| `POST` | `/admin/users/:id/subscription/freeze` | `{ reason }` (≥5) | Đóng băng |
| `POST` | `/admin/users/:id/subscription/unfreeze` | — | Mở đóng băng |

### 10.4 Subscription status

`none | trial | active | past_due | cancelled | frozen | expired`.

Provider: `manual_bank | manual | casso | sepay | null`.

### 10.5 Pricing override

`User.subscriptionPriceOverride` (VND/kỳ) — admin set giá custom. Khi user gọi `POST /payments/initiate`/`renew`, BE sẽ dùng giá này thay vì công thức plan. Tolerance 1%.

- `priceOverride = 0` được phép, nghĩa là **miễn phí** cho user đó — `expectedTotal = 0`, FE truyền `totalAmount: 0`.
- `priceOverride = null` (xoá override) → fallback về giá plan.

### 10.6 State transitions

- **Mark-paid idempotency**: nếu admin click 2 lần trong 10 giây → request thứ 2 bị reject với 409 (`markPaidDuplicate`), tránh tạo double Subscription row.
- **Grant trial cấm khi `frozen`**: phải unfreeze trước khi grant trial. Trả 409 `cannotGrantTrialFrozen`.
- **Unfreeze restore policy**: tự khôi phục đúng trạng thái trước freeze:
  - User có `trialEndsAt` còn hiệu lực → `TRIAL`
  - Subscription `endsAt > now` → `ACTIVE`
  - Else → `PAST_DUE`
- **Mark-paid khi user đang trial**: BE clear `trialEndsAt` (chuyển sang ACTIVE), nhưng lưu `previousTrialEndsAt` vào audit metadata để có thể trace.

### 10.7 STK nhận tiền MUA GÓI — admin cấu hình được (v1.23 · 2026-07-05)

> **Business rule**: Tài khoản ngân hàng nhận tiền khi OWNER **mua/gia hạn gói** (subscription) trước đây **cố định trong biến môi trường** (`BANK_*`). Từ v1.23, ADMIN sửa được qua web quản lý. Đây là **STK của platform Halong24h** (khác hoàn toàn STK nhận tiền của OWNER ở §3.3 — cái đó để khách trả cọc booking, có luồng duyệt).

**Nguồn giá trị (thứ tự ưu tiên):**
1. Bảng singleton `payment_bank_account` (id cố định `default`) — nếu ADMIN đã cấu hình.
2. Fallback biến môi trường `BANK_BIN / BANK_NAME / BANK_ACCOUNT_NUMBER / BANK_ACCOUNT_NAME` — khi chưa từng cấu hình.

`source` trong response cho biết đang dùng nguồn nào: `"db"` (admin đã set) | `"env"` (fallback). Cập nhật **có hiệu lực NGAY** cho mọi `PaymentSession` mua gói tạo sau đó (VietQR + `bankInfo` sinh từ giá trị mới). Session đã tạo trước đó giữ nguyên QR cũ.

| Method | Path | Role / Permission | Body |
|---|---|---|---|
| `GET` | `/admin/payments/receiving-bank` | ADMIN / `payments.canRead` | — |
| `PUT` | `/admin/payments/receiving-bank` | ADMIN / `payments.canUpdate` | `{ bankBin, bankName?, bankAccountNumber, bankAccountName }` |

- `bankBin` (6 số NAPAS), `bankAccountNumber` (6–20 số), `bankAccountName` **bắt buộc**; `bankName` optional (chỉ hiển thị).
- Không có luồng duyệt — ADMIN ghi thẳng (khác STK của OWNER). Ghi audit log `payment.receiving_bank_update`.
- System SALE có `payments.canRead/canUpdate` cũng gọi được (xem §26).

**Response (`GET` + `PUT`)** — `data`:
```json
{
  "bankBin": "970416",
  "bankName": "ACB",
  "bankAccountNumber": "21169431",
  "bankAccountName": "NGUYEN VU NAM",
  "source": "db",
  "updatedAt": "2026-07-05T16:10:00.000Z"
}
```
- `source`: `"db"` = admin đã cấu hình | `"env"` = đang dùng fallback env (chưa từng set) → `updatedAt = null`.
- `bankName` có thể `null`.

**FE web quản lý:** trang cài đặt "Tài khoản nhận tiền mua gói" → `GET` khi mở form (prefill + badge nguồn), `PUT` khi lưu. Validate client: `bankBin` đúng 6 số, `bankAccountNumber` 6–20 số, `bankAccountName` không rỗng. Sau `PUT` thành công → `source` chuyển `"db"`, STK mới áp dụng ngay cho session mua gói kế tiếp.

---

## 11. Staff Invites

Base path: `/staff`.

### 11.1 Owner / Admin endpoints

| Method | Path | Role | Body / Query |
|---|---|---|---|
| `POST` | `/staff/invites` | OWNER/ADMIN | `{ email, ownerId? }` (`ownerId` bắt buộc khi caller là ADMIN) |
| `GET` | `/staff/invites?status&ownerId` | OWNER/ADMIN | — |
| `DELETE` | `/staff/invites/:id` | OWNER/ADMIN | — |
| `GET` | `/staff?isActive&ownerId` | OWNER/ADMIN | List SALE |
| `DELETE` | `/staff/:userId` | OWNER/ADMIN | Remove SALE |

ADMIN dùng `?ownerId=` để filter theo OWNER cụ thể, không truyền → xem tất cả.

### 11.1.1 Quota mời nhân viên theo gói (plan entitlement)

`POST /staff/invites` enforce quota server-side, **mirror FE `StaffEntitlement`** trong `app/lib/core/utils/staff_entitlement.dart`. Khi đổi quota, phải sửa cả 2 nơi.

| planId | Tên gói | Tối đa SALE |
|---|---|---|
| `rooms_1` | Mini | **0** — không cho mời |
| `rooms_5` | Starter | 3 |
| `rooms_10` | Standard | 3 |
| `rooms_20` | Pro | không giới hạn |
| `rooms_50` | Business | không giới hạn |
| `enterprise` | Enterprise | không giới hạn |

Điều kiện được mời (enforce trong `createInvite`):
1. `user.role = OWNER` (ADMIN có thể thay mặt qua `ownerId`).
2. KYC approved hoặc `kycBypass=true`.
3. `subscriptionStatus ∈ { trial, active }` — `past_due | cancelled | expired | frozen | none` đều bị chặn.
4. `subscriptionPlanId` cho phép mời (`maxSlots > 0`).
5. Tổng `SALE active + invite pending chưa hết hạn < maxSlots` (nếu `maxSlots != null`).

**ADMIN bypass toàn bộ 4 check trên** (để seed/khắc phục thủ công).

Lỗi quota:
- `403 staffNotAllowedOnPlan` — gói hiện tại không có quyền mời (Mini hoặc planId lạ).
- `409 staffSlotLimitReached` — gói Starter/Standard đã đạt 3 slot.

Message i18n nhúng tên gói + số slot để FE hiện thị trực tiếp.

### 11.2 Public endpoints (cho landing page accept invite)

| Method | Path | Body |
|---|---|---|
| `GET` | `/staff/invites/verify/:token` | — |
| `POST` | `/staff/invites/accept` | `{ token, method: "google"\|"password", idToken?, name?, password?, phone? }` |

**Token format** (FE gửi 1 trong 2 dạng — BE tự nhận dạng):
- **Full token** (64 chars hex) — dùng khi click link trong email (`/staff/accept?token=<64chars>`)
- **Short code** `HL-XXXXXX` — dùng khi nhập tay (OWNER share cho nhân viên qua chat/SMS)

**Response `/staff/invites/accept`** — giống `/auth/login`, **CHỈ trả tokens** (FE tự gọi `/auth/profile` sau):

```jsonc
{
  "success": true,
  "message": "Tham gia thành công",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Response `/staff/invites/verify/:token`** — trả info đủ để render trang accept (KHÔNG có tokens):

```jsonc
{
  "success": true,
  "message": "ok",
  "data": {
    "email": "sale@example.com",
    "owner": {
      "name": "Nguyễn Văn A",
      "avatar": "https://...",
      "homestayName": "Halong Bay Villa"
    },
    "expiresAt": "2026-06-13T10:00:00.000Z",
    "status": "pending"
  }
}
```

Lỗi có thể gặp: `404 inviteNotFound`, `410 inviteAlreadyAccepted | inviteCancelled | inviteExpired`.

### 11.3 Status invite

`pending | accepted | expired | cancelled`.

TTL invite: 7 ngày. Khi expire → tự chuyển status `expired` (qua cleanup query).

---

## 12. Permissions

Base path: `/permissions`. Role: ADMIN.

| Method | Path | Body |
|---|---|---|
| `GET` | `/permissions/:userId` | — |
| `PUT` | `/permissions/:userId` | `{ permissions: [{ module, canCreate, canRead, canUpdate, canDelete }] }` |

Modules: `properties | bookings | calendar | reviews`.

---

## 13. Disputes

### 13.1 Open (any authenticated)

| Method | Path | Body |
|---|---|---|
| `POST` | `/disputes` | `{ bookingId, type, subject (≥5), description (≥10), amount?, attachments?[≤10 URL] }` |

ACL: OWNER/SALE của property, CUSTOMER của booking, hoặc ADMIN.

### 13.2 Admin

| Method | Path | Body |
|---|---|---|
| `GET` | `/admin/disputes?status&type&search&page&limit` | — |
| `GET` | `/admin/disputes/count-active` | Badge (pending + investigating) |
| `GET` | `/admin/disputes/:id` | Detail kèm property/booking/owner/customer |
| `POST` | `/admin/disputes/:id/investigate` | — pending → investigating |
| `POST` | `/admin/disputes/:id/resolve` | `{ resolution (≥5), refundAmount? }` |
| `POST` | `/admin/disputes/:id/reject` | `{ resolution (≥5) }` |

### 13.3 Enums

- Type: `refund_request | service_quality | damage_claim | no_show | overbooking | other`
- Status: `pending | investigating | resolved | rejected`
- Opener type (BE tự tính, FE đọc): `owner | sale | customer | admin`

---

## 14. Audit Log

| Method | Path | Role | Query |
|---|---|---|---|
| `GET` | `/admin/audit-log?action&targetType&actorId&search&from&to&page&limit` | ADMIN | — |

> **Audit log do BE tự ghi mỗi khi admin gọi API**. FE KHÔNG cần gọi thêm endpoint nào để log. FE chỉ cần endpoint này để xem.

### 14.1 Action slugs

`user.ban`, `user.unban`, `user.revoke_sessions`, `user.reset_password`, `user.change_role`,
`property.approve`, `property.reject`, `property.suspend`,
`user.delete`, `user.kyc_bypass_toggle`, `user.bank_approve`, `user.bank_reject`,
`subscription.trial_grant`, `subscription.trial_revoke`, `subscription.set_price`, `subscription.mark_paid`, `subscription.freeze`, `subscription.unfreeze`,
`review.hide`, `review.restore`,
`kyc.approve`, `kyc.reject`,
`dispute.investigate`, `dispute.resolve`, `dispute.reject`,
`booking.mark_paid`, `payment.receiving_bank_update`.

### 14.2 Target types

`user | property | booking | dispute | subscription | review | kyc`

> **Note (v1.1)**: tất cả subscription admin action lưu `targetType=user` (vì identifier là userId, không phải subscriptionId). Filter `targetType=user` + `action=subscription.*` để lấy lịch sử subscription của user.

### 14.3 Audit entry

```json
{
  "id": "uuid",
  "actorId": "uuid",
  "actorRole": 0,
  "actor": { "id": "...", "name": "...", "email": "...", "role": 0 },
  "action": "user.ban",
  "targetType": "user",
  "targetId": "<userId>",
  "targetLabel": "spammer@example.com",
  "metadata": { "reason": "..." },
  "ipAddress": "1.2.3.4",
  "userAgent": "Mozilla/...",
  "createdAt": "..."
}
```

---

## 15. Leads

| Method | Path | Auth | Body / Query |
|---|---|---|---|
| `POST` | `/leads` | **Public** (rate-limit 10/phút/IP) | `{ propertyId?, guestName, guestPhone, guestEmail?, checkIn?, checkOut?, numGuests?, message?, source? }` |
| `GET` | `/leads?status&propertyId&page&limit` | ADMIN/OWNER/SALE | OWNER/SALE: của mình; ADMIN: tất cả |
| `GET` | `/leads/:id` | ADMIN/OWNER/SALE | — |
| `PATCH` | `/leads/:id` | ADMIN/OWNER/SALE | `{ status?, assignedToId?, notes? }` |

Status: `new | contacted | rejected | expired | converted`.
Source: `public_form | landing_page | partner | manual`.

> Khi đổi sang `contacted` → BE tự set `contactedAt + contactedById`.

---

## 16. Admin Emails

Base path: `/admin/emails`. Role: ADMIN.

| Method | Path | Body |
|---|---|---|
| `GET` | `/admin/emails/templates` | — → `{ smtpEnabled, templates: [{ key }] }` |
| `POST` | `/admin/emails/test` | `{ template, to }` → `{ sent: boolean }` |

> **⚠️ Thay đổi (v1.34 · 2026-07-09)** — `GET /admin/emails/templates` giờ **chỉ trả template thực sự được BE gửi tự động** (8 key). Trước đây liệt kê 15 key nhưng 7 key (`booking_paid`, `subscription_due`, `subscription_overdue`, `subscription_paid`, `dispute_opened`, `review_received`, `property_approved`) chỉ là mẫu render — bấm "Gửi test" ra mail nhưng **không có luồng nghiệp vụ nào gửi thật** → gây hiểu nhầm. Đã gỡ khỏi danh sách. FE render UI trực tiếp từ `data.templates` (không hardcode danh sách).

**8 template keys (đều gửi thật):**

| key | Trigger tự động |
|---|---|
| `welcome_owner` | Đăng ký OWNER (`/auth/register`, `/auth/google`, `/auth/apple`) + ADMIN tạo OWNER (`POST /users`) |
| `welcome_sale` | Accept staff invite (`POST /staff/invites/accept`) + ADMIN tạo SALE (`POST /users`) |
| `password_reset` | `POST /auth/forgot-password` |
| `booking_confirmed` | `PATCH /bookings/:id/paid` (ghi nhận cọc) + `PATCH /bookings/:id/checkin` (hoàn tất) |
| `booking_cancelled` | `PATCH /bookings/:id/cancel` |
| `kyc_approved` | `POST /admin/kyc/submissions/:id/approve` |
| `kyc_rejected` | `POST /admin/kyc/submissions/:id/reject` (kèm lý do + mục cần bổ sung) |
| `staff_invite` | `POST /staff/invites` (+ system invite). Kèm nút tải app từ env `APP_STORE_URL` / `PLAY_STORE_URL` — store nào để trống thì nút đó ẩn. |
| `review_invitation` (v1.36) | Cron mỗi giờ — gửi khách **tại mốc 12h trưa (VN) ngày trả phòng** (`checkoutDate + 5h`), khi booking COMPLETED + chưa đánh giá + chưa gửi. Link tới trang đánh giá `FRONTEND_BASE_URL/my/bookings/{bookingId}`. Chống gửi trùng qua `Booking.reviewInviteSentAt`. |

Tất cả email đều **fire-and-forget**: chỉ gửi khi user có email + SMTP cấu hình; lỗi SMTP được log, không chặn response.

---

## 17. Chat (REST + WebSocket)

### 17.1 REST endpoints

Base path: `/conversations`. Auth required.

| Method | Path | Body / Query | Mô tả |
|---|---|---|---|
| `GET` | `/conversations?role&page&limit` | — | Inbox sort `lastMessageAt DESC`. Trả `myUnread` per item |
| `GET` | `/conversations/unread-count` | — | Badge tổng |
| `POST` | `/conversations` | `{ type: "booking"\|"support"\|"staff", bookingId?, subject? }` | Idempotent với booking-type |
| `GET` | `/conversations/:id` | — | Detail kèm members hydrated |
| `GET` | `/conversations/:id/messages?cursor&limit` | — | Cursor-based, return oldest-first + `nextCursor` |
| `POST` | `/conversations/:id/messages` | `{ content, attachments? }` | REST fallback gửi tin — tự broadcast qua WS |
| `PATCH` | `/conversations/:id/read` | — | Mark read |
| `PATCH` | `/conversations/messages/:messageId` | `{ content }` | Sửa tin nhắn (chỉ sender, trong 15 phút). Broadcast `message:edit` |
| `DELETE` | `/conversations/messages/:messageId` | — | Xoá tin (sender hoặc admin). Soft-delete. Broadcast `message:delete` |

### 17.2 ConversationDto

```json
{
  "id": "uuid",
  "type": "booking",
  "bookingId": "uuid?",
  "propertyId": "uuid?",
  "subject": "...",
  "lastMessageAt": "2026-06-04T10:30:00.000Z",
  "lastMessagePreview": "Chào bạn, ...",
  "lastSenderId": "uuid",
  "hasDispute": false,
  "archivedAt": null,
  "createdAt": "...",
  "members": [
    {
      "userId": "uuid",
      "role": "owner",
      "lastReadAt": "...",
      "unreadCount": 0,
      "user": { "id": "uuid", "name": "...", "avatar": "..." }
    }
  ],
  "myUnread": 3
}
```

### 17.3 MessageDto

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "senderId": "uuid",
  "content": "...",
  "attachments": [{ "url": "https://...", "type": "image/jpeg", "name": "...", "size": 12345 }],
  "isSystem": false,
  "editedAt": null,
  "deletedAt": null,
  "createdAt": "..."
}
```

### 17.4 WebSocket

**URL**: `wss://api.halong24h.com/chat`

**Connect với JWT**:
```js
import { io } from 'socket.io-client';

const socket = io('https://api.halong24h.com/chat', {
  auth: { token: accessToken },
  query: { lang: 'vi' }, // hoặc 'en' — BE resolve locale cho error messages
  transports: ['websocket'],
  reconnection: true,
  reconnectionDelay: 1000,
});

socket.on('connect', () => console.log('connected'));
socket.on('error', (e) => console.error(e.message));
```

> **Note**: BE đọc locale từ `query.lang` hoặc `Accept-Language` header. Mọi error message trả về qua `error` event đã dịch theo locale.

**Client → Server events**:

| Event | Payload |
|---|---|
| `message:send` | `{ conversationId, content, attachments? }` |
| `read` | `{ conversationId }` |
| `typing:start` | `{ conversationId }` |
| `typing:stop` | `{ conversationId }` |

**Server → Client events**:

| Event | Payload | Khi nào |
|---|---|---|
| `message:new` | `{ conversationId, message: MessageDto }` | Tin mới (cả sender + recipient nhận, sender check để tránh duplicate) |
| `message:ack` | `{ localContent, message }` | Riêng cho sender — xác nhận message id thật |
| `message:edit` | `{ conversationId, message: { id, conversationId, content, editedAt } }` | Tin nhắn được sửa (recipient cập nhật content + show "đã chỉnh sửa") |
| `message:delete` | `{ conversationId, messageId }` | Tin nhắn bị xoá (recipient ẩn tin hoặc hiển thị "Tin nhắn đã bị xoá") |
| `read:update` | `{ conversationId, userId, lastReadAt }` | Member khác đã đọc |
| `typing` | `{ conversationId, userId, typing: boolean }` | Member khác đang gõ |
| `presence` | `{ userId, online: boolean }` | Member có conversation chung lên/xuống mạng |
| `error` | `{ code?, message }` | Lỗi. `code: 'tokenExpired'` kèm `disconnect(true)` khi access token (15') hết hạn giữa socket session — FE refresh token rồi reconnect |

### 17.5 Behavior tự động

- **Token expiry mid-session**: BE set timer theo `payload.exp` ở handshake. Khi access token hết hạn → server emit `error: { code: 'tokenExpired', message: 'Token expired' }` rồi `disconnect(true)`. FE refresh token qua `/auth/refresh` và reconnect lại WS với token mới.
- **Luôn push FCM cho chat (v1.18+, 2026-07-01)**: mỗi tin nhắn mới, BE gọi `pushToUser` cho **mọi device** của recipient (không quan tâm socket online hay không). Push với `pushType: "chat_message"`, `deepLink: "/conversations/:id"`. FE mobile foreground handler **phải tự suppress notification tray** khi user đang mở đúng conversation đó (tránh double với `message:new` WS event). Trước v1.18 chỉ push khi user hoàn toàn không có socket → miss case multi-device (mở web + app song song, app không hiện tray).
- **Không tạo notification DB row cho chat**: khác với booking events (mỗi event tạo 1 row trong `/notifications` inbox), chat message chỉ push FCM — không insert `Notification`. Lý do: volume cao, inbox `/notifications` không phải nơi tra cứu chat; badge tổng dùng `GET /conversations/unread-count`.
- **Multi-device**: tất cả socket của 1 user đều nhận `message:new` → đồng bộ web + mobile. FCM cũng bắn tới mọi device đã register qua `POST /devices`.
- **Retention 365 ngày (v1.20+, 2026-07-01)**: cron 3AM mỗi ngày xoá message tạo cách đây > 365 ngày (đúng 1 năm). Conversation có `hasDispute=true` được giữ (không purge để phục vụ tra cứu tranh chấp). Attachment Cloudinary tương ứng cũng bị xoá. Trước v1.20 retention là 180 ngày.
- **Presence narrow**: chỉ broadcast tới member của conversation chung (active members, `leftAt=null`), không leak cho user lạ và không gửi cho member đã rời.
- **Race protection**: tạo conversation cho cùng booking 2 lần đồng thời sẽ trả về conversation đã có (idempotent).
- **Cursor sai/expired**: server tự degrade về đầu danh sách thay vì throw 500.
- **Attachment validation**: URL phải `https://`, tối đa 5 file, 2048 chars URL, 100 chars `type`, 255 chars `name`. WS path cũng strip item không hợp lệ.
- **Member đã `leftAt`** không thể gửi tin, mark read, hay nhận presence/read broadcast.

### 17.6 FE Chat checklist

**Web (Next.js)**:
- [ ] Singleton socket sau login, disconnect khi logout
- [ ] Lắng `message:new` → upsert vào active chat hoặc bump `myUnread` ở inbox
- [ ] Lắng `read:update`, `typing`, `presence`
- [ ] Throttle `typing:start` (vd 1 emit / 3s)
- [ ] Optimistic UI: render local trước, update id từ `message:ack`
- [ ] Reconnect → re-fetch missed messages qua REST từ `nextCursor` cuối

**Android (native Kotlin/Java)**:
- [ ] `io.socket:socket.io-client:2.x`
- [ ] Connection trong service singleton, refresh token khi cần
- [ ] FCM handler `chat_message` → mở conversation deeplink
- [ ] Khi mở chat: REST history → join WS events

**iOS (native Swift)**:
- [ ] `Socket.IO-Client-Swift` 16.x (tương thích Socket.IO server 4.x mà NestJS 11 đang dùng)
- [ ] `SocketManager` singleton scope theo AppDelegate/SceneDelegate, disconnect khi logout
- [ ] APNs push handler cho payload `pushType: "chat_message"` → deep link `/conversations/:id`
- [ ] Foreground: dựa vào WS event `message:new`, không dùng APNs
- [ ] Background/killed: dựa vào APNs → khi user mở app, join lại WS + refetch từ `nextCursor`

**Flutter (dùng chung Android + iOS)**:
- [ ] Package `socket_io_client: ^2.0.3+1` (hỗ trợ Socket.IO 4.x)
- [ ] Khởi tạo:
  ```dart
  final socket = IO.io(
    '$baseUrl/chat',
    IO.OptionBuilder()
      .setTransports(['websocket'])
      .disableAutoConnect()
      .setAuth({'token': accessToken})
      .setQuery({'lang': locale}) // 'vi' hoặc 'en'
      .enableReconnection()
      .setReconnectionDelay(1000)
      .build(),
  );
  socket.connect();
  ```
- [ ] Wrap trong `ChatSocketService` singleton — inject qua GetIt/Riverpod, KHÔNG connect lại mỗi lần vào màn hình
- [ ] Nghe `error` với `code == 'tokenExpired'` → gọi `authService.refresh()` → `socket.auth = {...}` → `socket.connect()`
- [ ] Reconnect thành công → REST `GET /conversations/:id/messages?cursor=<last>` để bù tin bị miss
- [ ] Firebase Messaging handler cho `data.pushType == 'chat_message'` → navigate `deepLink`
- [ ] Lifecycle: `AppLifecycleState.paused` không cần disconnect (BE tự cleanup khi socket idle drop), nhưng `AppLifecycleState.detached`/logout thì phải `socket.dispose()`

### 17.7 Sync App ↔ Web ↔ BE — Config bắt buộc phải khớp

Không có secret/API key riêng cho chat. Chỉ 3 thứ dưới đây cần đồng bộ.

**1. Base URL + namespace `/chat`** — cùng host với REST:

| Env | REST base | WebSocket URL |
|---|---|---|
| Production | `https://api.halong24h.com` | `https://api.halong24h.com/chat` |
| Staging | `https://api-staging.halong24h.com` | `https://api-staging.halong24h.com/chat` |
| Development | `http://localhost:3000` | `http://localhost:3000/chat` |

> Namespace `/chat` là **path của Socket.IO namespace**, KHÔNG phải HTTP path. Client truyền vào `io(url + '/chat')` — socket.io tự upgrade sang `wss://` khi origin là `https://`.

**2. Auth token — dùng LẠI accessToken JWT của REST**

- BE verify bằng `JWT_SECRET` giống hệt HTTP guard — **không có endpoint issue token riêng cho socket**.
- FE truyền qua `handshake.auth.token` (khuyến nghị) hoặc header `Authorization: Bearer <token>`.
- Access token TTL 15 phút. Khi hết hạn giữa session:
  1. BE emit `error: { code: 'tokenExpired', message }` rồi `disconnect(true)`.
  2. FE gọi `POST /auth/refresh` → nhận `accessToken` mới.
  3. FE update `socket.auth = { token: newAccessToken }` và `socket.connect()` lại.
- **KHÔNG** truyền `refreshToken` cho socket — chỉ dùng accessToken.

**3. CORS `ALLOWED_ORIGINS` (BE `.env`) — chỉ ảnh hưởng Web**

```env
ALLOWED_ORIGINS="https://halong24h.com,https://www.halong24h.com,https://admin.halong24h.com"
```

- Áp cho cả REST (`main.ts`) và socket namespace `/chat` (`chat.gateway.ts`).
- Thiếu origin nào → browser đó connect fail với lỗi CORS trong console. **App native (Flutter/iOS/Android) KHÔNG bị CORS chặn** — không cần thêm scheme của app vào đây.
- Dev local (`NODE_ENV !== 'production'`) BE cho phép **mọi origin** — không cần config.

**4. FCM/APNs — song song, không thay thế WS**

- Không có key riêng cho chat. Reuse Firebase project đã đăng ký ở module `devices` (`POST /devices`).
- BE chỉ gửi push khi recipient **không có socket nào active**. Nếu FE đang mở app với socket connected → chỉ nhận `message:new`, KHÔNG nhận FCM (tránh double).
- Payload FCM `data.pushType == 'chat_message'`, `data.deepLink == '/conversations/:id'` — FE map deep link theo router của mình.

**5. Version compat**

| Component | Yêu cầu |
|---|---|
| BE Socket.IO server | `4.x` (đi kèm `@nestjs/websockets` + `@nestjs/platform-socket.io`) |
| Web client | `socket.io-client` `^4.7.0` |
| Flutter | `socket_io_client` `^2.0.3` |
| Android native | `io.socket:socket.io-client:2.x` (protocol v4) |
| iOS native | `Socket.IO-Client-Swift` `~> 16.0` |

**Client cũ dùng `socket.io-client@2.x` trên browser SẼ KHÔNG kết nối được** — không cùng protocol version với server 4.x.

**6. Checklist đồng bộ nhanh khi debug "không nhận message realtime"**

- [ ] FE dùng đúng base URL của env → check request `wss://<host>/chat/?EIO=4&transport=websocket` trong Network tab
- [ ] Header `Authorization` hoặc `auth.token` chứa **accessToken hiện tại**, chưa expire
- [ ] Server không trả 401/CORS ở handshake — nếu 401 → token sai; nếu CORS → thêm origin vào `.env`
- [ ] Sau `connect`, FE có join room `user:<userId>` **tự động** (BE tự join theo JWT payload, không cần FE emit thêm) — verify bằng cách gửi tin từ tài khoản khác vào conversation chung
- [ ] `message:new` listener đăng ký **trước** khi socket connect, không phải bên trong 1 useEffect cleanup lỗi
- [ ] Nếu chỉ 1 vài client miss: check `handleDisconnect` log ở BE — có thể socket bị kill do `tokenExpired` timer

---

## 18. App Version

| Method | Path | Auth | Query |
|---|---|---|---|
| `GET` | `/app/version?platform=android\|ios&currentVersion=` | Public | Force-update check |
| `POST` | `/admin/app-version` | ADMIN | `{ platform, latestVersion, minSupportedVersion, releaseNotes?, storeUrl }` |

Response GET:
```json
{
  "platform": "android",
  "latestVersion": "1.5.0",
  "minSupportedVersion": "1.3.0",
  "releaseNotes": "...",
  "storeUrl": "https://play.google.com/..."
}
```

Logic FE: `currentVersion < minSupportedVersion` → **force update** (chặn); `< latestVersion` → banner.

---

## 19. Enums reference

```ts
// Role
ROLE = { ADMIN: 0, OWNER: 1, SALE: 2, CUSTOMER: 3 }

// Property
PROPERTY_TYPE = { VILLA: 0, HOMESTAY: 1, HOTEL: 2 }
CANCELLATION_POLICY = { FLEXIBLE: 0, MODERATE: 1, STRICT: 2 }
MODERATION_STATUS = 'pending' | 'approved' | 'rejected' | 'suspended'

// Booking
BOOKING_STATUS = { HOLD: 0, CONFIRMED: 1, CANCELLED: 2, COMPLETED: 3, NO_SHOW: 4 }

// Calendar
CALENDAR_DAY_STATUS = 'available' | 'hold' | 'booked' | 'locked'

// Notification
NOTIFICATION_TYPE = { BOOKING: 0, PAYMENT: 1, SYSTEM: 2 }

// KYC
KYC_STATUS = 'none' | 'pending' | 'approved' | 'rejected'

// Subscription
SUBSCRIPTION_STATUS = 'none' | 'trial' | 'active' | 'past_due' | 'cancelled' | 'frozen' | 'expired'
SUBSCRIPTION_PROVIDER = 'manual_bank' | 'manual' | 'casso' | 'sepay' | null
SUBSCRIPTION_CYCLE = 'monthly' | 'yearly'

// Payment
PAYMENT_METHOD = 'bank_transfer'
PAYMENT_STATUS = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'

// Dispute
DISPUTE_TYPE = 'refund_request' | 'service_quality' | 'damage_claim' | 'no_show' | 'overbooking' | 'other'
DISPUTE_STATUS = 'pending' | 'investigating' | 'resolved' | 'rejected'

// Lead
LEAD_STATUS = 'new' | 'contacted' | 'rejected' | 'expired' | 'converted'
LEAD_SOURCE = 'public_form' | 'landing_page' | 'partner' | 'manual'

// Chat
CONVERSATION_TYPE = 'booking' | 'support' | 'staff'
CONVERSATION_MEMBER_ROLE = 'owner' | 'sale' | 'customer' | 'admin'
```

---

## 20. FE integration checklist

### 20.1 Web Admin (Next.js)

#### Setup
- [ ] HTTP client (Axios/Fetch) với interceptor `Authorization` + `Accept-Language`
- [ ] **v1.19+**: interceptor gắn `X-Client-Type: web` cho mọi request (xem §1.6.1.3)
- [ ] Refresh-token interceptor (401 → refresh → retry, **403 ở /auth/refresh → phiên bị đá do login thiết bị khác** → clear tokens + toast + redirect login)
- [ ] Lưu token httpOnly cookie hoặc EncryptedStorage
- [ ] Global error toast theo HTTP status mapping

#### Module swap mock → real
- [ ] `/auth/*` ✅ (chắc đã live)
- [ ] `/users/*` + admin actions (ban/unban/revoke/reset/role)
- [ ] `/properties/*` + moderation (approve/reject/suspend)
- [ ] `/bookings/*` + `/bookings/:id/paid`
- [ ] `/calendar/grid`, `/lock`, `/unlock`, `/sold`, `/bulk`
- [ ] `/notifications/*`
- [ ] `/kyc/*` + `/admin/kyc/queue|approve|reject|count-pending`
- [ ] `/payments/*` + `/subscriptions/me`
- [ ] `/admin/users/:id/subscription/*` (trial/price/mark-paid/freeze/unfreeze)
- [ ] `/admin/subscriptions` + `count-overdue` + `sum-paid`
- [ ] `/staff/*` (invite list/create/cancel; staff list/remove)
- [ ] `/permissions/:userId`
- [ ] `/disputes` + `/admin/disputes/*`
- [ ] `/admin/audit-log`
- [ ] `/leads` (public POST + auth list/detail/update)
- [ ] `/admin/emails/templates` + `/test`
- [ ] `/admin/reviews` + restore + count-flagged
- [ ] `/conversations/*` + Socket.IO `/chat` namespace
- [ ] `/uploads` POST/DELETE — generic file upload cho chat attachment + dispute evidence (xem §23)

#### Bỏ mock cũ
- [ ] Bỏ logic FE ghi audit log từ client — BE tự ghi
- [ ] Bỏ mô hình "admin nhập STK chuyển khoản" — STK lấy từ `POST /payments/initiate` (session.bankInfo)
- [ ] Subscription path: `/admin/users/:id/subscription/*` (KHÔNG phải `/admin/subscriptions/:id`)
- [ ] Staff invite body chỉ `{ email, ownerId? }` — không có `phone, permissions[], expiresAt`
- [ ] Booking schema: KHÔNG có `channel`, `roomTypeId`, `guestEmail` ở booking level

### 20.2 Mobile (Android/iOS)

#### Setup
- [ ] OkHttp/URLSession interceptor `Authorization` + `Accept-Language`
- [ ] **v1.19+**: interceptor gắn `X-Client-Type: mobile` cho mọi request (xem §1.6.1.3)
- [ ] Authenticator xử lý 401 → refresh, **403 ở /auth/refresh → phiên bị đá do login device khác** → `logoutLocal()` (xoá tokens + state) + snackbar + navigate login
- [ ] EncryptedSharedPreferences/Keychain lưu token
- [ ] Đăng ký FCM token sau login (`POST /devices`) + mỗi `onNewToken`
- [ ] Huỷ FCM token khi logout (`DELETE /devices/:token`)
- [ ] Force-update check ở splash (`GET /app/version`)
- [ ] Countdown timer cho booking HOLD (`holdRemainingSeconds`)
- [ ] Multipart upload cho KYC (compress < 5MB)
- [ ] Generic `/uploads` POST/DELETE cho chat attachment + dispute evidence (xem §23)
- [ ] Chrome Custom Tab cho payment URL + deeplink return

#### Chat
- [ ] Socket.IO client connection sau login
- [ ] FCM handler `pushType=chat_message` → mở conversation
- [ ] Optimistic UI cho gửi tin

#### Push handler theo pushType
- [ ] `booking_*` → `/bookings/:id`
- [ ] `subscription_*` → `/dashboard/billing`
- [ ] `chat_message` → `/conversations/:id`
- [ ] `dispute_*` → `/host/bookings/:bookingId`
- [ ] `lead_new` → `/host/leads/:id`
- [ ] `kyc_*` → `/dashboard` hoặc `/verify/rejected`
- [ ] `staff_invite_accepted` → `/staff/manage`
- [ ] `property_approved`, `property_rejected`, `property_suspended` → `/host/properties/:id`
- [ ] `property_updated`, `property_price_updated`, `property_images_updated` → `/host/properties/:id` (owner + SALE cùng team nhận, trừ người sửa)
- [ ] `calendar_locked`, `calendar_unlocked`, `calendar_sold`, `calendar_bulk_locked`, `calendar_bulk_unlocked` → `/host/properties/:id` (owner + SALE cùng team nhận, trừ người khoá/mở)
- [ ] `bank_approved`, `bank_rejected` → màn "Tài khoản nhận tiền" (OWNER)

### 20.3 Common test cases trước khi ship

- [ ] Login flow đầy đủ (email/phone, Google, Apple, refresh, logout)
- [ ] Token expired (15 phút) → tự refresh, không user-visible logout
- [ ] CRUD property + upload 5+ ảnh + đặt cover
- [ ] Booking HOLD → CONFIRMED → PAID flow + countdown
- [ ] Customer book + huỷ + completed → tạo review
- [ ] Calendar grid cho 30 ngày × 10 property
- [ ] Bulk lock 50 ngày
- [ ] KYC flow OWNER full (upload 3 ảnh → submit → admin approve)
- [ ] Subscription: trial → admin set price → user chuyển bank → webhook reconcile → active
- [ ] Subscription: admin freeze → user thấy banner → admin unfreeze
- [ ] Dispute mở từ booking, admin investigate → resolve
- [ ] Chat 2 user → message + typing + read + presence + offline FCM
- [ ] Lead public POST → owner thấy + notify
- [ ] Audit log filter theo action + targetType + date range

---

## Liên hệ

- **Backend repo**: `c:\website\backend`
- **Swagger UI**: `https://api.halong24h.com/index.html` (mở khi server chạy)
- **Channel coordination**: cập nhật theo tổ chức team

---

---

## 21. Changelog & Bug fixes

### v1.41 — 2026-07-13 (Bắt buộc OWNER có SĐT trước khi đăng/sửa cơ sở + mời SALE)

Đăng ký Google/Apple không lấy được số điện thoại, nhưng listing công khai cần SĐT liên hệ. Nay BE chặn thao tác vận hành khi owner chưa có `phone`.

| Thay đổi | Chi tiết |
|---|---|
| Gate SĐT | `POST /properties`, `PUT/PATCH /properties/:id`, `POST /staff/invites`: nếu owner `phone` rỗng/`null` → **403 `code: "PHONE_REQUIRED"`**. ADMIN tạo/sửa hộ bỏ qua. SALE thao tác hộ → check theo owner được gán. Xem §2A.5. |
| Code | Helper `phoneRequired()` (`src/common/errors/user.errors.ts`); `PropertiesService.assertOwnerHasPhone()` gọi trong `create()` + `update()`; check inline trong `StaffService.createInvite()`. i18n `properties.phoneRequired` + `staff.phoneRequired` (vi/en). |
| FE cần làm | Bắt `code === "PHONE_REQUIRED"` → điều hướng cập nhật hồ sơ (`PATCH /auth/profile { phone }`) rồi thử lại. Không cần re-login. |

**Breaking?** Về HTTP: owner đăng ký social chưa nhập SĐT sẽ nhận 403 khi đăng cơ sở/mời SALE (trước đây pass). Không đổi schema/DB. Khuyến nghị FE ép nhập SĐT ở bước onboarding hoặc form đăng cơ sở để tránh round-trip 403.

### v1.40 — 2026-07-09 (Fix: khách tự đặt không thấy thông tin chuyển khoản cọc)

Bug: khách đặt qua `POST /bookings/customer-hold`, owner đã duyệt bank + đã confirm booking, nhưng FE web hiện fallback **"Chủ nhà chưa cấu hình VietQR"** thay vì QR/số tài khoản.

| Mục | Chi tiết |
|---|---|
| Root cause | `buildPaymentInfo` yêu cầu `depositAmount > 0` mới dựng `paymentInfo`. Nhưng flow khách tự đặt **không bao giờ set `depositAmount`** (chỉ set `totalAmount`), và `confirm` cũng không set → `paymentInfo` luôn `null` → FE tưởng owner chưa có bank. |
| Fix | `paymentInfo.amount` = `depositAmount` **hoặc fallback `round(totalAmount × 50%)`** (đồng bộ `DEFAULT_DEPOSIT_RATE` đã dùng ở `mark-paid`). Booking CONFIRMED của khách nay **luôn** có `paymentInfo` khi owner có bank đã duyệt. |
| FE impact | **Bỏ nhánh fallback** "Chủ nhà chưa cấu hình VietQR" ở luồng bình thường — đọc thẳng `paymentInfo`. `null` trên booking CONFIRMED giờ chỉ nghĩa là owner thật sự chưa có bank (lỗi cấu hình, hiếm). Xem §5.3. |
| Code | `src/modules/bookings/bookings.service.ts` — `buildPaymentInfo`. Test: `bookings.service.spec.ts` (+2 case: fallback 50%, null khi thiếu cả deposit+total). Bổ sung mock `ConfigService` cho spec (DI đã có sẵn nhưng spec thiếu). |

**Breaking?** Không — chỉ thêm dữ liệu vào `paymentInfo` (trước `null`, nay có giá trị). FE cũ vẫn chạy; FE nên gỡ nhánh fallback.

### v1.39 — 2026-07-09 (Trial ngầm chỉ được đăng tối đa 1 cơ sở)

OWNER đang trial ngầm (chưa mua gói) trước đây đăng **không giới hạn** số cơ sở — chỉ cần còn hạn trial + KYC pass. Nay giới hạn **1 cơ sở** trong suốt trial.

| Thay đổi | Chi tiết |
|---|---|
| Trial cap | `POST /properties`: owner `subscriptionStatus="trial"` + `subscriptionPlanId=null` chỉ được có **tối đa 1 cơ sở chưa xoá** (mọi `type` villa/homestay/khách sạn tính chung). Cơ sở thứ 2 → **403 `code: "PROPERTY_LIMIT_REACHED"`**. |
| Copy trung tính iOS | Message: *"Tài khoản của bạn hiện chỉ có thể đăng tối đa 1 cơ sở. Vui lòng liên hệ hỗ trợ nếu cần đăng thêm."* — không nhắc trial/gói/thanh toán/nâng cấp. |
| Gỡ cap | Mua **bất kỳ gói nào** (`subscriptionPlanId` ≠ null) hoặc ADMIN cấp `kycBypass` → hết giới hạn. ADMIN tạo hộ không bị cap. SALE tính theo owner được gán. |
| Code | Constant `TRIAL_MAX_PROPERTIES=1` + `isTrialPropertyCapped()` (`src/common/subscription.ts`), helper `propertyLimitReached()` (`src/common/errors/subscription.errors.ts`), enforce trong `PropertiesService.create()`. i18n `properties.trialPropertyLimit` (vi/en). |

**Breaking?** Về mặt HTTP: owner trial đã có 1 cơ sở sẽ nhận 403 khi cố tạo thêm (trước đây 201). FE match `code: "PROPERTY_LIMIT_REACHED"` → hiển thị message + dẫn về liên hệ hỗ trợ (iOS) / flow thanh toán (Web/Android).

### v1.38 — 2026-07-09 (Enrich `GET /properties/share/:id`: thêm host + ratingBreakdown + rating)

Trang preview `preview.halong24h.com/{id}` cần đủ thông tin hơn — bổ sung 3 nhóm field, **vẫn giữ ẩn giá bán**.

| Thay đổi | Chi tiết |
|---|---|
| `host` (mới) | `{ name, avatarUrl, isKycVerified, memberSince, totalProperties, responseRate }` — giống public/:slug. KHÔNG có SĐT/email chủ nhà. |
| `ratingBreakdown` (mới) | Điểm 6 tiêu chí review visible + `count`. |
| `rating` (mới) | Alias của `ratingAvg` (đồng bộ tên với public/:slug). |
| Giữ nguyên | Vẫn **KHÔNG** trả `weekdayPrice/weekendPrice/holidayPrice` (giá bán). Surcharge, floorArea, city/district… như cũ. |
| Refactor | Tách helper dùng chung `buildRatingBreakdown` + `buildHostBlock` cho cả `public/:slug` và `share/:id` (không đổi output public/:slug). |

**Breaking?** Không — chỉ thêm field. FE preview đọc thêm `host` + `ratingBreakdown` + `rating` nếu cần. Xem §4.14.

### v1.37 — 2026-07-09 (Đá phiên NGAY khi đăng nhập thiết bị khác — single active session enforce)

Trước đây giới hạn "1 phiên mobile + 1 phiên web" chỉ dựa refresh token → thiết bị cũ vẫn dùng được **tới 15 phút** (hết hạn access token) mới bị đá. Nay đá **ngay lập tức**.

| Thay đổi | Chi tiết |
|---|---|
| Schema `User` | Thêm 2 cột nullable `sessionIdMobile`, `sessionIdWeb` (migration `20260709060000_add_user_session_id`, additive). |
| JWT payload | Thêm `sid` (session id) — sinh mới mỗi lần **đăng nhập** (`/auth/login|register|google|apple`, staff accept), giữ nguyên khi `/auth/refresh`. |
| Guard mỗi request | `JwtStrategy` so `payload.sid` với `sessionId{Mobile,Web}` trong DB. Đăng nhập thiết bị khác (cùng loại) đổi `sid` → access token thiết bị cũ **401 ngay request kế tiếp** (không chờ 15'). |
| Logout / ban / revoke-sessions / reset-password / xoá account | Clear luôn `sid` → vô hiệu access token tức thì (trước chỉ clear refresh token). |
| Backward-compat | Token phát trước v1.37 (không có `sid`) → bỏ qua check, tự hết hạn ≤15 phút. User đăng nhập lại → có `sid`, enforce đầy đủ. |

**Hành vi**: 2 điện thoại cùng đăng nhập OWNER → máy đăng nhập sau đá máy trước **ngay** (máy trước 401 → refresh → 403 → logout). Web quản lý tương tự (slot web riêng). Mobile + web vẫn song song (2 slot khác nhau) — không đổi.

**Breaking?** Không cần FE đổi code — luồng 401 → refresh → 403 → logout (đã mô tả §1.6.1.4) tự xử lý. Chỉ khác: cú đá xảy ra ngay thay vì trễ ≤15'. Toast vẫn "Tài khoản đã đăng nhập ở thiết bị khác".

### v1.36 — 2026-07-09 (Email mời đánh giá lúc 12h trưa ngày trả phòng)

Tự động nhắc khách đánh giá cơ sở ngay khi kỳ lưu trú kết thúc.

| Thay đổi | Chi tiết |
|---|---|
| Email `review_invitation` (mới) | Cron `sendReviewInvitations` chạy **mỗi giờ**: quét booking `COMPLETED` đã qua mốc **12h trưa (VN) ngày trả phòng** (`checkoutDate + 5h`), **chưa đánh giá** + **chưa gửi mail** + **có email khách** (email tài khoản HOẶC `customerEmail` trên form) → gửi email mời đánh giá. Link tới **`FRONTEND_BASE_URL/my/bookings/{bookingId}`** (trang này tự hiện form đánh giá khi `canReview=true`). Bắt cả booking auto-complete lẫn owner check-in sớm. |
| Schema `Booking` | Thêm cột `reviewInviteSentAt DateTime?` (migration `20260709120000_add_booking_review_invite_sent_at`, additive) — đánh dấu đã gửi, chống gửi trùng (cron chạy lặp mỗi giờ). |
| `GET /admin/emails/templates` | Danh sách template test tăng từ 8 → **9** (thêm `review_invitation`). Xem §16. |

**Breaking?** Không — additive column + cron mới + 1 email. FE không cần đổi gì (mail chứa link tới trang `/my/bookings/{id}` đã có sẵn).

### v1.35 — 2026-07-09 (Customer hold phòng: 24h → 30 phút)

| Thay đổi | Chi tiết |
|---|---|
| **Customer hold = 30 phút** | `POST /bookings/customer-hold` giờ `holdExpireAt = now + 30 phút` (trước là 24h). Bằng với staff hold. Constant `CUSTOMER_HOLD_DURATION_SECONDS: 86400 → 1800` trong [bookings.service.ts](src/modules/bookings/bookings.service.ts). Cron mỗi phút vẫn auto-huỷ hold quá hạn. |

**Breaking?** Không đổi API/schema. FE khách đọc `holdRemainingSeconds` để countdown → tự động hiển thị ~1800s thay vì ~86400s. Không cần sửa FE. (Đây là lý do trước đây thấy "1438 phút" = 24h countdown; nay còn ~30 phút.)

### v1.34 — 2026-07-09 (Email: wire 4 template thật + trim danh sách test + cọc mặc định 50%)

Trước đây nhiều template email chỉ có mẫu "Gửi test" ở web admin nhưng **không luồng nào gửi thật**. Nay wire đủ + dọn danh sách test cho khớp thực tế.

| Thay đổi | Chi tiết |
|---|---|
| `welcome_owner` (mới gửi thật) | Gửi khi đăng ký OWNER (`/auth/register`, `/auth/google`, `/auth/apple`) + ADMIN tạo OWNER qua `POST /users`. Fire-and-forget. |
| `welcome_sale` (mới gửi thật) | Gửi khi accept staff invite (`POST /staff/invites/accept`, cả owner-scope + system) + ADMIN tạo SALE qua `POST /users`. |
| `kyc_approved` (mới gửi thật) | `POST /admin/kyc/submissions/:id/approve` → gửi chủ nhà (kèm gợi ý bước tiếp: quản lý cơ sở ngay / mua gói). |
| `kyc_rejected` (mới gửi thật) | `POST /admin/kyc/submissions/:id/reject` → gửi chủ nhà kèm lý do + mục cần bổ sung (CCCD trước/sau/selfie). |
| `booking_confirmed` mở rộng recipient | `PATCH /bookings/:id/paid` + `/checkin` giờ gửi tới **email tài khoản HOẶC `customerEmail` trên form** (trước chỉ gửi khi khách có tài khoản kèm email). Xem §5.4. |
| **Cọc mặc định 50%** | `PATCH /bookings/:id/paid` không truyền `amount` + không có `depositAmount` → tự động ghi nhận **50% `totalAmount`** (trước là 100%). Xem §5.4. |
| **Trim danh sách test email** | `GET /admin/emails/templates` chỉ còn **8 key gửi thật** (bỏ `booking_paid`, `subscription_due`, `subscription_overdue`, `subscription_paid`, `dispute_opened`, `review_received`, `property_approved` — chưa wire). FE render từ `data.templates`. Xem §16. |

**Breaking?** Nhẹ cho FE web admin: danh sách template test giảm từ 15 → 8. FE nên render động từ `data.templates` thay vì hardcode. Không đổi schema/DB. Luồng cọc: nếu FE đang dựa vào mark-paid không-amount để ghi nhận full tiền → nay thành 50%; gửi `amount` tường minh nếu muốn số khác.

### v1.33 — 2026-07-09 (Đánh giá chỉ mở sau 12h trưa ngày trả phòng)

Làm rõ nghiệp vụ: check-in thu tiền full + đưa booking sang COMPLETED **ngay khi khách nhận phòng** (giữ nguyên), nhưng **đánh giá chỉ được sau khi trả phòng**.

| Thay đổi | Chi tiết |
|---|---|
| `POST /properties/:id/reviews` | Ngoài `status=COMPLETED` + chưa review, thêm điều kiện **đã qua 12h trưa (VN) ngày trả phòng** (`checkoutDate + 5h`). Chưa tới → 400 `reviews.reviewNotYetAllowed`. Trước đây COMPLETED (do check-in sớm) là đánh giá được ngay — sai. |
| BookingDto | Thêm `canReview: boolean` (đủ 3 điều kiện) + `reviewUnlockAt: ISO` (mốc mở đánh giá). FE enable nút "Đánh giá" theo `canReview`, hiển thị "Đánh giá sau {ngày}" khi chưa tới. |
| i18n | `reviews.reviewNotYetAllowed` (vi/en). |

**Breaking?** Không — chỉ siết điều kiện + thêm 2 field. FE nên chuyển nút đánh giá sang đọc `canReview` thay vì tự suy từ `status=COMPLETED`.

### v1.32 — 2026-07-09 (Fix hệ quả v1.31: dashboard "đang có khách"=0, đặt trùng lịch, doanh thu=null)

3 bug do quyết định v1.31 (`/checkin` đưa booking sang `COMPLETED` ngay khi khách nhận phòng dù vẫn đang lưu trú) + do doanh thu tính nhầm field.

| Bug | Thay đổi |
|---|---|
| **Dashboard "đang có khách" = 0** | `GET /dashboard/stats` `occupiedRooms` cũ lọc `status ∈ {HOLD, CONFIRMED}` → loại COMPLETED-đang-lưu-trú → 0. Nay gồm `COMPLETED`; window `checkinDate <= now < checkoutDate` vẫn loại đúng booking đã trả phòng. `checkoutToday` cũng gồm COMPLETED. |
| **⚠️ Rủi ro ĐẶT TRÙNG lịch** | Check trùng lịch (`POST /bookings/hold`, `/customer-hold`, `POST /partner/bookings`), filter phòng đã đặt trong `GET /properties/search` + `/public`, availability `GET /partner/properties/:id/availability`, và calendar grid/lock **cũ chỉ chặn `[HOLD, CONFIRMED]`** → booking check-in sớm (COMPLETED, còn trong kỳ) KHÔNG chặn đặt đè + hiện "trống". Nay dùng `[HOLD, CONFIRMED, COMPLETED]` (hằng số `BLOCKING_BOOKING_STATUSES`). Booking đã trả phòng (checkout đã qua) không overlap với đặt mới (checkin ≥ hôm nay) nên an toàn. Ô lịch của ngày COMPLETED-đang-ở giờ hiện `booked` (trước hiện `hold` sai). |
| **Doanh thu = null dù đã thu đủ** | Dashboard + `GET /reports` tính doanh thu bằng `depositAmount` → booking khách (`customer-hold`, `depositAmount=null`) cho doanh thu = 0 dù đã thu full. Nay dùng **`paidAmount`** (tiền thực thu). Xem §7A.4. |

**Breaking?** Không — chỉ sửa cách đếm/tính, shape response giữ nguyên. FE không cần đổi.

### v1.31 — 2026-07-09 (Booking check-in flow: ảnh bill cọc + xác nhận nhận phòng + thu nốt → hoàn tất)

Hoàn thiện luồng booking khách: khách gửi ảnh bill cọc, owner check-in + thu nốt, nhắc check-in 15h.

| Thay đổi | Chi tiết |
|---|---|
| Schema `Booking` | Thêm 2 cột nullable: `depositProofUrl`, `checkedInAt` (migration `20260709040000_add_booking_checkin_deposit_proof`, additive). |
| `POST /bookings/:id/deposit-proof` (mới) | Khách gửi ảnh bill CK cọc `{ proofUrl }` (https, 1 ảnh). Yêu cầu CONFIRMED + chưa thu. Push owner `booking_deposit_proof`. Xem §5.6. |
| `PATCH /bookings/:id/checkin` (mới) | Owner xác nhận khách nhận phòng + thu nốt `{ amount? }` → `checkedInAt` + cộng dồn `paidAmount` + `status=COMPLETED`. Push `booking_completed` + email hoàn tất. Xem §5.5. |
| Cron nhắc check-in | 15h giờ VN mỗi ngày → push owner `booking_checkin_reminder` cho booking CONFIRMED nhận phòng hôm nay, chưa check-in. |
| Email xác nhận (mark-paid) | `sendBookingConfirmed` giờ kèm `totalAmount` + `depositAmount` + `remainingAmount` (trước chỉ có số đã thu). |
| `PATCH /bookings/:id/paid` | Bỏ trống amount → ghi nhận **cọc** (fallback `depositAmount`); **không** ghi đè `totalAmount`. |
| BookingDto | Trả thêm `depositProofUrl`, `checkedInAt`, `completedAt`. |
| pushType mới | `booking_deposit_proof`, `booking_checkin_reminder`, `booking_completed`. |

**Ghi chú "Done"**: booking hoàn tất khi (1) owner `PATCH /checkin`, HOẶC (2) fallback cron auto-complete 12h trưa ngày trả phòng. Cả hai → COMPLETED → khách đánh giá được.

**App owner cần wire (báo team App)**: hiển thị `depositProofUrl` (ảnh bill) ở booking detail; màn/nút "Xác nhận nhận phòng + thu nốt" gọi `PATCH /bookings/:id/checkin`; handle 3 push mới. Xem bảng gap §21 báo cáo.

### v1.29 — 2026-07-09 (Booking: BE tự tính `totalAmount` + tách bạch cần thu/đã thu + priceBreakdown)

Trước đây `totalAmount` luôn `null` (BE không tính) → FE phải ước lượng "tạm tính". Nay BE tính server-side.

| Thay đổi | Chi tiết |
|---|---|
| `totalAmount` tự tính | BE tính từ bảng giá cơ sở (số đêm × weekday/weekend/holiday + phụ thu người lớn/trẻ vượt chuẩn), **set ở mọi trạng thái**: lúc `POST /bookings/hold` + `POST /bookings/customer-hold`, tính lại khi `PATCH /bookings/:id/confirm` và `PUT /bookings/:id`. `null` **chỉ khi** property chưa cấu hình giá. Helper: [booking-pricing.ts](src/modules/bookings/booking-pricing.ts). |
| `paidAmount` default `0` | Không còn `null` → FE tính "Còn lại" không lệch. |
| `remainingAmount` (mới) | `= max(0, totalAmount − paidAmount)`, BE trả sẵn. `null` khi `totalAmount=null`. |
| `priceBreakdown` (mới) | `{ nights, lineItems[], extraAdults, extraChildren, surchargePerNight, surchargeTotal, roomTotal, total }` — FE hiển thị minh bạch, bỏ ước lượng. Xem §5.3. |
| Công thức | Cuối tuần = `dow ∈ {0=CN,5=T6,6=T7}` (khớp FE). Phụ thu tính theo từng đêm × nights, tách người lớn (vs `standardGuests`) và trẻ (vs `standardChildren`). Staff hold chỉ có `guestCount` → coi là người lớn. |
| `mark-paid` không đổi tổng | `PATCH /bookings/:id/paid { amount? }` chỉ ghi `paidAmount + paidAt`; **không** ghi đè `totalAmount`. Bỏ trống amount → fallback `depositAmount` (giữ hành vi cũ). |
| Ngày lễ (v1.30 · 2026-07-09) | BE tự áp `holidayPrice` cho lễ dương cố định: 01/01, 30/04, 01/05, 02/09. Lễ âm lịch (Tết, Giỗ Tổ) chưa liệt kê — bổ sung theo năm khi cần. |

**Breaking?** Không phá schema (dùng cột `totalAmount` sẵn có). FE: bỏ logic `estimateBookingTotal` ước lượng, đọc thẳng `totalAmount` / `remainingAmount` / `priceBreakdown`; ô "Khách đã chuyển" đọc `paidAmount` (KHÔNG phải `depositAmount`). Booking cũ chưa có `totalAmount` sẽ được tính lại khi confirm/PUT tiếp theo, hoặc breakdown tính live ở response.

### v1.28 — 2026-07-08 (Fix `GET /users?withStats` — bookingCount của OWNER trả 0)

Bug: OWNER có phòng + có lượt đặt nhưng `stats.bookingCount = 0`.

| Thay đổi | Chi tiết |
|---|---|
| `GET /users?withStats=true` | `bookingCount` cũ = `saleBookings + customerBookings` → chỉ đếm booking user đích thân tạo (sale) hoặc đặt (customer). Booking trên phòng OWNER do SALE tạo hoặc khách tự đặt **không** được đếm → OWNER ra 0. Nay `bookingCount` = số booking user liên quan (chủ phòng `property.ownerId` **hoặc** `saleId` **hoặc** `customerId`), dedup theo booking. `propertyCount` + `disputeCount` không đổi. |
| `GET /guests/:id` | `stats.{totalBookings,completedBookings,cancelledBookings}` trước tính từ 50 booking gần nhất (`take:50`) → under-report nếu khách > 50 booking. Nay tính trên **toàn bộ** booking (groupBy status), khớp với list `GET /guests`. `recentBookings` vẫn giới hạn 50. |

**Rà soát đồng bộ**: các endpoint count khác đã đúng — `GET /guests` (list, count theo `customerId`), `GET /properties` (`_count.bookings` per phòng), Dashboard `topHostCancel` (booking owner qua `property.ownerId`) — không cần sửa.

**Breaking?** Không — chỉ đổi cách tính, shape response giữ nguyên. FE không cần sửa.

### v1.27 — 2026-07-08 (Phòng: sức chứa trẻ em tiêu chuẩn + filter người lớn/trẻ em)

Thêm sức chứa trẻ em cho phòng và filter tách người lớn/trẻ em ở các trang danh sách.

| Thay đổi | Chi tiết |
|---|---|
| Schema `Property` | Thêm cột `standardChildren INT NOT NULL DEFAULT 0` (migration `20260708030000_add_property_standard_children`, additive). `standardGuests` = số người lớn tiêu chuẩn, `standardChildren` = sức chứa trẻ em tiêu chuẩn, `maxGuests` = tối đa **cả căn** (KHÔNG chia người lớn/trẻ em). |
| `POST /properties` + `PATCH /properties/:id` | Nhận thêm `standardChildren` (int ≥0, optional). |
| Response phòng | `PropertyCardDto` (list/search), `GET /properties`, `GET /properties/public/:slug`, `GET /properties/share/:id` trả thêm `standardChildren`. |
| Filter list/search | `GET /properties/search` + `GET /properties/public` nhận thêm `adults` (lọc `standardGuests >= adults`) và `children` (lọc `standardChildren >= children`). `guests` giữ nguyên (lọc `maxGuests`). Xem §4.7. |

**Breaking?** Không — thêm cột default 0 + query optional. Phòng cũ giữ `standardChildren=0`. FE cũ không đổi gì.

### v1.26 — 2026-07-07 (Booking khách — thu đủ thông tin liên hệ + tách người lớn/trẻ em)

Trước đây `POST /bookings/customer-hold` chỉ lưu `customerId` (suy tên từ account) → booking thiếu thông tin liên hệ độc lập. Nay thu đủ như form web.

| Thay đổi | Chi tiết |
|---|---|
| Schema `Booking` | Thêm 3 cột nullable: `customerEmail`, `adults`, `children` (migration `20260707030000_add_booking_customer_contact`, additive). `customerName`/`customerPhone` đã có sẵn. |
| `POST /bookings/customer-hold` | Body thêm `customerName` (**bắt buộc**), `customerPhone` (**bắt buộc**, `^0\d{9}$`), `customerEmail` (optional email), `adults`/`children` (optional). Tổng khách = `adults + children`; validate ≤ `property.maxGuests` → sai 400 `bookings.guestExceedsMax`. Xem §5.2.1. |
| BookingDto response | Trả thêm `customerEmail`, `adults`, `children` (mọi luồng findAll/findOne/getMyBookings). |
| Notify chủ nhà | Push "Khách đặt phòng mới" giờ kèm tên + SĐT khách (từ form thay vì account). |
| i18n | `bookings.guestExceedsMax` (vi/en). |

**Breaking cho FE khách**: form đặt phòng phải gửi `customerName` + `customerPhone` (đã đúng như form "Thông tin liên hệ" hiện có). Client cũ chỉ gửi propertyId/ngày → 400. Staff `POST /bookings/hold` không đổi. Booking cũ giữ nguyên (3 cột mới = null).

### v1.25 — 2026-07-06 (ADMIN duyệt phòng OWNER đăng + đồng bộ visibility calendar)

Đảo lại business rule auto-approve: phòng OWNER/SALE đăng phải qua ADMIN duyệt; đồng bộ filter public giữa web khách và calendar.

| Thay đổi | Chi tiết |
|---|---|
| `POST /properties` (OWNER/SALE) | Tạo ở `moderationStatus='pending'` thay vì `approved`. ADMIN tạo trực tiếp vẫn `approved`. Message trả về `properties.createPendingSuccess`. Push `property_pending_review` tới ADMIN. Xem §4.4. |
| `PATCH /properties/:id` (OWNER sửa phòng `rejected`) | Về `pending` (gửi duyệt lại) thay vì auto-`approved`. |
| `GET /calendar/public-grid` | Thêm filter `moderationStatus='approved'` — chỉ hiện phòng `isActive=true` + đã duyệt (đồng bộ web khách §4.1). Phòng đã xóa/pending/rejected/suspended đều ẩn. `GET /calendar/grid` (auth) không đổi — OWNER/SALE vẫn thấy phòng pending của mình để quản lý. |
| pushType mới | `property_pending_review` (gửi ADMIN, deepLink `/admin/properties/:id`). |
| i18n | `properties.createPendingSuccess` (vi/en). |

**Ảnh hưởng dữ liệu**: property hiện hữu đều đã `approved` → không phòng nào bị ẩn oan. Chỉ phòng **đăng mới từ v1.25** mới ở trạng thái `pending`. Không cần migration.

**Ảnh hưởng FE**:
- FE web quản lý: tab "Chờ duyệt" (`GET /properties?moderationStatus=pending`) giờ có dữ liệu thật → dựng UI duyệt (`POST /properties/:id/approve` / `/reject`). Badge/queue nên hiển thị.
- FE app OWNER: sau khi đăng phòng, hiển thị trạng thái "chờ duyệt" (đọc `moderationStatus='pending'` hoặc message trả về), không coi là đã public.
- FE web khách + trang lịch public: không phải đổi gì — BE đã tự ẩn phòng chưa duyệt.

### v1.22 — 2026-07-04 (Avatar trong hồ sơ tài khoản)

Cho phép user tự cập nhật ảnh đại diện ở màn "Tài khoản".

| Thay đổi | Chi tiết |
|---|---|
| `PATCH /auth/profile` | Whitelist thêm field `avatar` (URL https, ≤ 1000 ký tự). Ghi vào `User.avatar`, trả lại trong `GET /auth/profile`. |
| `PUT /users/:id` | `UpdateUserDto` bổ sung `avatar` (URL https). Non-admin sửa chính mình cũng gửi được (thêm vào `SELF_EDITABLE_FIELDS`); response select thêm `avatar`. |
| Luồng upload | Ảnh upload trước qua `POST /uploads` (§23, Cloudinary) → lấy URL https trả về → gửi vào `avatar`. Không nhận multipart trực tiếp ở 2 endpoint trên. |

**Breaking?** Không — chỉ thêm field optional. FE cũ không đổi gì.

### v1.20 — 2026-07-01 (Chat retention 180 → 365 ngày)

Kéo dài thời gian giữ lịch sử chat từ 180 ngày lên **365 ngày** (đúng 1 năm) theo yêu cầu sản phẩm.

| Thay đổi | Chi tiết |
|---|---|
| Constant | `CHAT_LIMITS.RETENTION_DAYS: 180 → 365` (`src/common/constants.ts`). |
| Cron | `ChatRetentionService` chạy 3AM mỗi ngày, cutoff = `now - 365 days`. Message có `createdAt < cutoff` bị hard delete. |
| Loại trừ | Conversation có `hasDispute=true` KHÔNG purge — giữ để phục vụ tra cứu tranh chấp về sau (không thay đổi). |
| Attachment | Message bị purge → Cloudinary attachment tương ứng cũng bị xoá qua `uploadsService.deleteByMessageIds()` (không thay đổi luồng, chỉ đổi threshold). |
| Spec sync | §17.5, §23.6, §23.7 đã update sang "365 ngày". |

**Ảnh hưởng FE**: không có breaking. Chỉ là user thấy được lịch sử chat dài hơn.

**Ảnh hưởng dữ liệu hiện có**: message tạo trong 181–365 ngày trước (nếu tồn tại lúc deploy v1.19 nhưng chưa bị cron xoá) — v1.20 sẽ giữ lại tiếp. Message đã bị xoá theo cron cũ (> 180 ngày trước khi deploy v1.19) không khôi phục được.

### v1.19 — 2026-07-01 (Session split theo clientType: 1 slot mobile + 1 slot web)

Giới hạn phiên đăng nhập song song. Trước v1.19: `User.refreshToken` (1 cột) → 1 session tổng cộng cho mọi loại client. Từ v1.19: tách thành 2 slot độc lập theo `clientType`.

| Thay đổi | Chi tiết |
|---|---|
| Schema | Thêm 2 cột `refreshTokenMobile`, `refreshTokenWeb`. Giữ cột legacy `refreshToken` để tương thích ngược 1 lần refresh cho token phát trước v1.19. |
| Migration | `20260701120000_split_refresh_token_by_client_type` — additive, không phá dữ liệu. |
| Header mới | `X-Client-Type: mobile\|web` — FE gửi khi gọi 5 endpoint cấp token (`/auth/login`, `/auth/register`, `/auth/google`, `/auth/apple`, `/staff/invites/accept`). |
| JWT payload | Thêm field `clientType` — BE dùng để phân định slot khi refresh/logout. |
| Logout behavior | `POST /auth/logout` giờ chỉ đá phiên hiện tại (`clientType` trong access token). Phiên còn lại không bị ảnh hưởng. |
| Ban / revoke-sessions / reset password | Vẫn đá cả 2 phiên. |
| Backward-compat | Token cũ (không có `clientType`) → fallback so với cột legacy 1 lần, xem như phiên `web`. |

**Breaking cho FE:**
- **Web + App**: cần thêm interceptor gắn header `X-Client-Type` (xem §1.6.1.3 snippet code).
- **Error handling**: response interceptor cần bắt `403 auth.invalidRefreshToken` ở `/auth/refresh` → clear tokens local + toast "Tài khoản đã đăng nhập ở thiết bị khác" + redirect login (xem §1.6.1.4).
- **Sau deploy**: user đang login song song web + app trước đây → sẽ có 1 phiên bị đá 1 lần khi refresh. Sau đó session ổn định vào đúng slot. **Đề xuất** deploy FE App + FE Web đồng thời với BE để giảm impact.

Xem chi tiết đầy đủ (business rule, snippet code cho Web/Flutter/Swift/Kotlin, test cases, migration checklist) tại **§1.6.1**.

### v1.16.7 — 2026-07-01 (Required price fields — DTO validation siết chặt)

Tất cả field liên quan giá tiền không được null/để trống. Áp dụng cho property prices và booking deposit/amount.

| Endpoint | Thay đổi |
|---|---|
| `POST /properties` | `weekdayPrice`, `weekendPrice`, `holidayPrice`, `adultSurcharge`, `childSurcharge` → **required** (`int >= 0`). Trước đây tất cả optional, FE có thể tạo property không giá. |
| `PUT /properties/:id/prices` | Cả 5 field giá → **required**. Endpoint này dedicated set bảng giá → FE bắt buộc gửi đủ. Trước đây partial update, gửi field nào update field đó. |
| `PATCH /properties/:id` | 5 field giá vẫn optional (partial update), nhưng `null` → 400 (`ValidateIf` pattern: skip khi undefined, fail khi null). |
| `POST /bookings/hold` (CreateBookingDto) | `depositAmount` optional, gửi `null` → 400. |
| `PATCH /bookings/:id` (UpdateBookingDto) | `depositAmount` optional, gửi `null` → 400. |
| `PATCH /bookings/:id/mark-paid` | `amount` optional với fallback `totalAmount`/`depositAmount`, gửi `null` → 400. |

**Validation behavior**:
- Required (CREATE flows): omit field → 400. Gửi `null` → 400. Gửi `0` → OK (giá miễn phí hợp lệ).
- Not-null optional (PATCH flows): omit field → skip update. Gửi `null` → 400. Gửi `0` → OK.

**Breaking**: FE đang submit form tạo property mà bỏ trống giá → BE reject. FE phải ép user nhập đủ 5 giá trước khi submit (hoặc default về 0).

### v1.16.6 — 2026-06-30 (Enrich `/properties/share/:id` cho preview.halong24h.com)

OWNER share link 1 phòng cụ thể qua Zalo/Messenger → trỏ về `https://preview.halong24h.com/{propertyId}`. Endpoint `/properties/share/:id` đã có sẵn từ trước nhưng response thiếu các field web preview cần.

| Thay đổi | Chi tiết |
|---|---|
| Bổ sung fields vào response | `slug`, `city`, `district`, `floorArea`, `adultSurcharge`, `childSurcharge`, `ratingAvg`, `reviewCount`, `isHot`. Vẫn KHÔNG trả `weekdayPrice/weekendPrice/holidayPrice` (giá bán) và KHÔNG trả `owner` block (thông tin chủ nhà) — đúng yêu cầu nghiệp vụ. |
| `images[]` shape chuẩn hoá | Giờ select tường minh `{id, imageUrl, isCover, order}` thay vì lấy hết Prisma scalar (trước đây có `publicId, createdAt, propertyId` dư thừa). |
| Bỏ field `isActive` khỏi response | Trước đây leak `isActive=true` ra public — vô nghĩa vì WHERE clause đã chỉ trả property `isActive=true`. |
| Doc bổ sung §4.14 | Spec đầy đủ response shape cho team web preview. |

**Breaking?** Có rủi ro nhỏ: nếu FE cũ đang đọc `data.isActive`/`data.images[].publicId`/`data.images[].createdAt`, sẽ thấy `undefined`. Hiện chưa biết consumer nào dùng — `share/:id` dùng cho internal share link, scope nhỏ. FE web preview là consumer mới, đọc spec mới.

### v1.16 — 2026-06-27 (Customer web booking detail + similar properties + enriched BookingDto)

Phản hồi cho danh sách yêu cầu FE web khách hàng (received 2026-06-27).

| Thay đổi | Chi tiết |
|---|---|
| `GET /bookings/:id` mở cho CUSTOMER | Bỏ `@Roles(ADMIN,OWNER,SALE)` + `@Permission(BOOKINGS, READ)` trên controller; service check `booking.customerId === user.id` cho CUSTOMER (xem §5.3.1). Không cần wait FE lọc `my-bookings`. |
| BookingDto enrich (cả `findOne`, `getMyBookings`, `findAll`) | Thêm `code` (HL-XXXXXXXX), `propertySlug`, `coverImageUrl`, `host: {name, phone}` (phone CHỈ trả khi `status >= CONFIRMED`), `cancellationPolicy`, `hasReview`, `depositDeadlineAt` (HOLD = `holdExpireAt`, khác = null). Xem §5.3. |
| `GET /properties/public/:slug/similar` (NEW) | Public endpoint trả `PropertyCardDto[]` cho carousel "Cơ sở khác" cuối trang detail. Sort district → city → type, isHot/rating/reviewCount desc. Xem §4.12. |
| Confirm enum `cancellationPolicy` | 0=FLEXIBLE, 1=MODERATE, 2=STRICT (đã có trong [§19 Enums](#19-enums-reference) — không đổi). FE không cần đoán. |
| Confirm `PropertyCardDto` đã có `latitude` + `longitude` | Field tồn tại trong `PROPERTY_CARD_SELECT` từ trước, response `/properties/search` + `/properties/public` đã trả. FE đang bịa toạ độ là do chưa wire, không phải BE thiếu. |

**Field cần thêm CHƯA implement** (cần quyết định business hoặc schema migration — defer ngoài turn này):

| Field | Lý do defer | Tạm thời |
|---|---|---|
| `vietqr` ({bankBin, bankName, accountNumber, accountName, memo}) | Schema hiện chưa lưu bank info per-owner/property. Cần quyết định: per-owner bank, system bank Halong24h, hay FE generate VietQR client-side khi có data | FE ẩn panel VietQR booking-deposit, hướng dẫn khách chat trực tiếp chủ nhà |
| `approvedAt` (HOLD → CONFIRMED timestamp) | Chưa có field `confirmedAt` riêng trên `Booking` | FE fallback `updatedAt` khi `status >= CONFIRMED` (chấp nhận sai số nhỏ) |

**Yêu cầu CHƯA implement** (scope lớn — cần PRD + migration riêng, không nằm trong turn này):

| Yêu cầu | Lý do defer |
|---|---|
| A.3 Cruises (Du thuyền) | Cần thiết kế module mới: schema (`Cruise`, `CruiseRoom`, `CruiseAmenity`, `CruiseReview`...), CRUD cho host, public list/detail. Khối lượng tương đương module `properties`. Cần PRD + sprint riêng. |
| A.4 Chat pre-booking (no bookingId) | Hiện schema `Conversation` bắt buộc `bookingId` cho `type=booking`. Cần thêm `type='property_inquiry'` + `propertyId` nullable, sửa `ConversationsService.create`, sửa ACL (member resolve từ property.owner thay vì booking). Có rủi ro làm lệch chat retention. Cần align với team chat. |
| A.5 Blog / Articles | Module hoàn toàn mới: schema (`Article`, `ArticleCategory`), seed data, admin CMS. FE thấy ưu tiên thấp → defer khi có nội dung thực sự. |
| WebSocket realtime chat confirm | WS gateway đã có sẵn (xem §17.4) — `wss://api.halong24h.com/chat`, auth qua `socket.auth.token`. Đã production-ready. FE chỉ cần wire — không có thay đổi BE trong turn này. |

### v1.12.1 — 2026-06-11 (Trial quota fix: 1 SALE slot + machine `code` cho 403)

Hot-fix sau khi phát hiện OWNER vừa đăng ký không mời được nhân viên dù trial còn hạn.

| Thay đổi | Chi tiết |
|---|---|
| **Trial = 1 SALE slot** | Helper mới `getEffectiveMaxSaleStaff(planId, status)` ở `src/common/staff-entitlement.ts`. Khi `planId=null` + `subscriptionStatus="trial"` → 1 slot (constant `TRIAL_MAX_SALE_STAFF`). Các state khác giữ y nguyên `getMaxSaleStaff` (0 nếu chưa mua). Mirror cần thêm ở FE `staff_entitlement.dart`. |
| **Machine code cho 403** | 3 endpoint gate (`POST/PUT /properties`, `POST /staff/invites`) giờ trả `code` ổn định trong body: `"KYC_REQUIRED"` (chưa KYC) hoặc `"FEATURE_LOCKED"` (hết entitlement). Helper mới `featureLocked()` ở `src/common/errors/subscription.errors.ts`. FE match theo `code`, không cần fallback theo message. |

**Breaking?** Không (code mới thêm vào response, không xoá). FE nên migrate sang match theo `code`.

### v1.12 — 2026-06-10 (Apple IAP compliance: silent 60-day OWNER trial + generic entitlement gate)

App iOS đã gỡ UI thanh toán (Apple Guideline 3.1.1 không cho chuyển khoản ngoài với app dạng quản lý). Web + Google Play giữ nguyên flow.

| Thay đổi | Chi tiết |
|---|---|
| **Silent trial 60 ngày** | `/auth/register`, `/auth/google`, `/auth/apple` cho user mới `role=1` (OWNER) → BE tự set `subscriptionStatus="trial"` + `trialEndsAt = now + 60 ngày`. FE iOS **KHÔNG** hiển thị countdown. Constant: `OWNER_SIGNUP_TRIAL_DAYS` (`src/common/constants.ts`). |
| **Entitlement gate generic** | Helper mới `assertOwnerEntitled` (`src/common/subscription.ts`) check (a) `kycBypass`, (b) `subscriptionStatus="active"`, (c) `trial` còn hiệu lực. Áp dụng cho `POST /properties`, `PUT /properties/:id`, `POST /staff/invites`. SALE inherit từ owner được gán. |
| **i18n key mới** | `subscription.featureLocked` (vi/en) — "Tài khoản chưa có quyền dùng tính năng này." Dùng chung khi hết trial / `none` / `past_due` / `cancelled` / `frozen` — không lộ trạng thái subscription cụ thể. |
| **Staff invite message đổi** | Khi subscription không entitled, throw `subscription.featureLocked` thay vì `staff.subscriptionRequired` cũ. (`staff.subscriptionRequired` còn trong i18n nhưng không dùng ở luồng invite — giữ để tránh breaking i18n consumers khác.) |
| **Properties write paths** | `POST /properties`, `PUT /properties/:id` giờ cần entitlement (trước đây chỉ check KYC). Hết trial → 403 `subscription.featureLocked`. |
| **Unlock** | Khi admin gọi `POST /admin/users/:id/subscription/mark-paid` (luồng web/Play Store) → `subscriptionStatus → active` → entitlement gate pass ngay, không cần re-login. |

**Breaking?** Có 2 điểm FE cần handle:

1. Owner đăng ký mới giờ có `trialEndsAt` ngay khi vừa tạo account — Web/Android có thể hiển thị banner trial; iOS phải ẩn.
2. Hết trial → `POST /properties`, `PUT /properties/:id`, `POST /staff/invites` đều có thể trả **403 `subscription.featureLocked`** thay vì lỗi cũ. FE bắt error code này và hiển thị message generic + dẫn user về flow thanh toán (Web/Android) hoặc liên hệ hỗ trợ (iOS).

### v1.11 — 2026-06-07 (KYC Option A + admin queue filter enum)

| Thay đổi | Chi tiết |
|---|---|
| **Luồng KYC** | Duyệt trước → thanh toán sau. `POST /kyc/submit` → `awaiting_approval`. Admin approve → `approved` (chưa subscription). `POST /payments/initiate` yêu cầu `kycStatus=approved`. |
| **Admin queue** | **Một endpoint** `GET /admin/kyc/queue?filter=0\|1\|2\|3` thay cho 3 request song song `status=...`. Response thêm `pendingCount`, mỗi item thêm `statusFilter` (1\|2\|3). |
| **`GET /count-pending`** | Deprecated — dùng `data.pendingCount` từ queue. |
| **Migration DB** | Hồ sơ legacy `kyc_submitted` + `user.kycStatus=pending` → `awaiting_approval`. |
| **403 mới** | `payment.kycNotApproved` khi initiate subscription trước khi admin duyệt KYC. |

### v1.10 — 2026-06-06 (Reports validation + spec sync cho FE đa nền tảng)

Đồng bộ spec với code sau khi FE mobile wire xong tab Báo cáo và ghép thêm KYC/Apple IAP.

| Thay đổi | Chi tiết |
|---|---|
| Thêm §7A **Dashboard & Reports** | Document đầy đủ `GET /dashboard/stats` + `GET /reports` (period, custom range, response shape) — gỡ rời khỏi §1 enum table |
| `GET /reports` validation 400 mới | `dashboard.toInFuture` (to ở tương lai), `dashboard.invalidPeriod` (period không hợp lệ). i18n en+vi đã sync |
| `GET /reports` response — clarify scale convention | `occupancyRate` + `previousPeriod.occupancy` = **0..100**; `revenueByDay[].occupancy` + `topRooms[].occupancy` + `dayOfWeekOccupancy.values[]` = **0..1** |
| `LoginDataDto` — xóa field `user: UserDto` (Swagger schema fix) | Swagger UI giờ hiển thị đúng response auth chỉ có `accessToken` + `refreshToken`. Khớp với contract v1.7 |
| §5.4 + §10.2 — phân biệt `PATCH /bookings/:id/paid` (deposit khách) vs `POST /payments/initiate` (subscription owner) | FE đa nền tảng tránh wire nhầm flow |
| §6.1 Calendar — document `propertyIds` plural | Public/grid hỗ trợ CSV (`?propertyIds=u1,u2`) hoặc array repeat |
| §11.2 Staff invites — thêm response shape `verify` + `accept` | `accept` chỉ tokens (khớp [[feedback-auth-response-shape]]), `verify` có nested `owner.{name,avatar,homestayName}` |
| §20.1 + §20.2 — thêm `/uploads` vào FE checklist | Tránh team bỏ sót khi tích hợp chat / dispute evidence |

**Breaking?** Không. Chỉ thêm validation + cập nhật doc + xóa field DTO chưa từng được populate ở runtime.

### v1.9 — 2026-06-06 (Payment session lifecycle + Starter Test plan)

Khắc phục bug "loading mãi ở trang chờ đối soát" khi user đóng/mở lại app sau khi initiate session, và bổ sung plan thử nghiệm cho QA / App Store review.

| Thay đổi | Chi tiết |
|---|---|
| Thêm plan `starter_test` (10,000đ/tháng, 1 phòng, VAT 0%) | Reseed DB hoặc tạo thủ công qua admin |
| `POST /payments/:sessionId/cancel` | User huỷ session pending. Revert `KycSubmission.payment_pending → kyc_submitted` |
| `GET /payments/active` | Lấy session pending mới nhất (rehydrate sau khi đóng modal) |
| `GET /kyc/status` thêm field `latestPayment` | FE không cần persist sessionId ở client |
| Tách 2 mốc thời gian: `QR_EXPIRY_MINUTES=15` + `SESSION_EXPIRY_MINUTES_BANK=1440` | Response thêm `qrExpiresAt`, `reconcileWindowHours` |
| Cron `expirePendingSessions` (mỗi 5 phút) revert KYC submission khi expire | Fix bug pre-existing: `@Cron` decorator gắn nhầm trên `adminListSessions` |
| i18n keys mới (en/vi) | `payment.cancelSuccess`, `payment.cannotCancel`, `payment.activeSuccess` |

**Breaking?** Không — tất cả trường mới đều additive. Hành vi `expiresAt = 24h` không đổi. FE cũ vẫn chạy được, chỉ là không có nút huỷ + không rehydrate được modal sau khi đóng.

### v1.8 — 2026-06-05 (Authorization rules)

Thêm §2A — section đầy đủ giải thích phân quyền cho cả Web và Mobile.

| Section | Nội dung |
|---|---|
| §2A.1 | 3 lớp guard BE chạy theo thứ tự (JwtAuthGuard, RolesGuard, PermissionGuard) |
| §2A.2 | Khi nào 401 vs 403 vs 404 — FE biết retry vs report |
| §2A.3 | Bảng tổng — Role nào vào endpoint nào (Public/Auth/CUSTOMER/OWNER+SALE/OWNER/ADMIN) |
| §2A.4 | Permission cho SALE — 4 module × 4 action |
| §2A.5 | Điều kiện business ngoài role: KYC required, Subscription active, Banned, Ownership, Resource state |
| §2A.6 | Special case — endpoint cho phép nhiều role nhưng behavior khác (vd: GET /properties, /staff/invites) |
| §2A.7 | Bypass đặc biệt: ADMIN, kycBypass |
| §2A.8 | Đối chiếu status mã 401/403/404/409/410/422/429 chống nhầm |
| §2A.9 | Checklist FE — 4 câu hỏi trước khi wire 1 endpoint |

FE web đang gặp 403 không hiểu lý do → đọc §2A.5 thường ra ngay.

### v1.7 — 2026-06-05 (BREAKING: tách auth response và profile)

> ⚠️ **Breaking change** — FE Web và Mobile **bắt buộc phải sửa** để tiếp tục hoạt động.

#### Vấn đề
Response của 5 endpoint auth trả về cả tokens và `user` object — gây ra:
- Khó maintain (đổi User shape → fix 5 chỗ)
- Không thể auto-sync state khi subscription đổi
- Không theo OAuth 2.0 / OIDC standard

#### Thay đổi
Response của `POST /auth/register`, `/auth/login`, `/auth/google`, `/auth/apple`, `/staff/invites/accept` **chỉ trả tokens**:

```json
{
  "data": {
    "accessToken": "...",
    "refreshToken": "..."
    // KHÔNG còn user object
  }
}
```

FE phải gọi thêm `GET /auth/profile` sau khi login thành công để lấy thông tin user.

#### Lỗi nhận biết
Web/App báo "thiếu thông tin người dùng từ máy chủ" hoặc tương đương — do parse `response.data.user.xxx` → `undefined`.

#### Cách fix FE
Xem §2.4 — flow chuẩn với 2 request.

#### Affected screens
- Login screen
- Register screen
- Google Sign-In handler
- Apple Sign-In handler
- Staff invite accept screen
- Auto-login flow (app restart)

### v1.6 — 2026-06-05 (Manual reconcile flow)

Phase hiện tại chưa setup Sepay webhook → flow chuyển sang manual reconcile.

| Change | Mô tả |
|---|---|
| TK production = ACB 21169431 NGUYEN VU NAM (BIN 970416) | Đã sync BE env với hardcode FE app. **FE app cần sửa**: bỏ hardcode, dùng `bankInfo` từ response (xem ticket §22.X) |
| TTL session 15 phút → 24 giờ | Cho admin đủ thời gian đối soát thủ công |
| `GET /admin/payments` | List session pending để admin tìm đối soát |
| `POST /admin/payments/:sessionId/mark-paid` | Admin xác nhận đã nhận tiền cho session đó. Idempotent. Audit log `payment.session_mark_paid` |

Workflow chi tiết xem §10.3.

### v1.5 — 2026-06-05 (Add /uploads endpoint)

Bổ sung endpoint upload generic cho FE Chat Phase 15. Chi tiết §23.

| Add | Mô tả |
|---|---|
| `POST /uploads` | Multipart upload, whitelist JPEG/PNG/WEBP/GIF/PDF, 10MB max, rate-limit 30/phút/user, magic bytes check |
| `DELETE /uploads/:id` | Owner xoá orphan upload (chưa attach vào message). 403 nếu không phải owner, 400 nếu đã attached |
| Schema `UploadRecord` | Track upload + attached state, dùng cho cron orphan cleanup |
| Auto link upload ↔ message | ChatService.sendMessage tự gọi `markAttached(senderId, urls, messageId)` |
| Cron orphan cleanup | Mỗi giờ — xoá UploadRecord `attachedAt=null + createdAt > 24h ago` (max 200/lần) |
| Wire chat retention | Khi message bị purge 365-day (v1.20+) → tự xoá attachment Cloudinary tương ứng |

**Storage stack**: Cloudinary (reuse, đã có sẵn). URL `https://res.cloudinary.com/...`.

### v1.4 — 2026-06-05 (Clean payment scope)

Loại bỏ triệt để các phương thức thanh toán không sử dụng ở phase hiện tại.

| Removed | Lý do | Impact |
|---|---|---|
| VNPay (QR + Gateway + IPN webhook) | Không dùng ở phase hiện tại | Xoá module helper, endpoint `/payments/vnpay/ipn`, constants `PAYMENT_METHOD.VNPAY_QR`, `PAYMENT_PROVIDER.VNPAY`, env `VNPAY_*` |
| Apple IAP (S2S notification, verify endpoint, AppleTransaction/AppleNotification tables) | Không dùng ở phase hiện tại (giữ Apple Sign-In cho login) | Xoá module `apple-iap/`, endpoint `/payments/apple/verify`, `/webhooks/apple/s2s-notifications`, drop 2 DB tables, xoá constants liên quan |
| `card` method | Chưa implement bao giờ | Xoá khỏi enum |

**Phương thức thanh toán còn lại** (chỉ 2):
- `bank_transfer` — VietQR + auto reconcile webhook Casso/Sepay
- Manual mark-paid (admin) — ghi nhận tay khi user chuyển ngoài flow

`subscriptionProvider` enum giờ chỉ: `manual_bank | manual | casso | sepay | null`.

`POST /payments/initiate { method: "bank_transfer", ... }` là endpoint duy nhất tạo session. Body method chỉ accept `"bank_transfer"`, gửi method khác → 400.

> **Lưu ý cho FE**: Trang `/host/settings/subscription` không còn dropdown chọn method. Chỉ hiển thị VietQR + STK ngân hàng → user quét hoặc chuyển khoản → BE auto reconcile qua bank webhook.

### v1.3 — 2026-06-05 (FE Q&A response)

Confirm field shape + add endpoints theo yêu cầu FE. Chi tiết đối chiếu trong §22.

| Fix | Endpoint / Field | Mô tả |
|---|---|---|
| Booking flat fields | `GET /bookings*` | Thêm `propertyName` (string) + `nights` (number) computed |
| Users stats | `GET /users?withStats=true` | Bundle `stats: { propertyCount, bookingCount }` per user |
| Users shape extended | `GET /users` | Thêm `avatar`, `subscriptionStatus`, `subscriptionPlanId`, `subscriptionCycle`, `bannedAt`, `bannedReason`, `updatedAt` vào select |
| Review detail | `GET /admin/reviews/:reviewId` (NEW) | Hydrate property + customer + booking |
| Calendar multi-property | `GET /calendar/grid?propertyIds=...` (CSV/array) | Cùng range cho N property — không phải N request |
| Lead hydrate | `GET/PATCH /leads*` | Thêm `assignedToName`, `contactedByName` (batch lookup, no N+1) |

### v1.2 — 2026-06-05 (fix nốt)

Hoàn thiện các MEDIUM/LOW issue còn lại từ v1.1 và thêm tính năng đã defer.

#### Audit log enrichment

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| IP + User-Agent tự động ghi | Mọi admin action audit log giờ tự include `ipAddress` + `userAgent` của request (qua `AsyncLocalStorage` global interceptor) | Hiển thị thêm cột IP/UA trong `GET /admin/audit-log` UI |

#### Chat

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| `PATCH /conversations/messages/:messageId` | Sender sửa tin trong 15 phút sau gửi. System messages không sửa được. Broadcast `message:edit` qua WS | Hiển thị "đã chỉnh sửa" + cập nhật content live |
| `DELETE /conversations/messages/:messageId` | Sender hoặc admin xoá. Soft-delete. Broadcast `message:delete` | Hiển thị "Tin nhắn đã bị xoá" hoặc ẩn |
| i18n locale at handshake | Gateway resolve locale từ `query.lang` hoặc `Accept-Language` header → error message đúng ngôn ngữ | Truyền `query: { lang: 'vi'\|'en' }` khi connect socket |
| `JwtModule.registerAsync` | Secret từ ConfigService consistent với AuthModule | Không ảnh hưởng FE |

#### Properties

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| OWNER PATCH property rejected → auto `approved` | OWNER edit property bị reject, BE tự chuyển `moderationStatus → approved`; OWNER tự bật `isActive` | Không còn toast "Đã gửi lại để duyệt"; hiển thị trạng thái theo `moderationStatus` + `isActive` |
| OWNER không tự bật property `suspended` | `PATCH isActive=true` khi `moderationStatus=suspended` → 403 `cannotReactivateSuspended` | Disable nút bật; hướng dẫn liên hệ admin |

#### Leads

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| Dedup theo phone + propertyId trong 1h | Submit form 2 lần (F5, retry) trả về lead cũ thay vì tạo trùng | Không thay đổi UX (idempotent từ phía FE) |

#### Users

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| `unbanUser` block self-target | Admin không tự unban được mình (giống `banUser` đã có) | Disable nút unban khi `userId === self.id` |
| Reset password complexity check | Mật khẩu phải có ít nhất 1 chữ + 1 số (cộng MinLength 8) | Hiển thị error `passwordWeak` nếu validate fail |

### v1.1 — 2026-06-05

Tổng hợp các fix dựa trên rà soát code (3 reviewer độc lập).

#### Chat module

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| Idempotent `POST /conversations` | Tạo conversation 2 lần đồng thời cho cùng booking → request thua tự re-fetch conv đã có | Không cần thay đổi |
| Cursor không hợp lệ | `GET /conversations/:id/messages?cursor=<invalid>` không còn throw 500 — server degrade về đầu danh sách | Có thể safely retry cursor cũ |
| `leftAt` filter | Member đã rời conversation không nhận `read:update`, `presence`, không gửi tin, không mark-read được | Đảm bảo data clean khi member rời |
| WS UUID validate | `message:send` reject payload có `conversationId` không phải UUID | Tránh ăn 500 |
| Attachment validate chặt | URL bắt buộc `https://`, item shape validated cả ở REST DTO lẫn WS strip | FE phải upload trước rồi gửi URL https |

#### Subscription

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| `priceOverride = 0` hợp lệ | Trước: ignore 0, dùng giá plan. Sau: 0 = free, expectedTotal = 0 | FE có thể set 0 nếu admin muốn free |
| Mark-paid idempotency | 2 click trong 10s → 409 `markPaidDuplicate` (i18n) | Disable nút sau click, hoặc retry với mã 409 hiển thị toast |
| Grant trial bị cấm khi `frozen` | 409 `cannotGrantTrialFrozen` — phải unfreeze trước | Disable nút grant trial khi `subscriptionStatus=frozen` |
| Unfreeze restore TRIAL | Nếu user đang TRIAL khi bị freeze → unfreeze về TRIAL, không phải ACTIVE | Hiển thị `trialEndsAt` countdown sau unfreeze nếu còn |
| Audit `targetType` | Tất cả subscription action lưu `targetType=user` thay vì `subscription` | Filter audit log theo `targetType=user` |
| `/subscriptions/me` SALE chưa gán | Trả 400 `saleNotAssigned` thay vì subscription rỗng vô nghĩa | Hiển thị empty state "chưa gán team" |

#### Properties

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| OWNER/SALE tự thấy property pending | `GET /properties` cho OWNER/SALE tự include pending/rejected/suspended (không cần `?includeInactive=true`) | Loại bỏ hardcode `?includeInactive=true` ở host UI |
| `moderationStatus='suspended'` | Khác `'rejected'` — semantic riêng cho property đã từng approved bị admin tạm ngưng | UI phân biệt 2 trạng thái: "Bị từ chối lần đầu" vs "Bị tạm ngưng" |

#### Bookings

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| `POST /bookings/hold` thêm `@Roles(ADMIN/OWNER/SALE)` | CUSTOMER không gọi được endpoint này → bắt buộc dùng `/customer-hold` | CUSTOMER UI không hiển thị nút staff-hold |
| `PATCH /bookings/:id/paid` ghi audit log | `action=booking.mark_paid` tự log | Filter audit theo action này |

#### Users

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| `PATCH /users/:id/kyc-bypass` ghi audit log | `action=user.kyc_bypass_toggle` | Hiển thị trong audit log filter |
| `DELETE /users/:id` ghi audit log | `action=user.delete` | Same |

#### Disputes

| Fix | Mô tả | Ảnh hưởng FE |
|---|---|---|
| `POST /admin/disputes/:id/resolve` notify cả opener | Trước: chỉ notify owner+customer. Sau: cộng thêm opener nếu là admin/sale | Push notification arrive nhiều hơn — chuẩn business logic |

### Issue đã biết — chưa fix (chấp nhận trade-off)

| Issue | Lý do giữ nguyên |
|---|---|
| Chat retention dùng hard delete (không `deletedAt`) | Intent: tiết kiệm DB; soft-delete cũng bị purge sau retention period. Đã document trong §17.5 |
| Chat presence event broadcast tới mọi peer của user | Có thể fan out lớn (vài chục peer × vài chục member). Acceptable cho v1 < 1000 user |
| Email template manager dùng sample text/HTML đơn giản | Khi wire production renderer cho template nào, chỉ cần thay sample trong `EMAIL_TEMPLATE_SAMPLES`. FE không cần đổi |
| Chat audit log không log từng message | Chi phí storage quá lớn (1M+ messages/năm). Chỉ log moderation actions |
| Conversation không có DB-level `@@unique([type, bookingId])` | Tránh migration phá data hiện có. App-level retry đủ an toàn cho v1 |
| Subscription audit `actorRole` hardcode `ROLE.ADMIN` | Endpoint guarded `@Roles(ROLE.ADMIN)` nên luôn đúng. Future-proof khi mở rộng role thì thay |
| Message edit sender multi-tab sync | Edit broadcast tới recipients, không phải tab khác của sender. Sender đã có response REST đồng bộ. Polish sau |

---

---

## 22. FE Q&A — Confirms & Design decisions

Trả lời cho danh sách câu hỏi từ team FE (received 2026-06-05). Các fix đã apply ở v1.3 (cuối session này).

### A. Field shape

#### A1. Booking — naming convention ✅ CONFIRMED + FIXED

- **Field names**: BE dùng đúng spec — `customerName`, `customerPhone`, `checkinDate`, `checkoutDate`, `totalAmount`, `depositAmount`, `paidAmount`, `paidAt`. Không phải `guestName`/`checkInAt`/snake_case.
- **Hydration**: `property` được include sẵn (`{ id, name, code, type, images[cover] }`) + `sale` (`{ id, name, phone }`). FE không cần N+1.
- **v1.3 thêm flat fields**: BE trả thêm 2 field phẳng cho FE tiện dùng:
  - `propertyName` (string) — denormalize từ `property.name`
  - `nights` (number) — computed từ `checkoutDate - checkinDate` (UTC date diff)

Response shape:
```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "property": { "id": "uuid", "name": "...", "code": "...", "type": 0, "images": [...] },
  "propertyName": "Villa A",
  "nights": 2,
  "customerName": "...", "customerPhone": "...",
  "checkinDate": "...", "checkoutDate": "...",
  "status": 0, "holdRemainingSeconds": 1700,
  "totalAmount": 4000000, "paidAmount": null, "paidAt": null,
  "depositAmount": 500000, "guestCount": 4,
  "sale": { "id": "...", "name": "...", "phone": "..." }
}
```

#### A2. Users aggregation stats ✅ FIXED — Option 1

`GET /users?withStats=true` (v1.3) — bundle stats trong response:
```json
{
  "id": "...", "name": "...", "...": "...",
  "subscriptionStatus": "active", "subscriptionPlanId": "rooms_5",
  "bannedAt": null, "bannedReason": null,
  "stats": {
    "propertyCount": 3,
    "bookingCount": 25
  }
}
```

`bookingCount` (v1.28) = số booking user **liên quan**: là chủ phòng (`property.ownerId = user`), hoặc người tạo hold (`saleId = user`), hoặc khách đặt (`customerId = user`) — dedup theo booking. Trước v1.28 chỉ tính `saleBookings + customerBookings` nên OWNER có phòng đầy booking (do SALE tạo / khách tự đặt) vẫn ra `0`; nay đếm cả booking trên phòng OWNER sở hữu.
`lastActiveAt` chưa có (chưa track session time). Có thể derive từ `updatedAt` tạm thời.

**Search keyword (v1.7.1):** `GET /users?q=<keyword>` — tìm theo `name` / `phone` / `email` (case-insensitive, max 100 ký tự). Có thể kết hợp với `role` và `withStats`. Ví dụ: `GET /users?role=1&q=0912&withStats=true`.

#### A3. Properties aggregation ✅ CONFIRMED

`GET /properties` đã include `_count: { bookings }` (`property._count.bookings` là số booking). FE map sang `bookingCount` từ field này.

Phân biệt trạng thái dùng `moderationStatus` + `isActive` (không suy luận từ `bookingCount`):
- `approved + isActive=true` — đang public
- `approved + isActive=false` — owner tự tắt (ẩn khỏi `/properties/public`)
- `rejected` — admin từ chối (`isActive=false`)
- `suspended` — admin tạm ngưng (`isActive=false`, owner không tự bật lại)
- `pending` — legacy (chỉ dữ liệu cũ)

#### A4. Subscription list response shape ✅ CONFIRMED

`GET /admin/subscriptions` trả **user-level** field, không phải Subscription row. Không có `startsAt`/`endsAt`. FE không cần fallback `endsAt ?? nextChargeAt ?? expireAt ?? updatedAt`.

Shape chính xác mỗi item:
```json
{
  "id": "uuid (=userId)",
  "name": "...",
  "email": "...",
  "phone": "...",
  "isActive": true,
  "subscriptionStatus": "active",
  "subscriptionPlanId": "rooms_5",
  "subscriptionCycle": "monthly",
  "subscriptionProvider": "manual_bank",
  "subscriptionPriceOverride": 1200000,
  "subscriptionFrozenAt": null,
  "subscriptionFrozenReason": null,
  "trialEndsAt": null,
  "nextChargeAt": "2026-07-04T00:00:00.000Z",
  "rooms": 5,
  "amount": 658900
}
```

**`rooms`** (v1.13): số phòng của subscription hiện hành. Lấy từ `Subscription.rooms` row mới nhất, fallback `plan.maxRooms` hoặc `1`. FE **không** cần suy từ `planId`.

**`amount`** (v1.13): tổng tiền/kỳ thực tế đã bao gồm VAT (VND, integer). Tính bằng cùng công thức `POST /payments/quote` (`computeFullCycleTotal`): `max(pricePerRoom × rooms, minCharge) × months × (1 - yearlyDiscount) + VAT`. Khi có `subscriptionPriceOverride` → dùng override + VAT tính trên override. `null` nếu user chưa có plan + không có override. FE chỉ cần đọc `amount` để hiển thị, không tự tính.

**Plan ID format**: `rooms_1`, `rooms_5`, `rooms_10`, `rooms_20`, `rooms_50`, `enterprise`. **KHÔNG** có `_monthly`/`_yearly` suffix — `cycle` lưu riêng ở field `subscriptionCycle`.

#### A5. Subscription identification → Option A ✅ CONFIRMED

**1 user = 1 active subscription tại 1 thời điểm**. Subscription rows lưu lịch sử period (mark-paid tạo row mới cho period mới), nhưng User table có duy nhất 1 set field `subscriptionStatus/PlanId/Cycle/...` đại diện active.

→ FE đổi tham số endpoint từ `subscriptionId` sang `userId`. Tất cả admin action subscription đều `/admin/users/:id/subscription/*`.

`Subscription.id` (UUID của row) chỉ dùng nội bộ BE để theo dõi period — FE không cần.

#### A6. permissions[] cho non-SALE ✅ CONFIRMED

Prisma relation luôn trả mảng. Non-SALE user nhận `permissions: []` (mảng rỗng), không phải `undefined`.

FE check: `if (user.role === 2 && user.permissions.length > 0) {...}`.

### B. Endpoint còn thiếu (NEW v1.3)

#### B1. GET /admin/reviews/:reviewId ✅ ADDED

Trả full ReviewDto + hydrate:
```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "bookingId": "uuid",
  "customerId": "uuid",
  "cleanliness": 5, "...": "...",
  "avgRating": 4.67,
  "comment": "...", "photos": [...],
  "ownerReply": "...", "ownerReplyAt": "...",
  "isHidden": false, "hiddenReason": null,
  "property": { "id": "...", "name": "...", "code": "...", "type": 0, "ownerId": "..." },
  "customer": { "id": "...", "name": "...", "email": "...", "phone": "...", "avatar": "..." },
  "booking": { "id": "...", "checkinDate": "...", "checkoutDate": "...", "status": 3, "totalAmount": ..., "paidAmount": ... }
}
```

#### B2. Calendar multi-property ✅ ADDED

`GET /calendar/grid?propertyIds=uuid1,uuid2,uuid3` (CSV) hoặc array form `?propertyIds=a&propertyIds=b`.

- `propertyIds` ưu tiên hơn `propertyId` nếu cả 2 truyền.
- Multi-property + range giữ giới hạn 90 ngày × N property (verify `assertRangeWithinLimit`).
- Áp dụng cho cả `/calendar/grid` và `/calendar/public-grid`.

#### B3. Dispute extended fields ❌ DEFER v2

Spec hiện chỉ có: `type, subject, description, amount, status, resolution, refundAmount, attachments?, resolvedById, resolvedAt`.

**KHÔNG có** trong v1.3: `evidence[]`, `chatExcerpt[]`, `verdict`, `penaltyType`. FE strip khỏi UI ở v1.

Khi cần v2:
- `evidence[]` = `attachments[]` đã có sẵn (URL upload). FE chỉ cần rename.
- `chatExcerpt[]` — cần ID range của messages trong conversation. Có thể link qua `bookingId` → conversation → messages.
- `verdict` — hiện dùng `status` (resolved/rejected) đủ. Nếu cần granular thêm `verdictDetail` enum sau.
- `penaltyType` — auto-apply qua action chain (admin `ban_temp` user thì gọi `POST /users/:id/ban` riêng).

#### B4. Lead hydrate assignedTo ✅ FIXED v1.3

GET/PATCH lead trả thêm:
- `assignedToName: string | null`
- `contactedByName: string | null`

(Batch lookup 1 query, không N+1.)

#### B5. KYC submission lifecycle ✅ CONFIRMED — 4 state

Web admin chỉ cần 4 state: `none | pending | approved | rejected`.

Web admin KYC list: **một API** `GET /admin/kyc/queue?filter=0|1|2|3`.

| `filter` | Tab web |
|---:|---|
| `0` | Tất cả |
| `1` | Chờ duyệt |
| `2` | Đã duyệt |
| `3` | Đã từ chối |

Mỗi item có `statusFilter` (1|2|3) — FE map text. Chi tiết nội bộ vẫn có field `status` (camelCase).

8-state lifecycle DB (`draft | kyc_submitted | payment_pending | awaiting_approval | approved | rejected | refunded`) là **internal BE**. Admin tab gom:
- `kyc_submitted`, `payment_pending`, `awaiting_approval` → **filter=1 (chờ duyệt)**
- `approved`, `refunded` → **filter=2 (đã duyệt)**
- `rejected` → **filter=3 (đã từ chối)**
- `refunded` → **none** (đã thoái KYC)

Field BE trả về web: `kycStatus: 'none' | 'pending' | 'approved' | 'rejected'` (4 state) — đã map sẵn ở `/auth/profile` và `/kyc/status`.

### C. Design decisions

#### C1. Idempotency keys

| Endpoint | Idempotent? | Cơ chế |
|---|---|---|
| `POST /conversations` (booking type) | ✅ Có | `findFirst` theo `bookingId`. Race → retry trả conv đã có |
| `POST /leads` | ✅ Có | Dedup theo `phone + propertyId` trong 1 giờ (v1.2) |
| `POST /payments/initiate` | ⚠️ Partial | BE expire pending sessions cũ trên cùng submission khi tạo session mới (line 246-249 payment.service.ts). FE click 2 lần → session đầu bị expire, session 2 mới active. Không hoàn hảo nhưng không double-charge thật |
| `POST /admin/users/:id/subscription/mark-paid` | ✅ Có | 10-second window check (v1.1) → 409 `markPaidDuplicate` |
| `POST /bookings/hold`, `/customer-hold` | ❌ Không | Mỗi call tạo booking mới. FE phải disable nút sau click |

FE có thể truyền optional header `X-Idempotency-Key` (UUID) — chưa support, nhưng có thể bổ sung v2 khi cần.

#### C2. Rate limit headers

ThrottlerModule mặc định **không trả** `X-RateLimit-Remaining` / `Retry-After`. FE nhận 429 với response body có message → toast generic.

Để có header, cần custom ThrottlerGuard — defer v2 nếu FE cần hiển thị countdown.

#### C3. Pagination format

**Chuẩn cuối cùng** (v1.3 đã đồng bộ):

**Listing endpoints đều trả 1 trong 2 shape**:

**Shape A** — `{ items, total, page, limit, totalPages }`:
- `/admin/subscriptions`, `/admin/disputes`, `/admin/audit-log`, `/admin/reviews`, `/conversations`, `/bookings/my-bookings`, `/leads`

**Shape B** — `data` là array trực tiếp + `meta` ở top-level (sibling của `data`, KHÔNG bọc trong `data`):
- `/bookings` → `data: BookingDto[], meta: { total, page, limit }`
- **`/notifications`** → `data: NotificationDto[], meta: { total, page, limit }` — ⚠️ **đính chính 2026-07-09**: trước đây liệt kê nhầm ở Shape A. BE thực tế trả `data` là **MẢNG**; phân trang ở `response.data.meta` (KHÔNG có `items` bên trong `data`). App parse `response.data['data'] as List` là ĐÚNG với thực tế; đọc `response.data['meta']` cho total/page/limit.

**Endpoint trả array plain (không paginate)**:
- `/users`, `/users/my-staff`, `/users/available-staff`, `/staff`, `/staff/invites`, `/properties`, `/properties/public`, `/billing/plans`, `/notifications/unread-count` (object), `/calendar/properties`, `/devices`, `/admin/emails/templates`

FE đang fallback `Array.isArray(data) ? data : data.items` — pattern đúng, giữ. Standardize sang 1 format chung sẽ là **breaking change** lớn, defer v2.

#### C4. WebSocket cursor

**Cursor là message UUID** (không phải timestamp). Lấy từ `nextCursor` của response REST trước.

```ts
// FE flow khi reconnect:
let lastCursor: string | null = null;
async function fetchMessages() {
  const res = await fetch(`/conversations/${id}/messages?cursor=${lastCursor ?? ''}&limit=50`);
  const { items, nextCursor } = res.data;
  if (items.length) lastCursor = nextCursor; // lưu cho lần fetch tiếp
  return items;
}
```

**Edge case v1.1 fix**: Cursor không hợp lệ (message bị purge/delete) → BE graceful degrade về đầu, không 500. FE có thể safely retry cursor cũ.

Khi reconnect WS:
1. Lưu `lastReceivedMessageId` cuối cùng trước disconnect
2. `connect` event fire sau reconnect → gọi REST với `cursor=lastReceivedMessageId` để fetch missed messages
3. Merge vào local state (skip duplicates qua message ID)

WS không tự replay missed messages — phải qua REST.

---

---

## 23. Uploads — Generic file upload

> **Mới v1.5 (2026-06-05)**: Endpoint generic upload cho chat attachment + future use cases (dispute evidence, ...). Đáp ứng yêu cầu FE Phase 15.

### 23.1 Mục đích

FE Chat (Phase 12-14) đã wire xong, cần endpoint để upload file → lấy URL → gửi kèm `POST /conversations/:id/messages { attachments: [{ url, type, name, size }] }`.

BE chọn **Option A — Generic `/uploads`** thay vì scope theo conversation:
- Tái sử dụng cho mọi context cần URL (chat, dispute evidence, future review photo edit)
- 1 method `apiClient.upload(file)` dùng được mọi nơi
- ACL được check khi message thực sự gửi (ChatService verify member trước khi attach)

### 23.2 Endpoints

| Method | Path | Auth | Body |
|---|---|---|---|
| `POST` | `/uploads` | Bearer | `multipart/form-data` — field `file` (single) |
| `DELETE` | `/uploads/:id` | Bearer | — |

### 23.3 POST /uploads

**Rate limit**: 30 req/phút/user.

**Whitelist MIME**:
- `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- `application/pdf`

**Limits**:
- Size: ≤ 10MB (vượt → 413 Payload Too Large)
- Filename length: ≤ 255 ký tự (BE tự sanitize)

**Response 201**:
```json
{
  "success": true,
  "message": "Tải lên thành công",
  "data": {
    "id": "uuid",
    "url": "https://res.cloudinary.com/<cloud>/image/upload/v123/chat/attachments/abc.jpg",
    "type": "image/jpeg",
    "name": "photo.jpg",
    "size": 458123,
    "expiresAt": null
  }
}
```

**Errors**:
| Status | Trường hợp |
|---|---|
| 400 | `file` field thiếu / rỗng / Cloudinary fail |
| 401 | Chưa login |
| 413 | File > 10MB |
| 415 | MIME không trong whitelist (BE check magic bytes thực sự, không tin Content-Type) |
| 429 | Quá 30 req/phút |

### 23.4 DELETE /uploads/:id

Dùng khi user upload nhưng đổi ý không gửi tin → cho phép xoá ngay để giải phóng storage (thay vì đợi cron 24h).

**Điều kiện**:
- Chỉ owner của upload mới xoá được (403 nếu không phải)
- Chỉ xoá được nếu chưa attach vào message (400 nếu đã attach — phải xoá message tương ứng)

### 23.5 Security & validation

| Layer | Mô tả |
|---|---|
| **Magic bytes check** | BE đọc 8-12 byte đầu file, so với signature table. Không tin `Content-Type` header (attacker fake được). MIME detected mới được dùng để lưu DB. |
| **Filename sanitize** | Strip path traversal (`/`, `\`), control chars, special chars (`<>:"|?*`). Limit 255 chars. |
| **Cloudinary unique filename** | `unique_filename: true` — Cloudinary tự append random suffix tránh collision |
| **EXIF strip** | Image transformation tự strip metadata (GPS, ...) trước khi public |
| **Image resize** | Auto resize max 1920×1080 với `crop: limit` (không cắt khi nhỏ hơn) |
| **JWT auth** | Bearer required — không có endpoint anonymous upload |

### 23.6 Lifecycle

| Sự kiện | Hành động |
|---|---|
| Upload thành công | Tạo `UploadRecord` với `attachedAt=null` |
| FE gửi message với `attachments: [{ url }]` | ChatService gọi `uploadsService.markAttached(senderId, urls, messageId)` → set `attachedAt + attachedMessageId` (chỉ ghi record thuộc sender — chống attacker dùng URL của người khác) |
| FE xoá file orphan qua `DELETE /uploads/:id` | Cloudinary destroy + xoá DB record |
| **Cron orphan cleanup** (mỗi giờ) | Quét UploadRecord có `attachedAt=null` + `createdAt < now - 24h` → Cloudinary destroy + xoá DB. Tối đa 200/lần để không spike |
| **Cron retention chat** (mỗi ngày 3AM) | Khi message bị purge (> 365 ngày, v1.20+; không có dispute) → tự gọi `uploadsService.deleteByMessageIds()` để xoá attachment Cloudinary tương ứng |

### 23.7 Storage stack

- **Cloudinary** — đã có sẵn (dùng cho property images + KYC). Reuse, không thêm dep
- URL format: `https://res.cloudinary.com/<cloud_name>/image/upload/.../...` (image) hoặc `.../raw/upload/...` (PDF)
- **Public-read** (không signed URL ngắn hạn) — message URL phải xem được mãi (365 ngày retention, v1.20+)
- Folder: `chat/attachments/` mặc định

### 23.8 Câu hỏi FE đã trả lời

| Câu hỏi | Trả lời |
|---|---|
| CDN/storage stack | **Cloudinary** (reuse, đã có) |
| Domain | `res.cloudinary.com/<cloud>/...` — native Cloudinary CDN |
| Rate limit 30/phút/user | **Đồng ý** |
| Video support v1.3? | **Defer v2** — chỉ image + PDF |
| Need DELETE endpoint? | **YES** — đã expose `DELETE /uploads/:id` |

### 23.9 Tích hợp ChatModule

ChatService `sendMessage` đã tự gọi `markAttached`. FE chỉ cần:
1. `POST /uploads` → nhận `{ url, type, name, size }`
2. `POST /conversations/:id/messages` với `attachments: [{ url, type, name, size }]`
3. BE tự link upload → message

> **Lưu ý FE**: nếu user chọn file rồi không gửi, **không gọi DELETE ngay** vẫn được — cron 24h sẽ dọn. Gọi DELETE chỉ khi muốn UX phản hồi tức thì.

---

> **Phiên bản tài liệu**: v1.36 — 2026-07-09 (Email mời đánh giá lúc 12h trưa ngày trả phòng). Mọi thay đổi schema/endpoint vui lòng cập nhật file này và thông báo team FE qua channel chung.
>
> **Lưu ý cho FE Web + Mobile**: trước khi wire bất kỳ endpoint nào, đọc:
> - **§2.3 + §2.4** — pattern auth chuẩn (tách login và profile)
> - **§2A — Phân quyền & Authorization** — quy tắc đầy đủ ai được vào endpoint nào, vì sao 401/403/404, business rules ngoài role
>
> 90% câu hỏi "tại sao lại bị 403" của FE đều trả lời được trong §2A.

---

## 24. Mobile Profile Endpoints (Support / Feedback / Data Export / Consents / Notification Prefs)

> Bổ sung 2026-06-06 cho team Mobile (iOS + Android). Tất cả yêu cầu Bearer token, trừ `/feedback` (vẫn cần auth, nhưng rate-limit 10/giờ/user).

### 24.1 Support Tickets — `/support/tickets`

**Enums**
- `category`: `account | payment | technical | other`
- `status`: `open | in_progress | resolved | closed`

#### POST `/support/tickets`
Body:
```json
{
  "subject": "Không đăng nhập được",
  "category": "account",
  "description": "Mô tả chi tiết tối thiểu 10 ký tự",
  "attachments": ["https://res.cloudinary.com/.../a.jpg"]
}
```
Validate: `subject ≥ 5`, `description ≥ 10`, `attachments ≤ 5 URLs`.
Response:
```json
{
  "success": true,
  "message": "Tạo yêu cầu hỗ trợ thành công",
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "code": "HT-482193",
    "subject": "...",
    "category": "account",
    "description": "...",
    "status": "open",
    "attachments": [],
    "createdAt": "2026-06-06T07:00:00.000Z",
    "updatedAt": "2026-06-06T07:00:00.000Z"
  }
}
```

#### GET `/support/tickets?status&page&limit`
Trả ticket của user hiện tại (ADMIN xem tất cả). Pagination Shape A:
```json
{ "items": [/* ticket */], "total": 12, "page": 1, "limit": 20, "totalPages": 1 }
```

#### GET `/support/tickets/:id`
Trả ticket + `messages[]` (sorted asc by createdAt). 403 nếu không phải owner / không phải ADMIN.

#### POST `/support/tickets/:id/reply`
Body: `{ "message": "...", "attachments"?: ["url"] }`
Tạo message mới. `fromAdmin=true` nếu caller là ADMIN. ADMIN reply trên ticket `open` → auto bump status sang `in_progress`.

---

### 24.2 Feedback — `POST /feedback`
Rate-limit: 10 requests/giờ/user.
Body:
```json
{
  "category": "bug",            // bug | feature | support | other
  "message": "Mô tả ≥ 10 ký tự",
  "contact": "user@example.com", // optional
  "deviceInfo": "iPhone 15 / iOS 18.0", // optional
  "attachments": ["https://..."]        // optional, ≤ 5 URLs
}
```
Response: `{ success, message, data: { id: "uuid" } }`

---

### 24.3 Data Export (GDPR) — `/users/me/data-export`

Item shape:
```json
{
  "id": "uuid",
  "status": "pending",          // pending | processing | ready | expired
  "requestedAt": "2026-06-06T07:00:00.000Z",
  "downloadUrl": null,
  "expiresAt": null
}
```

#### POST `/users/me/data-export`
Tạo yêu cầu mới. Nếu đã có yêu cầu pending/processing → trả lại yêu cầu cũ (không tạo mới).
Response: `{ success, message, data: <item> }`

#### GET `/users/me/data-export`
Trả danh sách yêu cầu của user, newest first. Nếu item ready quá `expiresAt` → auto-flip sang `expired` ngay tại response.
Response: `{ success, message, data: { items: [<item>] } }`

---

### 24.4 Consents — `/users/me/consents`

#### GET `/users/me/consents`
Tạo record mặc định nếu chưa có. Response:
```json
{
  "success": true,
  "message": "Lấy thông tin đồng ý thành công",
  "data": { "kyc": true, "marketing": false, "updatedAt": "2026-06-06T..." }
}
```

#### PUT `/users/me/consents`
Body: `{ "marketing": true }` (chỉ duy nhất field này).
> `kyc` là server-locked — ignore mọi nỗ lực sửa từ client.

Response giống GET.

---

### 24.5 Notification Preferences — `/users/me/notification-preferences`

Shape:
```json
{
  "booking": true,
  "payment": true,
  "system": true,
  "quietHours": false,
  "quietFrom": "22:00",   // HH:MM (24h)
  "quietTo": "07:00",
  "updatedAt": "2026-06-06T..."
}
```

#### GET `/users/me/notification-preferences`
Tạo record mặc định nếu chưa có. Trả shape ở trên.

#### PUT `/users/me/notification-preferences`
Body: tất cả fields đều optional (partial update). `quietFrom`/`quietTo` validate regex `^([01]\d|2[0-3]):[0-5]\d$`. Trả shape mới.

---

### 24.6 Confirmed Existing — Permissions

#### GET `/permissions/:userId` (ADMIN only)
Response:
```json
{
  "success": true,
  "message": "Permissions retrieved successfully",
  "data": {
    "user": { "id": "uuid", "name": "Nguyễn A", "role": 1 },
    "permissions": [
      { "module": "properties", "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false },
      { "module": "bookings",   "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false },
      { "module": "calendar",   "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false },
      { "module": "reviews",    "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false }
    ]
  }
}
```
Module whitelist: `properties | bookings | calendar | reviews`.

#### PUT `/permissions/:userId` (ADMIN only)
Body:
```json
{
  "permissions": [
    { "module": "properties", "canCreate": true, "canRead": true, "canUpdate": true, "canDelete": false },
    { "module": "bookings",   "canCreate": true, "canRead": true, "canUpdate": true, "canDelete": false }
  ]
}
```
Bulk upsert. Mỗi field CRUD optional (giữ giá trị cũ nếu không gửi). Response trả `{ userId, permissions: [...] }`.

---

## 25. FE Web Admin v2 — Bổ sung 2026-06-23

> Phản hồi cho danh sách 9 yêu cầu FE Web. Các endpoint đã live trên prod sau khi PR merge.

### 25.1 Bảng tóm tắt

| # | Endpoint | Status | Path thật | Ghi chú cho FE |
|---|---|---|---|---|
| 1 | `PATCH /auth/profile` | **NEW** | `PATCH /auth/profile` | Body whitelist 4 field (gồm `avatar` — v1.22) |
| 2 | `PATCH /admin/users/:id/role` | EXISTS | `PATCH /users/:id/role` | KHÔNG có prefix `/admin` — đổi URL |
| 3 | `GET /guests` | **NEW** | `GET /guests`, `GET /guests/:id` | Derive từ User role=CUSTOMER |
| 4 | `GET /subscriptions/me/invoices` | **NEW** | `GET /subscriptions/me/invoices` | Source: PaymentSession |
| 5 | `POST /admin/subscriptions/:id/call-log` | **NEW** | `POST + GET /admin/subscriptions/:id/call-log` | `:id` là userId của OWNER |
| 6 | `POST /calendar/bulk-lock` | EXISTS | `POST /calendar/bulk` | Body khác: `{ mode, items: [{propertyId, date}] }` |
| 7 | `GET /users?withStats=true` | EXPANDED | `GET /users?withStats=true` | Đã thêm `stats.disputeCount` + `lastActiveAt` |
| 8 | `GET /admin/disputes/:id` | EXPANDED | `GET /admin/disputes/:id` | Đã thêm `evidence`, `verdict`, `chatExcerpts`, `penalty` |
| 9 | `GET /admin/kyc/:id` | **NEW** | `GET /admin/kyc/:id` | Trả `verificationFields` (7 mục) |

### 25.2 #1 — `PATCH /auth/profile`

User tự sửa hồ sơ cá nhân. Whitelist 4 field. Không cho đổi role/password.

**Auth**: Bearer.

**Body** (tất cả optional, ít nhất 1 field):
```json
{ "fullName": "Nguyễn Văn A", "email": "new@example.com", "phone": "0901234567", "avatar": "https://res.cloudinary.com/.../avatars/abc.jpg" }
```

Validate:
- `fullName`: string ≥ 1 ký tự (BE map sang `User.name`)
- `email`: định dạng email
- `phone`: 10 số bắt đầu `0`
- `avatar`: URL **https** (≤ 1000 ký tự). FE upload ảnh trước qua `POST /uploads` (§23) → lấy URL trả về gửi vào đây. BE **không** nhận multipart trực tiếp ở endpoint này.

**Response 200**: shape giống `GET /auth/profile` (full ProfileDto, gồm `avatar`).

**Errors**:
- `409 users.phoneDuplicate` — phone đã được user khác dùng
- `409 auth.emailDuplicate` — email đã được user khác dùng

### 25.3 #3 — `GET /guests`, `GET /guests/:id`

Danh sách khách (User role=CUSTOMER) kèm aggregate booking + label.

**Auth**: Bearer. Roles: ADMIN, OWNER, SALE.

#### `GET /guests`

Query:
| Param | Mô tả |
|---|---|
| `q` | Search theo name / phone / email (max 100 ký tự) |
| `label` | `vip` \| `regular` \| `new` \| `restricted` |
| `page`, `limit` | Pagination Shape A. Default 1 / 20 |

**Label heuristic** (BE compute):
- `vip` — ≥ 5 booking COMPLETED
- `regular` — ≥ 2 booking COMPLETED
- `new` — < 2 booking COMPLETED, không bị ban
- `restricted` — `User.bannedAt != null`

> Khi filter `label=vip|regular|new` → BE post-filter sau khi count. Field `total` trong response sẽ là số kết quả thực tế sau filter (không phải tổng customer).

**Response**:
```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "uuid", "name": "...", "email": "...", "phone": "...", "avatar": null,
      "gender": null, "dateOfBirth": null,
      "bannedAt": null, "bannedReason": null,
      "createdAt": "...", "updatedAt": "...",
      "stats": { "totalBookings": 12, "completedBookings": 7, "cancelledBookings": 1 },
      "lastBookingAt": "2026-06-10T...",
      "label": "vip"
    }],
    "total": 124, "page": 1, "limit": 20, "totalPages": 7
  }
}
```

#### `GET /guests/:id`

Detail + 50 booking gần nhất. Thêm `recentBookings: [{ id, propertyId, checkinDate, checkoutDate, status, totalAmount, paidAmount, createdAt, property: { id, name, code } }]`.

**404** nếu user không tồn tại / không phải CUSTOMER.

### 25.4 #4 — `GET /subscriptions/me/invoices`

Lịch sử hoá đơn gói cước của user hiện tại.

**Auth**: Bearer. Roles: OWNER, SALE (SALE tự resolve theo `ownerId`).

**Source**: `PaymentSession` filter `kind ∈ {subscription, renew, upgrade, refund}`, newest first, không phân trang (volume nhỏ).

**Response**:
```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "uuid",
      "invoiceNumber": "INV-2026-0042",
      "kind": "renew",
      "planId": "rooms_5",
      "planLabel": "Starter · Tháng",
      "cycle": "monthly",
      "rooms": 5,
      "period": "2026-06",           // YYYY-MM của paidAt (hoặc createdAt nếu chưa paid)
      "amount": 658900,
      "method": "bank_transfer",
      "status": "paid",
      "provider": "manual_bank",
      "referenceCode": "FT26060512345678",
      "paidAt": "2026-06-05T03:14:00.000Z",
      "refundedAt": null,
      "refundedAmount": null,
      "expiresAt": "2026-06-06T03:14:00.000Z",
      "createdAt": "2026-06-05T03:00:00.000Z"
    }],
    "total": 8
  }
}
```

`400 users.saleNotAssigned` nếu SALE chưa được gán OWNER.

### 25.5 #5 — `POST/GET /admin/subscriptions/:id/call-log`

Admin ghi chú "đã gọi nhắc đóng tiền". `:id` là **userId của OWNER**.

**Auth**: Bearer. Roles: ADMIN.

#### `POST /admin/subscriptions/:id/call-log`

Body:
```json
{ "note": "Gọi 14:30, khách hứa CK chiều nay" }
```

`note`: 3–2000 ký tự.

Response: `{ id, userId, adminId, note, createdAt }`. Tự ghi audit log `subscription.call_log`.

#### `GET /admin/subscriptions/:id/call-log`

Newest first. Mỗi item kèm `admin: { id, name, email }` hydrated.

### 25.6 #6 — `POST /calendar/bulk` (path đổi)

Đã có sẵn. **FE đề xuất `POST /calendar/bulk-lock` không tồn tại** — dùng path `POST /calendar/bulk` với body BE đang nhận:

```json
{ "mode": "lock" | "unlock", "items": [{ "propertyId": "uuid", "date": "2026-06-15" }] }
```

Map từ shape FE đề xuất `{ propertyId, dates[], mode }`:
```ts
const body = { mode, items: dates.map(d => ({ propertyId, date: d })) };
```

Giới hạn 100 items/request.

### 25.7 #7 — `GET /users?withStats=true` (mở rộng)

Thêm 2 trường vào item khi có `withStats=true`:

```json
{
  "id": "...", "name": "...", "...": "...",
  "stats": {
    "propertyCount": 3,
    "bookingCount": 25,
    "disputeCount": 2     // ← mới: tổng dispute user là owner + customer
  },
  "lastActiveAt": "2026-06-22T08:14:00.000Z"   // ← mới: max(UserDevice.lastActiveAt), null nếu chưa từng login mobile
}
```

`lastActiveAt` tính từ `UserDevice.lastActiveAt` (FCM token register/refresh). User chỉ dùng web → `null` — sẽ bổ sung "last web login" sau khi có session tracking.

### 25.8 #8 — `GET /admin/disputes/:id` (mở rộng)

Thêm 4 trường:

```json
{
  "id": "uuid", "...": "...",
  "attachments": ["https://..."],
  "evidence": ["https://..."],          // alias của attachments
  "resolution": "Hoàn 50% deposit",
  "verdict": "Hoàn 50% deposit",        // alias của resolution
  "penalty": "refund",                   // null | warning | refund | ban_temp | ban_perm
  "chatExcerpts": [                      // 20 message gần nhất từ conversation booking-type, oldest first
    { "id": "uuid", "senderId": "uuid", "content": "...", "createdAt": "...", "isSystem": false }
  ],
  "property": { "id", "name", "code" },
  "booking": { ... },
  "owner": { ... },
  "customer": { ... }
}
```

#### `POST /admin/disputes/:id/resolve` — thêm field `penalty`

Body:
```json
{
  "resolution": "Hoàn 50% deposit",
  "refundAmount": 250000,
  "penalty": "refund"                    // ← mới, optional, enum
}
```

Penalty enum: `none | warning | refund | ban_temp | ban_perm`. Lưu vào `Dispute.penalty`. Không tự động ban user — admin gọi `POST /users/:id/ban` riêng nếu chọn `ban_*`.

### 25.9 #9 — `GET /admin/kyc/:id`

Endpoint **mới**. Trả full submission + 7 mục xác minh boolean.

**Auth**: Bearer. Roles: ADMIN.

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "user": { "id", "name", "email", "phone", "avatar", "role", "kycBypass", "kycStatus", "createdAt" },
    "status": "awaiting_approval",
    "statusLabel": "awaitingApproval",
    "rejectReason": null,
    "rejectedItems": [],
    "approvedAt": null,
    "approvedById": null,
    "trialEndsAt": null,
    "chargeStartsAt": null,
    "expectedRooms": 5,
    "uploads": {
      "cccdFront": { "id", "imageUrl", "imageUrlThumb", "ocrResult", "ocrConfidence", "faceMatchScore", "livenessScore", "provider", "uploadedAt" } | null,
      "cccdBack":  { ... } | null,
      "selfie":    { ... } | null
    },
    "payments": [{ "id", "planId", "cycle", "rooms", "totalAmount", "method", "status", "paidAt" }],
    "verificationFields": [
      { "key": "cccdFrontUploaded",       "label": "Đã tải ảnh CCCD mặt trước",          "passed": true },
      { "key": "cccdBackUploaded",        "label": "Đã tải ảnh CCCD mặt sau",            "passed": true },
      { "key": "selfieUploaded",          "label": "Đã tải ảnh selfie",                  "passed": true },
      { "key": "ocrConfidenceOk",         "label": "OCR đạt ngưỡng 0.8",                 "passed": true,  "source": "front=0.91, back=0.88" },
      { "key": "faceMatchOk",             "label": "Selfie khớp ảnh CCCD ≥ 0.7",          "passed": true,  "source": "score=0.82" },
      { "key": "livenessOk",              "label": "Liveness selfie ≥ 0.7",              "passed": false, "source": "score=null" },
      { "key": "documentMetadataPresent", "label": "OCR đọc được ngày hết hạn + địa chỉ", "passed": true,  "source": "expire=true, address=true" }
    ],
    "verificationPassedCount": 6,
    "verificationTotalCount": 7,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**7 mục** đều derive từ data có sẵn (`KycUpload.ocrResult/ocrConfidence/faceMatchScore/livenessScore`). Threshold hard-coded:
- OCR ≥ 0.8 (front & back đều phải đạt)
- Face match ≥ 0.7
- Liveness ≥ 0.7

FE hiển thị checklist 7 mục + badge `passedCount/totalCount`.

### 25.10 Schema migration

Migration `20260623091337_dispute_penalty_call_log` đã apply lên prod DB:
- Thêm column `disputes.penalty TEXT NULL`
- Thêm table `subscription_call_logs (id, userId, adminId, note TEXT, createdAt)` + index `(userId, createdAt DESC)`

Không touch booking/payment/user table (rủi ro thấp).

---

## 26. System SALE — Admin-grade SALE (v1.15 · 2026-06-26)

> SALE của hệ thống: ADMIN tạo SALE với quyền gần ADMIN, cấu hình per-module qua bảng `user_permissions`. Khác với SALE thuộc OWNER (hiện hữu).

### 26.1 Hai loại SALE

Cùng `role=2` (SALE) nhưng phân biệt bằng cột mới **`User.scope`**:

| `scope` | Ý nghĩa | `ownerId` | Cách tạo | Data scope | Default permissions |
|---|---|---|---|---|---|
| `"owner"` (default) | SALE thuộc 1 OWNER (legacy) | OWNER id | OWNER invite qua `POST /staff/invites` | Chỉ data của OWNER mình | 4 module owner-scope, `canRead=true` (xem §12) |
| `"system"` | SALE hệ thống (admin-grade) | `null` | ADMIN invite qua `POST /admin/system-staff/invites` HOẶC tạo trực tiếp `POST /users { role: 2, scope: "system" }` | Toàn hệ thống (như ADMIN, `getEffectiveOwnerId → null`) | **Không có gì** — ADMIN phải cấp tường minh qua `PUT /permissions/:userId` |

User mới đăng ký Google/Apple/password đều mặc định `scope="owner"`. System SALE chỉ được tạo qua ADMIN, không tự sign-up.

### 26.2 Permission modules — mở rộng

Bảng `user_permissions` giờ chấp nhận thêm **admin-scope modules** (chỉ áp dụng cho `scope=system`):

#### Owner-scope (legacy, áp dụng cho SALE thuộc OWNER)

| module | Endpoint mẫu | Default cho SALE owner |
|---|---|---|
| `properties` | `/properties` CRUD | `canRead=true` |
| `bookings` | `/bookings` CRUD | `canRead=true, canCreate=true, canUpdate=true` |
| `calendar` | `/calendar/*` | CRUD đầy đủ |
| `reviews` | `/properties/:id/reviews/:reviewId/reply` | `canRead=true, canUpdate=true` |

#### Admin-scope (system SALE, default ALL false — phải cấp tường minh)

| module | Endpoint mẫu | Action mapping |
|---|---|---|
| `users` | `/users` CRUD, `/users/:id/ban|unban|reset-password|...`, `/permissions/:userId`, `/admin/system-staff/*` | GET=`canRead`, POST tạo=`canCreate`, ban/unban/reset/role/kyc-bypass/revoke=`canUpdate`, DELETE=`canDelete` |
| `kyc` | `/admin/kyc/queue|count-pending|:id`, `submissions/:id/approve|reject` | `canRead` list/detail, `canUpdate` approve/reject |
| `subscriptions` | `/admin/subscriptions`, `/admin/users/:id/subscription/*`, `/admin/subscriptions/:id/call-log` | `canRead` list, `canUpdate` mark-paid/freeze/unfreeze/price/grant-trial, `canCreate` call-log, `canDelete` `DELETE trial` |
| `payments` | `/admin/payments/*` | `canRead`, `canUpdate` (mark-paid) |
| `disputes` | `/admin/disputes/*` | `canRead`, `canUpdate` (investigate/resolve/reject) |
| `reviewsModeration` | `/admin/reviews/*` | `canRead`, `canUpdate` (restore), `canDelete` (hide) |
| `propertiesModeration` | `/properties/:id/approve|reject|suspend|hot` | `canUpdate` cho mọi action |
| `audit` | `/admin/audit-log` | `canRead` |
| `leads` | (reserved cho admin view lead toàn hệ thống) | `canRead` |
| `support` | (reserved cho admin ticket reply) | `canRead`, `canUpdate` |
| `emails` | `/admin/emails/templates`, `/admin/emails/test` | `canRead`, `canCreate` (test send) |
| `billing` | `/admin/billing-plans` CRUD | CRUD đầy đủ |
| `appVersion` | `POST /admin/app-version` | `canUpdate` |
| `dashboard` | `/admin/reports/risk-kpis` | `canRead` |

> **ADMIN bypass toàn bộ permission check** — luôn pass dù bảng `user_permissions` trống.
> **OWNER + CUSTOMER** chỉ pass owner-scope module; admin-scope module luôn deny.

### 26.3 Endpoint mới — Quản lý System SALE

Base path: `/admin/system-staff`. Roles: `ADMIN` HOẶC `SALE scope=system` (với permission tương ứng trên module `users`).

| Method | Path | Permission yêu cầu | Body / Query | Mô tả |
|---|---|---|---|---|
| `POST` | `/admin/system-staff/invites` | `users.canCreate` | `{ email }` | Tạo invite SALE hệ thống. Reuse bảng `staff_invites` với `scope=system`, `ownerId=adminId` (inviter). TTL 7 ngày. Gửi email + trả `inviteLink` + `shortCode HL-XXXXXX`. |
| `GET` | `/admin/system-staff/invites?status=` | `users.canRead` | `?status=pending\|accepted\|expired\|cancelled\|all` | List invite system, default all status. |
| `DELETE` | `/admin/system-staff/invites/:id` | `users.canUpdate` | — | Huỷ invite đang pending. 400 nếu không phải scope=system hoặc đã accept. |
| `GET` | `/admin/system-staff?isActive=` | `users.canRead` | `?isActive=true\|false\|all` | List system SALE, hydrate `permissions[]` per user. |
| `DELETE` | `/admin/system-staff/:userId` | `users.canDelete` | — | Soft-disable system SALE (`isActive=false`, clear `refreshToken` + xoá device tokens). |

#### Verify + Accept dùng chung với owner invite

Endpoint `GET /staff/invites/verify/:token` và `POST /staff/invites/accept` đã có sẵn, **giờ trả thêm field `scope`** trong verify response để FE biết loại invite:

```json
{
  "success": true,
  "data": {
    "email": "ops@halong24h.com",
    "scope": "system",
    "owner": { "name": "Halong24h Admin", "avatar": null, "homestayName": null },
    "expiresAt": "...",
    "status": "pending"
  }
}
```

Khi accept thành công:
- `scope=owner` → tạo user `role=SALE, scope=owner, ownerId=invite.ownerId`. BE seed 4 row `user_permissions` default cho owner-scope modules.
- `scope=system` → tạo user `role=SALE, scope=system, ownerId=null`. BE **KHÔNG seed** permission gì — ADMIN tự cấp qua `PUT /permissions/:userId`.

FCM push khi system invite được accept: `pushType=system_staff_invite_accepted`, deepLink `/admin/system-staff`.

#### 26.3.2 `GET /users?scope=` — Lọc theo SALE scope (server-side)

`GET /users` đã hỗ trợ thêm query `scope` để FE Web không phải lọc client-side.

| `scope` | Hành vi |
|---|---|
| `owner` | Chỉ SALE thuộc OWNER (`role=SALE && scope='owner'`). BE tự ép `role=2`. |
| `system` | Chỉ SALE hệ thống (`role=SALE && scope='system'`). BE tự ép `role=2`. |
| `all` hoặc bỏ qua | Không lọc theo scope. |
| Giá trị khác | **400** `systemSale.scopeInvalid`. |

Có thể kết hợp với `role`, `q`, `withStats`. Nếu truyền `role=1&scope=system` → nghịch logic (OWNER không có scope=system), BE giữ điều kiện `role=SALE` của filter scope → kết quả rỗng (đúng semantic).

Ví dụ:

```
GET /users?scope=system&withStats=true&q=ops
GET /users?scope=owner&role=2
GET /users?scope=all   # = GET /users (không lọc)
```

Auth: ADMIN hoặc system SALE có `users.canRead` (không đổi so với endpoint gốc).

### 26.4 `POST /users` — Tạo user kèm scope

ADMIN có thể tạo trực tiếp system SALE không cần qua invite:

```json
{
  "name": "Ops Manager",
  "email": "ops@halong24h.com",
  "phone": "0900000000",
  "password": "Strong@123",
  "role": 2,
  "scope": "system"
}
```

Validate:
- `scope` chỉ chấp nhận `"owner"` hoặc `"system"`. Sai → 400 `systemSale.scopeInvalid`.
- `scope=system` + `role≠2` → 400 (system chỉ áp dụng cho SALE).
- `scope=system` + caller không phải ADMIN → 403 `systemSale.onlyAdminCreate`.

Response thêm field `scope` cho mọi user shape (`GET /auth/profile`, `GET /users`, `GET /users/:id`).

### 26.5 `PUT /permissions/:userId` — Cấp quyền System SALE

Endpoint cũ vẫn dùng. Mở rộng:
- Target user phải có `role=SALE`. Truyền userId khác → 400 `permissions.onlyForSale`.
- Target `scope=owner` → chỉ chấp nhận 4 owner-scope modules. Truyền admin-scope module → 400 `permissions.invalidModule(mod)`.
- Target `scope=system` → chấp nhận tất cả modules (owner + admin scope).
- Default khi tạo row mới cho admin-scope module: `canRead = false` (phải cấp tường minh). Owner-scope module giữ default `canRead = true`.

**Body example cho system SALE**:
```json
{
  "permissions": [
    { "module": "users",                 "canCreate": true, "canRead": true, "canUpdate": true, "canDelete": false },
    { "module": "kyc",                   "canRead": true, "canUpdate": true },
    { "module": "subscriptions",         "canRead": true, "canUpdate": true, "canCreate": true },
    { "module": "payments",              "canRead": true, "canUpdate": true },
    { "module": "disputes",              "canRead": true, "canUpdate": true },
    { "module": "reviewsModeration",     "canRead": true, "canUpdate": true, "canDelete": true },
    { "module": "propertiesModeration",  "canRead": true, "canUpdate": true },
    { "module": "audit",                 "canRead": true },
    { "module": "emails",                "canRead": true, "canCreate": true },
    { "module": "billing",               "canRead": true, "canCreate": true, "canUpdate": true, "canDelete": true },
    { "module": "appVersion",            "canUpdate": true },
    { "module": "dashboard",             "canRead": true }
  ]
}
```

Response `GET /permissions/:userId` trả về tất cả module (cả những module chưa có row, dùng default), kèm `user.scope` để FE biết hiển thị form owner-scope hay full admin-scope:

```json
{
  "data": {
    "user": { "id": "uuid", "name": "Ops Manager", "role": 2, "scope": "system" },
    "permissions": [ /* 18 entries: 4 owner-scope + 14 admin-scope */ ]
  }
}
```

### 26.6 Authorization guard — hành vi mới

Bổ sung cho §2A.1:

```
JwtAuthGuard          → user object kèm field `scope` (string)
RolesGuard            → user.role phải có trong whitelist @Roles(...)
PermissionGuard       → endpoint có @Permission(module, action) → check user_permissions
```

`PermissionGuard.hasPermission(userId, role, module, action)` logic mới:
- ADMIN → allow (bypass)
- OWNER → allow nếu module thuộc owner-scope; deny nếu admin-scope
- CUSTOMER → allow nếu module thuộc owner-scope; deny nếu admin-scope
- SALE:
  - Resolve `scope` từ DB (1 query mỗi request).
  - Owner SALE truy cập admin-scope module → deny (luôn 403).
  - Owner SALE truy cập owner-scope module: `canRead = true` default; CRUD khác phải có row `user_permissions`.
  - System SALE: phải có row `user_permissions` với action=true cho **mọi** module (kể cả `canRead`). Không có row → deny.

Endpoint admin (vd `/admin/disputes`, `/users`, `/admin/kyc/queue`) giờ có 2 decorator:

```ts
@Roles(ROLE.ADMIN, ROLE.SALE)
@Permission(PERMISSION_MODULE.DISPUTES, 'canRead')
```

- SALE owner → pass `@Roles`, fail `@Permission` (admin-scope) → 403.
- SALE system có `disputes.canRead=true` → pass cả 2 → vào được.
- ADMIN → pass cả 2 (bypass permission).

### 26.7 Chống leo quyền (privilege escalation)

System SALE có thể có `users.canUpdate / canDelete` nhưng **không được tác động lên ADMIN user**:

| Action | Block khi caller không phải ADMIN |
|---|---|
| `POST /users/:id/ban` với target ADMIN | 403 `common.forbidden` |
| `POST /users/:id/unban` với target ADMIN | 403 `common.forbidden` |
| `PATCH /users/:id/role` với target ADMIN hoặc `newRole=ADMIN` | 403 `common.forbidden` |

System SALE cũng **không tự tạo system SALE khác** qua `POST /users` (chỉ ADMIN). Riêng `POST /admin/system-staff/invites` thì system SALE có `users.canCreate` vẫn tạo được — đây là trade-off vì luồng invite an toàn hơn (cần email + accept).

### 26.8 Schema migration — `20260626053013_add_user_scope`

```sql
ALTER TABLE "staff_invites" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE "users"         ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'owner';
```

Additive, non-destructive. Mọi user/invite hiện hữu giữ `scope='owner'` (legacy behavior).

### 26.9 FE migration checklist

#### Web Admin

- [ ] Trang `/admin/users` — thêm filter `scope=owner|system|all`, badge "Hệ thống" cho row có `scope=system`. **Server-side đã hỗ trợ** `GET /users?scope=owner|system|all` (xem §26.3.2) — gỡ logic lọc client-side.
- [ ] Form tạo user role=SALE — thêm select `scope` (Admin-only thấy option "system").
- [ ] Trang mới `/admin/system-staff` — list system SALE + permissions per user.
- [ ] Trang mới `/admin/system-staff/invites` — danh sách invite + nút tạo + huỷ.
- [ ] Modal cấp quyền — render dynamic 4 modules (owner-scope) hoặc 18 modules (system-scope) tuỳ `user.scope` trả về từ `GET /permissions/:userId`.
- [ ] Hiển thị badge "SALE hệ thống" thay vì "Nhân viên của OWNER" trong header.
- [ ] System SALE login → ẩn các UI sub plan / KYC (không áp dụng cho system).

#### Mobile (nếu có app cho system SALE)

- [ ] `GET /auth/profile` đã trả thêm `scope` — lưu trong state.
- [ ] Nếu `role=2 && scope=system` → render UI admin-grade thay vì UI staff thường.
- [ ] Mọi endpoint `/admin/*` giờ chấp nhận token system SALE có permission tương ứng.

#### Cả hai

- [ ] Phân biệt 401 (token sai) vs 403 (thiếu permission). System SALE bị 403 trên endpoint admin → kiểm tra `PUT /permissions/:userId` đã cấp đủ chưa.
- [ ] Endpoint accept invite (`/staff/invites/verify/:token`) giờ trả `scope` — FE hiển thị UI khác cho 2 loại invite.

### 26.10 Quick start cho ADMIN

```bash
# 1. Tạo system SALE bằng POST /users (admin chủ động, set password ngay)
curl -X POST https://api.halong24h.com/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ops Manager",
    "email": "ops@halong24h.com",
    "password": "TempPass@123",
    "role": 2,
    "scope": "system"
  }'

# 2. Cấp quyền — ví dụ toàn quyền KYC + Subscription + Disputes
curl -X PUT https://api.halong24h.com/permissions/<new-user-id> \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": [
      { "module": "kyc",           "canRead": true, "canUpdate": true },
      { "module": "subscriptions", "canRead": true, "canUpdate": true, "canCreate": true },
      { "module": "disputes",      "canRead": true, "canUpdate": true }
    ]
  }'

# 3. Hoặc dùng invite flow (gửi email cho user tự set password)
curl -X POST https://api.halong24h.com/admin/system-staff/invites \
  -H "Authorization: Bearer <admin-token>" \
  -d '{ "email": "ops@halong24h.com" }'
# → email được gửi, user click link → POST /staff/invites/accept
# → SALE scope=system được tạo, ADMIN cấp permissions sau
```

### 26.11 System SALE xem toàn bộ phòng — tái dùng `GET /properties`

System SALE **không có endpoint riêng** để list toàn bộ property hệ thống. Tái dùng `GET /properties`:

- Endpoint `GET /properties` đã gắn `@Roles(ADMIN, OWNER, SALE) + @Permission(properties, canRead)`.
- ADMIN cấp `properties.canRead=true` cho system SALE qua `PUT /permissions/:userId`.
- Service `findAll` tự gọi `getEffectiveOwnerId(user)` → `null` cho system SALE (vì `isSystemSale(user) === true`) → **không filter `ownerId`** → SALE thấy hết property toàn hệ thống y như ADMIN.

> Phân biệt: SALE owner-scope mặc định có `canRead=true` nhưng `getEffectiveOwnerId` trả về `user.ownerId` → chỉ thấy property của OWNER mình. System SALE phải được ADMIN cấp tường minh, sau đó thấy hết.

Ví dụ cấp toàn quyền view property + booking + calendar cho system SALE:

```bash
curl -X PUT https://api.halong24h.com/permissions/<system-sale-id> \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "permissions": [
      { "module": "properties", "canRead": true },
      { "module": "bookings",   "canRead": true },
      { "module": "calendar",   "canRead": true }
    ]
  }'
```

### 26.12 Changelog

- **2026-06-26 (v1.15)** — Thêm system SALE: `User.scope` + `StaffInvite.scope`, mở rộng `user_permissions` thêm 14 admin-scope modules, mới module `/admin/system-staff/*`, sweep mọi admin controller chấp nhận thêm SALE (kèm `@Permission`), thêm guard chống leo quyền target ADMIN.
- **2026-06-27 (v1.16.1)** — Document §26.11: system SALE tái dùng `GET /properties` (chỉ cần ADMIN cấp `properties.canRead`). Thêm public endpoint `GET /properties/public/by-owner/:ownerId` (§4.13) — chủ nhà share link Zalo, SALE click không cần đăng nhập.
- **2026-06-29 (v1.16.2)** — **Fix visibility leak**: 4 public endpoint (`GET /properties/public`, `GET /properties/search`, `GET /properties/public/:slug`, `GET /properties/share/:id`) bị drift khỏi spec — chỉ filter `isActive + deletedAt`, để lọt property `moderationStatus IN ('pending','rejected','suspended')` ra web khách hàng. Đã enforce filter `moderationStatus='approved'` (§4.1, §4.7, §4.11). Slug/id property chưa duyệt → **404**. FE web khách hàng không phải đổi gì; FE web quản lý dùng `GET /properties?includeInactive=true` + 3 endpoint `POST /properties/:id/{approve,reject,suspend}` (§4.4) để dựng UI duyệt cơ sở.
- **2026-06-29 (v1.16.3)** — **Thêm `?moderationStatus` cho `GET /properties`** (§4.2): query server-side `pending | approved | rejected | suspended` để admin FE list theo tab gọn hơn (thay vì lấy hết `includeInactive=true` rồi lọc client-side). Bổ sung `isHot`, `ratingAvg`, `reviewCount` vào sample JSON §4.5 (response thực tế đã có sẵn — Prisma `include` tự trả mọi scalar field). FE web quản lý đọc `isHot` từ list/detail để hiển thị toggle Hot, không cần gọi endpoint riêng.
- **2026-06-29 (v1.16.4)** — **Chốt business rule: GIỮ auto-approve khi tạo property + sweep legacy `pending`**. Sau v1.16.2 fix visibility leak, property legacy `moderationStatus='pending'` (tạo thời code cũ trước v1.9) bị filter ẩn khỏi mọi public endpoint, bao gồm `/properties/public/by-owner/:ownerId`. Migration `20260629104500_legacy_pending_approve_sweep` đã apply prod: UPDATE mọi property `pending` của OWNER active + KYC approved (hoặc `kycBypass`) → `approved + moderationReviewedAt=NOW()`. Property của OWNER bị banned/inactive hoặc chưa KYC giữ nguyên `pending`. Property `rejected`/`suspended` không động vào. **Tác động FE**: (1) `/properties/public/by-owner/:ownerId` giờ trả đủ danh sách phòng của OWNER cho use case Zalo. (2) Admin FE web quản lý: tab "Chờ duyệt" về cơ bản sẽ trống vì auto-approve khi tạo. Có thể giữ tab cho legacy edge case (property của owner chưa KYC bị stuck pending) nhưng nếu UI rỗng là bình thường. Tab "Đã duyệt / Từ chối / Tạm ngưng" mới là tab chính dùng. (3) FE web khách hàng KHÔNG đổi gì — visibility rule §4.1 vẫn enforce `approved`.
- **2026-06-29 (v1.16.5)** — **Owner-level entitlement filter cho 6 public endpoint**. Trước đây visibility rule chỉ check property-level (`isActive + deletedAt + moderationStatus`). Nếu OWNER hết trial / bị admin freeze subscription / KYC bị thu hồi / bị banned sau khi đã tạo phòng → phòng vẫn lộ ra customer web (lỗi nghiệp vụ — owner không còn quyền dùng platform mà vẫn nhận khách qua đó). v1.16.5 bổ sung **owner-level filter** mirror đúng entitlement gate lúc tạo phòng (xem helper `ownerVisibleFilter` trong [properties.service.ts](src/modules/properties/properties.service.ts)): owner phải `isActive + bannedAt=null + deletedAt=null` **VÀ** (`kycBypass=true` HOẶC (`kycStatus='approved'` AND subscription entitled)). Áp dụng cho cả 6 endpoint public: `/properties/public`, `/properties/search`, `/properties/public/:slug`, `/properties/public/:slug/similar`, `/properties/public/by-owner/:ownerId`, `/properties/share/:id`. **Tác động FE**: web khách hàng và link Zalo tự động ẩn phòng của owner không còn quyền — không cần FE check thêm. Khi owner mark-paid trở lại → phòng tự xuất hiện ngay (không cần re-index, filter là live query). Slug/ownerId không thoả entitlement → **404 NotFound** (giống behaviour của moderationStatus filter — không leak trạng thái).

---

## 27. Du thuyền (Yachts) — v1.40 · 2026-07-13

Module du thuyền là thực thể **của hệ thống** (không thuộc OWNER). Khách xem công khai + đặt; sau khi đặt có thể nhắn tin với hệ thống; ADMIN + SALE hệ thống xác nhận → khách thanh toán FULL → hệ thống gửi **mã code** + thông tin qua email.

> **Loại tour (v1.40.2)**: du thuyền bán **tour TRONG NGÀY** — tour tham quan vịnh (ban ngày) và tour ăn tối & ngắm pháo hoa (buổi tối) — **KHÔNG qua đêm**. Mỗi tour = 1 sản phẩm (1 record `Yacht`) với `durationText` mô tả (vd "Tour trong ngày · 6–8 giờ" / "Tour buổi tối · 3–4 giờ"), `checkInTime`/`checkOutTime` = giờ đón/trả khách. Đặt tour chỉ cần **1 ngày** (xem §27.3: `checkoutDate` optional).

### 27.1 Phân quyền

| Thao tác | Ai được phép |
|----------|--------------|
| Xem danh sách/chi tiết/lịch công khai | Tất cả (không cần auth) |
| Tạo / sửa / xoá / set giá / ảnh du thuyền | **CHỈ ADMIN + SALE hệ thống** (`scope=system`) |
| Khách đặt du thuyền, xem đơn của mình, huỷ đơn PENDING | CUSTOMER (mọi user auth) |
| Staff tạo đơn hộ, xem tất cả đơn, xác nhận, ghi nhận thanh toán | **ADMIN + SALE hệ thống** |
| Đọc/trả lời toàn bộ tin nhắn khách ↔ hệ thống | **ADMIN + SALE hệ thống** |

> Guard: route write dùng `@Roles(ADMIN, SALE)`; service assert `isAdminOrSystemSale(user)` → SALE owner-scope bị **403** `yachts.forbidden`. Không cần cấp `@Permission` lẻ — MỌI SALE hệ thống đều thao tác được.

### 27.2 Yacht endpoints

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/yachts/public` | Public | List công khai (paginated). Query: `page,limit,q,minPrice,maxPrice,sort(price_asc\|price_desc\|newest)` |
| GET | `/yachts/public/:slug` | Public | Chi tiết theo slug (full data + itinerary + ảnh) |
| GET | `/yachts/public/:id/calendar?year=&month=` | Public | Lịch theo tháng — `days[]` mỗi ngày `{ date, status(available\|locked\|hold\|booked), price, childPrice, priceType(weekday\|weekend\|holiday), bookingId, note }`. `price` = giá NGƯỜI LỚN/khách theo ngày, `childPrice` = giá TRẺ EM/khách (null = miễn phí) — FE hiển thị giá trên từng ô lịch |
| GET | `/yachts?includeInactive=&page=&limit=` | ADMIN+SALE hệ thống | List quản trị |
| GET | `/yachts/:id` | ADMIN+SALE hệ thống | Chi tiết quản trị |
| POST | `/yachts` | ADMIN+SALE hệ thống | Tạo du thuyền |
| PUT | `/yachts/:id` | ADMIN+SALE hệ thống | Cập nhật (partial, kèm `isActive`) |
| DELETE | `/yachts/:id` | ADMIN+SALE hệ thống | Xoá mềm |
| PUT | `/yachts/:id/prices` | ADMIN+SALE hệ thống | Set giá (5 field bắt buộc) |
| POST | `/yachts/:id/images` | ADMIN+SALE hệ thống | Upload ảnh (multipart, field `images`, ≤20 ảnh/lần) |
| DELETE | `/yachts/:id/images/:imageId` | ADMIN+SALE hệ thống | Xoá ảnh |
| PATCH | `/yachts/:id/images/:imageId/cover` | ADMIN+SALE hệ thống | Đặt ảnh bìa |

**CreateYachtDto** (POST/PUT): `name*`, `code*` (unique, không đổi được sau tạo), `description?`, `cabins?`, `maxGuests?`, `lengthMeters?`, `shipType?`, `departurePoint?`, `durationText?`, `itinerary?` (mảng `{ order, title, time?, description? }`), `amenities?[]`, `services?[]`, `rules?`, `cancellationPolicy?(0\|1\|2)`, `checkInTime?`, `checkOutTime?` (= giờ đón/trả), **giá NGƯỜI LỚN/khách**: `weekdayPrice?`/`weekendPrice?`/`holidayPrice?`, **giá TRẺ EM/khách**: `weekdayChildPrice?`/`weekendChildPrice?`/`holidayChildPrice?`. `slug` do BE tự sinh từ `name+code`.

**Giá — BÁN THEO ĐẦU NGƯỜI (v1.40.3)**, giá người lớn và trẻ em **RIÊNG**:
- Mỗi ngày chọn holiday > weekend (T6/T7/CN) > weekday cho cả 2 bảng giá.
- `totalAmount = adults × giá NGƯỜI LỚN(ngày đi) + children × giá TRẺ EM(ngày đi)`. **KHÔNG** nhân số đêm (tour trong ngày).
- Chưa cấu hình giá người lớn (`weekdayPrice=null`) → `totalAmount = null`. Chưa cấu hình giá trẻ em → **trẻ em tính 0đ (miễn phí)**.
- `PUT /yachts/:id/prices`: 3 giá người lớn **bắt buộc**, 3 giá trẻ em **tuỳ chọn** (bỏ trống → miễn phí).

### 27.3 Yacht Booking — vòng đời

`status`: `0=PENDING · 1=CONFIRMED · 2=PAID · 3=COMPLETED · 4=CANCELLED`

```
Khách đặt (PENDING) ──> ADMIN/SALE hệ thống confirm (CONFIRMED, sinh VietQR)
   ──> khách CK FULL ──> ADMIN/SALE mark paid (PAID) ──> gửi mã code + email
```

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| POST | `/yacht-bookings/customer` | CUSTOMER | Khách đặt → tạo đơn PENDING + mở kênh nhắn tin |
| GET | `/yacht-bookings/my?page=&limit=` | CUSTOMER | Đơn của khách hiện tại |
| POST | `/yacht-bookings` | ADMIN+SALE hệ thống | Staff đặt hộ (có thể truyền `customerId`) |
| GET | `/yacht-bookings?status=&page=&limit=` | ADMIN+SALE hệ thống | Toàn bộ đơn |
| GET | `/yacht-bookings/:id` | Chủ đơn hoặc ADMIN+SALE hệ thống | Chi tiết đơn (kèm `yacht` + itinerary) |
| PATCH | `/yacht-bookings/:id/confirm` | ADMIN+SALE hệ thống | PENDING→CONFIRMED, trả `data.payment` (VietQR + STK) |
| PATCH | `/yacht-bookings/:id/paid` | ADMIN+SALE hệ thống | CONFIRMED→PAID, gửi email mã code. Body `{ amount? }` (bỏ trống = totalAmount) |
| PATCH | `/yacht-bookings/:id/cancel` | Staff (đơn chưa thanh toán) / khách (đơn PENDING của mình) | Body `{ reason? }` |

**CreateYachtBookingDto**: `yachtId*`, `checkinDate*` (YYYY-MM-DD — ngày đi tour), `checkoutDate?` (**BỎ TRỐNG cho tour trong ngày** → BE tự lấy = `checkinDate`), `adults*`, `children?`, `customerName?`, `customerPhone?`, `customerEmail?`, `notes?`, `customerId?` (chỉ staff). Khách tự đặt: contact fallback từ profile. Tour trong ngày cho phép **nhiều đơn cùng 1 ngày** (không chặn lịch như thuê nguyên tàu).

**Booking response** (`data`): `id, code(YC-XXXXXXXX), yachtId, yachtName, status, adults, children, guestCount, checkinDate, checkoutDate, totalAmount, paidAmount, remainingAmount, paidAt, confirmedAt, customerName/Phone/Email, notes, createdAt` + **field đánh giá**: `hasReview(boolean)`, `reviewUnlockAt(ISO — mốc mở đánh giá = checkout + 12h trưa VN)`, `canReview(boolean — đã thanh toán/hoàn tất + đã qua mốc + chưa đánh giá)`. `PATCH /confirm` thêm `payment: { bankBin, bankName, accountNumber, accountName, amount, content, qrCode }`. **`GET /yacht-bookings/:id` (chi tiết) cũng trả `payment` cho KHÁCH khi đơn `CONFIRMED` + chưa thanh toán (`paidAt=null` + `totalAmount>0`)** → FE khách render QR/số TK để chuyển khoản FULL; `payment=null` ở các trạng thái khác. Mark-paid thêm `bookingCode`.

`payment.qrCode` = chuỗi EMV VietQR → render QR client-side (không phải URL ảnh). `payment.content` = nội dung CK (mã đơn bỏ dấu gạch). `payment.amount` = số tiền FULL (= `totalAmount`). STK là STK nền tảng (admin cấu hình §10.7).

Cron **mỗi giờ** tự chuyển đơn `PAID → COMPLETED` sau khi qua 12h trưa ngày kết thúc hành trình.

**Mã code**: derive `YC-` + 8 hex đầu của UUID (không lưu cột riêng). Là nội dung CK + mã gửi email khách khi PAID (email template `yacht_booking_confirmed`).

**Thanh toán FULL**: chuyển khoản thủ công qua **VietQR động** sinh từ STK nền tảng (`payment_bank_account` singleton, fallback ENV `BANK_*`). Không tích hợp cổng online. ADMIN/SALE bấm mark-paid để ghi nhận.

### 27.4 Nhắn tin khách ↔ hệ thống

Tái dùng hệ chat sẵn có với `Conversation.type='yacht'`, `bookingId = YachtBooking.id`. Khi khách đặt (có tài khoản) → BE tạo hội thoại + 1 tin nhắn hệ thống chào. Các mốc confirm/paid/cancel cũng post tin hệ thống (`isSystem=true`).

- Khách dùng lại endpoint chat chuẩn: `POST /conversations {type:'yacht', bookingId}` (idempotent), `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, WebSocket `/chat`.
- **ADMIN + SALE hệ thống** đọc/trả lời mọi hội thoại du thuyền dù không phải member (bypass theo role/scope; chỉ áp dụng type `yacht`/`support`, không đụng chat booking homestay).
- **`GET /conversations/yacht?customerId=&page=&limit=`** (ADMIN + SALE hệ thống): liệt kê toàn bộ hội thoại du thuyền, lọc `customerId` để xem "toàn bộ tin nhắn của 1 khách với hệ thống".

> Lưu ý real-time: ADMIN/SALE hệ thống không phải member nên không nhận WS push của hội thoại yacht — họ dùng endpoint list + `GET /conversations/:id/messages` để theo dõi. Khách vẫn nhận real-time bình thường.

### 27.5 Đánh giá du thuyền (Reviews)

Khách đánh giá **sau khi qua ngày kết thúc hành trình** (đơn `PAID`/`COMPLETED` + đã qua **12h trưa VN ngày `checkoutDate`** + chưa đánh giá). 6 tiêu chí 1-5 **giống hệt PropertyReview** → FE tái dùng component đánh giá homestay.

| Method | Endpoint | Auth | Mô tả |
|--------|----------|------|-------|
| GET | `/yachts/:id/reviews?page=&pageSize=&sort=&minRating=` | Public | List review + `summary` (avg, distribution, breakdown 6 tiêu chí). `sort`: `newest\|oldest\|highest\|lowest` |
| POST | `/yachts/:id/reviews` | CUSTOMER | Tạo đánh giá |
| POST | `/yachts/:id/reviews/:reviewId/reply` | ADMIN+SALE hệ thống | Hệ thống phản hồi `{ reply }` |
| GET | `/admin/yacht-reviews?status=&page=&pageSize=` | ADMIN+SALE hệ thống | Moderation list. `status`: `visible\|hidden\|all` |
| DELETE | `/admin/yacht-reviews/:id` | ADMIN+SALE hệ thống | Ẩn `{ reason? }` |
| POST | `/admin/yacht-reviews/:id/restore` | ADMIN+SALE hệ thống | Khôi phục |

**CreateYachtReviewDto**: `bookingId*`, `cleanliness*, location*, amenities*, service*, value*, accuracy*` (mỗi field 1-5), `comment?`, `photos?[]` (URL, ≤10).

- Điều kiện: đơn thuộc khách + đúng du thuyền + `status ∈ {PAID, COMPLETED}` + `now >= checkout + 12h trưa VN` + chưa đánh giá. Sai → `403 notYourBooking` / `400 notReviewable` / `400 reviewNotYetAllowed` / `409 alreadyReviewed`.
- FE dùng `booking.canReview` / `booking.reviewUnlockAt` (§27.3) để bật nút "Đánh giá" — **không** tự suy từ `status`.
- `avgRating = (6 điểm)/6`; BE tự cập nhật `yacht.ratingAvg` + `reviewCount` (denormalized, đồng bộ card list/detail).

**Response list** (`data`): `{ summary: { avgRating, totalReviews, distribution{5..1}, breakdown{6 tiêu chí} }, items: [{ id, customer{id,name,avatar}, cleanliness, location, amenities, service, value, accuracy, avgRating, comment, photos[], reply, replyAt, createdAt }], page, pageSize, total }`.

### 27.6 Changelog

- **2026-07-13 (v1.40)** — Thêm module Du thuyền: 4 bảng (`yachts`, `yacht_images`, `yacht_bookings`, `yacht_calendar_locks`, migration `20260713000000_add_yachts`). CRUD + giá (tái dùng `booking-pricing`) + ảnh Cloudinary + lịch công khai. Luồng đặt PENDING→CONFIRMED(VietQR)→PAID(email mã code). Nhắn tin khách ↔ hệ thống qua `Conversation.type='yacht'`; mở quyền đọc/gửi cho SALE hệ thống trên hội thoại `yacht`/`support`; thêm `GET /conversations/yacht`. Email template `yacht_booking_confirmed`. i18n namespaces `yachts` + `yachtBookings`.
- **2026-07-13 (v1.40.1)** — Lịch du thuyền trả thêm `price` + `priceType` mỗi ngày (giá đêm theo ngày thường/cuối tuần/lễ). Thêm **đánh giá du thuyền** (§27.5): bảng `yacht_reviews` (migration `20260713010000_add_yacht_reviews`), 6 tiêu chí giống PropertyReview, mở sau khi qua ngày kết thúc hành trình; booking trả thêm `hasReview`/`canReview`/`reviewUnlockAt`; cron auto-complete PAID→COMPLETED; i18n namespace `yachtReviews`.
- **2026-07-13 (v1.40.2)** — **Tour trong ngày** (không qua đêm): `checkoutDate` optional, bỏ trống → = `checkinDate`; giá tính 1 buổi (không nhân đêm); cho phép nhiều đơn cùng ngày. `GET /yacht-bookings/:id` trả `payment` (VietQR) cho khách khi đơn CONFIRMED + chưa thanh toán. Không đổi schema. FE khách gửi 1 ngày cho tour ngày/dinner.
- **2026-07-13 (v1.40.3)** — **Giá du thuyền BÁN THEO ĐẦU NGƯỜI, giá người lớn ≠ trẻ em**. Bỏ mô hình per-booking + phụ thu. Thêm 3 cột `weekdayChildPrice`/`weekendChildPrice`/`holidayChildPrice` (migration `20260713020000_add_yacht_child_prices`); `weekdayPrice`/`weekendPrice`/`holidayPrice` giờ = **giá người lớn/khách**. `totalAmount = adults × giá NL(ngày) + children × giá TE(ngày)`. `PUT /yachts/:id/prices` nhận 3 giá NL (bắt buộc) + 3 giá TE (tuỳ chọn, null=miễn phí). Calendar trả thêm `childPrice`/ngày. Bỏ `adultSurcharge`/`childSurcharge`/`standardGuests`/`standardChildren` khỏi form (cột giữ cho tương thích, không dùng).
