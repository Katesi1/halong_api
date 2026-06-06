# Halong24h — Tài liệu Frontend Mobile (Android/iOS)

> **Mục đích**: Giúp team Backend hiểu app Flutter mobile đang gọi API nào, ở màn hình/luồng nào, gửi/nhận field gì.  
> **Đối tượng đọc**: Dev BE, QA integration.  
> **Tham chiếu BE**: `docs/API_SPEC_FULL.md` (spec đầy đủ từ phía server), `REPORT_FE_ANDROID_2026-06-06.md` (feedback BE).  
> **Cập nhật**: 2026-06-06 · App version `1.1.3+12` · Base URL production: `https://api.halong24h.com`  
> **Changelog gần nhất**: Báo cáo vi phạm có list + detail + actions (mock); lịch sử moderation gộp vào **Thông báo → Hệ thống** (bỏ màn `/admin/moderation-audit`).

---

## Mục lục

0. [Mô hình sản phẩm B2B (quan trọng)](#0-mô-hình-sản-phẩm-b2b-quan-trọng)
1. [Tổng quan app](#1-tổng-quan-app)
2. [Kiến trúc & luồng dữ liệu](#2-kiến-trúc--luồng-dữ-liệu)
3. [Quy ước gọi API chung](#3-quy-ước-gọi-api-chung)
4. [Roles, route guard & màn hình theo vai trò](#4-roles-route-guard--màn-hình-theo-vai-trò)
5. [Bảng tra cứu nhanh: API ↔ Repository ↔ Màn hình](#5-bảng-tra-cứu-nhanh-api--repository--màn-hình)
6. [Chi tiết từng module](#6-chi-tiết-từng-module)
7. [Màn hình chưa ghép API (UI-only / mock)](#7-màn-hình-chưa-ghép-api-ui-only--mock)
8. [API khai báo nhưng app chưa dùng](#8-api-khai-báo-nhưng-app-chưa-dùng)
9. [Điểm cần BE lưu ý / gap hiện tại](#9-điểm-cần-be-lưu-ý--gap-hiện-tại)
10. [Cấu trúc thư mục code](#10-cấu-trúc-thư-mục-code)

---

## 0. Mô hình sản phẩm B2B (quan trọng)

> **Quyết định sản phẩm (2026-06-06)**: App mobile này là **PMS B2B** — dành cho **chủ homestay (OWNER)** và **nhân viên sale (SALE)** vận hành phòng. **Khách lưu trú không đặt phòng trên app này.**

### Ai dùng app?

| Role | Dùng app? | Việc chính |
|---|---|---|
| **OWNER** | Có | Quản lý cơ sở, phòng, giá, lịch; KYC + subscription; mời SALE |
| **SALE** | Có | Xem phòng được gán → **giữ/lock phòng** cho khách (offline/direct) → confirm booking |
| **ADMIN** | Có | Duyệt KYC, quản lý user, trial, xử lý báo cáo vi phạm |
| **CUSTOMER (khách lưu trú)** | **Không** | Khách nhận phòng qua kênh ngoài app (SALE giữ hộ, OTA, walk-in…). App riêng cho khách (nếu có) là product khác |

### Luồng booking B2B (core workflow)

```
Khách liên hệ SALE/OWNER (Zalo, điện thoại, OTA…)
    ↓
SALE/OWNER mở app → xem lịch phòng (GET /calendar/grid)
    ↓
Chọn phòng + ngày → Giữ phòng (POST /bookings/hold)
    body: propertyId, checkinDate, checkoutDate, customerName?, customerPhone?, depositAmount?, notes?
    → Booking status = HOLD (thường ~30 phút để chốt với khách)
    ↓
Khách chuyển cọc / xác nhận ngoài app
    ↓
SALE/OWNER confirm (PATCH /bookings/:id/confirm) → CONFIRMED
    ↓
Check-in / Check-out (roadmap — BE sẽ bổ sung PATCH check-in/out)
```

**Khách không tự gọi** `POST /bookings/customer-hold`, `GET /bookings/my-bookings`, hay flow `/home` → `/search` → đặt phòng.

### Code customer mode

Đã **gỡ hoàn toàn** (2026-06-06): `features/customer/`, `CustomerRepository`, routes `/home|/search|/my-bookings|/account`, toggle view mode, bottom nav khách.

---

## 1. Tổng quan app

| Hạng mục | Giá trị |
|---|---|
| Tên sản phẩm | Halong24h — **PMS B2B** quản lý homestay (Android/iOS) |
| Đối tượng người dùng | OWNER, SALE, ADMIN |
| **Không phải** | App đặt phòng cho khách lưu trú (B2C) |
| Platform | Flutter (Android + iOS) |
| State management | Riverpod |
| Navigation | GoRouter |
| HTTP | Dio singleton + interceptor tự refresh token |
| Auth lưu trữ | `flutter_secure_storage` (access + refresh token, user JSON) |
| Push notification | Firebase Cloud Messaging → register token qua `/devices` |

**Màn hình chính sau login (OWNER / SALE / ADMIN):**

Dashboard → Phòng → Lịch → Booking → Báo cáo (+ Quản lý/Admin nếu có quyền)

> ⚠️ Customer mode đã **gỡ khỏi code** (2026-06-06). Chỉ còn bottom nav B2B: Dashboard, Phòng, Lịch, Báo cáo, Quản lý.

---

## 2. Kiến trúc & luồng dữ liệu

```
Màn hình (View)
    ↓ user action
Controller (Riverpod Provider / StateNotifier)
    ↓
Repository (gọi Dio)
    ↓
ApiClient (Bearer token + auto refresh 401)
    ↓
Backend https://api.halong24h.com
```

**Quy tắc quan trọng:**

- Mọi endpoint (trừ public) tự gắn `Authorization: Bearer <accessToken>`.
- Response thành công: FE đọc `response.data['data']`.
- Response lỗi: FE đọc `message` + `errors` (validation per-field).
- Repository **không throw** (pattern `ApiResponse<T>`), trừ 2 feature đặc biệt:
  - **KYC verify** (`VerifyRepository`) → throw `VerifyApiException`
  - **Admin KYC queue** (`AdminKycRepository`) → throw `Exception`

**Nguồn truth cho user sau login:**

1. Auth endpoints chỉ trả `accessToken` + `refreshToken` (không còn `user` trong response).
2. FE **luôn** gọi tiếp `GET /auth/profile` để lấy `UserModel`.
3. Profile được refresh khi: mở app, app resume, pull-to-refresh dashboard, sau admin duyệt KYC (poll).

---

## 3. Quy ước gọi API chung

### 3.1 File cấu hình endpoint

Tất cả path khai báo tại:

```
lib/core/constants/api_constants.dart
```

Base URL: `https://api.halong24h.com` (không prefix `/api/v1`).

### 3.2 HTTP client & refresh token

File: `lib/core/network/api_client.dart`

| Hành vi | Mô tả |
|---|---|
| Gắn token | Mọi request (trừ auth public) → header `Authorization: Bearer ...` |
| 401 | Tự `POST /auth/refresh` với `refreshToken`, retry request gốc |
| Refresh fail | Xóa storage → logout → redirect `/login` |
| Retry mạng | Timeout/429 → exponential backoff tối đa 2 lần |
| Public auth paths | `/auth/login`, `/register`, `/google`, `/apple`, `/forgot-password`, `/reset-password`, `/refresh` — không gắn Bearer |

### 3.3 Header đặc biệt

| Header | Khi nào FE gửi |
|---|---|
| `X-Device-Id` | `POST /auth/register`, `/auth/google`, `/auth/apple` (anti-spam theo device) |
| `X-Partner-Key` | Mọi `/partner/*` (caller truyền key, không hardcode trong repo) |
| Không Bearer | `GET /app/version`, `/calendar/public-grid`, `/calendar/admin-contact`, `/properties/public`, `/properties/:id/reviews` (public list) |

### 3.4 Envelope response FE expect

```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```

Lỗi: FE dùng `parseDioError()` → ưu tiên `message`, validation thì ghép `errors[field]`.

---

## 4. Roles, route guard & màn hình theo vai trò

### 4.1 Roles (integer)

| Code | Role | Trong app B2B này |
|---:|---|---|
| 0 | ADMIN | Full quản trị |
| 1 | OWNER | Chủ cơ sở — đăng ký qua `/register` (role=1), KYC bắt buộc để mutate property |
| 2 | SALE | Nhân viên — vào app qua **staff invite** của OWNER, scope theo `ownerId` |
| 3 | CUSTOMER | **Không target app này** — role tồn tại trên BE nhưng mobile B2B không phục vụ flow đặt phòng khách |

Getter trên `UserModel`: `isAdmin`, `isOwner`, `isSale`, `isCustomer`, `isManagement`, `needsKyc`, `canMutateManagementData`, …

### 4.2 Redirect sau login

| Role | Route mặc định |
|---|---|
| ADMIN / OWNER / SALE | `/dashboard` |
| CUSTOMER (nếu lọt vào app) | `/dashboard` hoặc chặn — **không có flow B2C** |

> Legacy: code còn redirect CUSTOMER → `/home` và toggle mode khách — sẽ gỡ.

### 4.3 Route guard chính (file `lib/core/utils/app_router.dart`)

| Rule | Hành vi FE |
|---|---|
| Chưa login | Mọi route → `/login` (trừ public: splash, login, register, forgot-password, role-picker, staff/accept) |
| Không phải ADMIN/OWNER | Chặn `/admin/*` |
| Không phải OWNER | Chặn `/staff/manage` |
| SALE membership không active | Chỉ được `/dashboard`, `/profile`, `/profile/help`, `/notifications` |
| SALE | Chặn `/properties/new` (tạo cơ sở mới) |
| OWNER `needsKyc` | Chặn mutate `/properties/:id/*` → redirect `/verify/cccd-front`. Cho phép `/properties` (list). **Roadmap**: cho read-only `GET /properties/:id` khi chưa KYC |
| Admin-only | `/admin/users/*`, `/admin/kyc/*`, `/admin/trial`, `/admin/abuse-reports/*`, `/admin/role-permissions` |
| Lịch sử moderation (legacy) | `/admin/moderation-audit` → redirect `/notifications?type=system` |
| Legacy customer routes | `/home`, `/search`, `/my-bookings`, `/account` — **out of scope B2B**, sẽ gỡ |

### 4.4 Bottom navigation (B2B — mode quản lý)

| Tab | Route |
|---|---|
| Tổng quan | `/dashboard` |
| Phòng | `/rooms` |
| Lịch | `/calendar` |
| Báo cáo | `/reports` |
| Quản lý | `/admin` hoặc `/properties` (ADMIN/OWNER) |

> Tab “Trang chủ / Tìm phòng / Booking khách” thuộc customer mode legacy — không dùng trong sản phẩm B2B.

---

## 5. Bảng tra cứu nhanh: API ↔ Repository ↔ Màn hình

> **Cột “Màn hình”** = route GoRouter hoặc tên screen. **Repository** = file gọi API thực tế.

### Auth & Profile

| Method | Path | Repository | Màn hình / Trigger |
|---|---|---|---|
| POST | `/auth/register` | `auth_repository.dart` | `/register` |
| POST | `/auth/login` | `auth_repository.dart` | `/login` |
| POST | `/auth/google` | `auth_repository.dart` | Login, Role picker |
| POST | `/auth/apple` | `auth_repository.dart` | Login (iOS) |
| POST | `/auth/refresh` | `api_client.dart` (interceptor) | Tự động |
| POST | `/auth/logout` | `auth_repository.dart` | Profile → Logout |
| GET | `/auth/profile` | `auth_repository.dart` | Splash, sau mọi login, app resume |
| POST | `/auth/forgot-password` | `auth_repository.dart` | `/forgot-password` |
| POST | `/auth/reset-password` | `auth_repository.dart` | (deep link — nếu có) |
| POST | `/auth/change-password` | `auth_repository.dart` | `/profile/change-password` |
| PUT | `/users/:id` | `auth_repository.updateProfile` + `user_repository` | `/profile/edit` |

### Users (Admin)

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| GET | `/users` | `user_repository.dart` | `/admin/users` |
| GET | `/users/:id` | `user_repository.dart` | `/admin/users/:id/edit` |
| POST | `/users` | `user_repository.dart` | `/admin/users/new` |
| PUT | `/users/:id` | `user_repository.dart` | Admin user form |
| DELETE | `/users/:id` | `user_repository.dart` | Admin user list |
| DELETE | `/users/me` | `user_repository.dart` | `/profile/delete-account` |
| GET | `/users/my-staff` | `user_repository.dart` | (legacy — song song `/staff`) |
| POST | `/users/my-staff` | `user_repository.dart` | (legacy) |
| DELETE | `/users/my-staff/:id` | `user_repository.dart` | (legacy) |
| GET | `/users/available-staff` | `user_repository.dart` | (legacy) |

### Properties (cơ sở lưu trú = booking unit)

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| GET | `/properties` | `homestay_repository`, `room_repository` | `/properties`, `/rooms`, `/dashboard` |
| GET | `/properties/:id` | `homestay_repository`, `room_repository` | Property manage, room detail |
| POST | `/properties` | `homestay_repository`, `room_repository` | `/properties/new` |
| PATCH | `/properties/:id` | `homestay_repository`, `room_repository` | `/properties/:id/info`, amenities, pricing… |
| DELETE | `/properties/:id` | `homestay_repository`, `room_repository` | Property management |
| GET | `/properties/public` | `room_repository.dart` | Tab **`/rooms`** — mọi user login thấy tất cả căn active |
| POST | `/properties/:id/images` | `room_repository` | `/properties/:id/images` |
| DELETE | `/properties/:id/images/:imageId` | `room_repository` | Property images |
| PATCH | `/properties/:id/images/:imageId/cover` | `room_repository` | Set cover |
| PUT | `/properties/:id/prices` | `room_repository` | `/properties/:id/pricing` |

Query params FE hay dùng:

- `includeInactive=true` — management list
- `propertyId` — filter theo cơ sở (trên `/properties`)
- Public search: `checkinDate`, `checkoutDate`, `guests`, `minPrice`, `maxPrice`, `view`

### Bookings (B2B — SALE/OWNER giữ phòng cho khách)

| Method | Path | Repository | Màn hình | Ghi chú |
|---|---|---|---|---|
| GET | `/bookings` | `booking_repository.dart` | `/bookings`, dashboard | Danh sách booking của owner/SALE scope |
| GET | `/bookings/:id` | `booking_repository.dart` | `/bookings/:id` | Chi tiết |
| **POST** | **`/bookings/hold`** | `booking_repository.dart` | **`/rooms/:id/hold`** | **Core B2B** — SALE/OWNER giữ phòng cho khách |
| PATCH | `/bookings/:id/confirm` | `booking_repository.dart` | Booking detail | Sau khi khách chốt ngoài app |
| PATCH | `/bookings/:id/cancel` | `booking_repository.dart` | Booking list/detail | Huỷ |
| PUT | `/bookings/:id` | `booking_repository.dart` | Booking detail | Sửa thông tin |
| GET | `/bookings/calendar/:propertyId` | `booking_repository.dart` | Booking calendar (legacy monthly) | |
| POST | `/bookings/customer-hold` | — | **Không dùng** — app B2B |
| GET | `/bookings/my-bookings` | — | **Không dùng** — app B2B |
| PATCH | `/bookings/:id/customer-cancel` | — | **Không dùng** — app B2B |

### Calendar (grid mới)

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| GET | `/calendar/public-grid` | `calendar_repository.dart` | Hold room (check conflict), public calendar |
| GET | `/calendar/grid` | `calendar_repository.dart` | `/calendar`, owner calendar |
| POST | `/calendar/lock` | `calendar_repository.dart` | Calendar actions (lock/hold/booked) |
| DELETE | `/calendar/lock` | `calendar_repository.dart` | Unlock ngày |
| PATCH | `/calendar/sold` | `calendar_repository.dart` | Mark sold |
| GET | `/calendar/admin-contact` | `calendar_repository.dart` | Calendar UI (liên hệ admin) |

Query: `startDate`, `endDate` (YYYY-MM-DD), optional `propertyId`, `type`.

### Dashboard & Reports

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| GET | `/dashboard/stats` | `dashboard_repository.dart` | `/dashboard` |
| GET | `/reports` | `report_repository.dart` | `/reports` |

Dashboard FE parse các field: `totalRooms`, `activeRooms`, `emptyRooms`, `occupiedRooms`, `checkoutToday`, `totalBookings`, `thisMonthBookings`, `monthlyRevenue`, `todayRevenue`, `globalTotalRooms`, `globalEmptyRooms`.

Reports query: xem **§6.8** — spec đầy đủ cho BE (`period`, `from`, `to`, response schema).

### KYC (OWNER verify)

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| POST | `/kyc/upload-cccd-front` | `verify_repository_impl.dart` | `/verify/cccd-front` |
| POST | `/kyc/upload-cccd-back` | `verify_repository_impl.dart` | `/verify/cccd-back` |
| POST | `/kyc/upload-selfie` | `verify_repository_impl.dart` | `/verify/selfie` |
| GET | `/kyc/status` | `verify_repository_impl.dart` | Paywall hydrate, rejected flow |
| POST | `/kyc/submit` | `verify_repository_impl.dart` | Sau payment → pending |
| GET | `/kyc/submissions/:id` | `verify_repository_impl.dart` | Pending poll, admin detail |
| POST | `/kyc/submissions/:id/resubmit` | `verify_repository_impl.dart` | Rejected → chụp lại |

Upload multipart: field `image` (+ optional `ocrResult` JSON cho CCCD, `cccdFrontId` cho selfie).

### Billing & Payment (KYC subscription — OWNER)

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| GET | `/billing/plans` | `verify_repository_impl.dart` | `/verify/select-plan`, paywall |
| GET | `/payments/active` | `verify_repository_impl.dart` | Paywall / payment rehydrate (BE v1.9) |
| POST | `/payments/initiate` | `verify_repository_impl.dart` | `/verify/payment` |
| GET | `/payments/:sessionId/status` | `verify_repository_impl.dart` | Poll 5–15s |
| POST | `/payments/:sessionId/cancel` | `verify_repository_impl.dart` | Đóng modal / đổi gói (BE v1.9) |
| POST | `/payments/:sessionId/refund` | `verify_repository_impl.dart` | Rejected screen |
| GET | `/payments/history` | `verify_repository_impl.dart` | `/verify/payment-history` |
| POST | `/payments/renew` | `verify_repository_impl.dart` | Subscription detail (renew) |

Body `POST /payments/initiate`: `{ planId, cycle, method, rooms, totalAmount }`  
**`method`**: BE chỉ chấp nhận **`bank_transfer`** (VNPay/Apple IAP đã loại từ BE v1.4).  
Plan QA: `starter_test` — 10.000đ/tháng, 1 phòng, `method: "bank_transfer"`.  
Phân biệt **`qrExpiresAt`** (15 phút — countdown QR) vs **`expiresAt`** (24h — cửa sổ đối soát).

### Admin KYC & Trial

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| GET | `/admin/kyc/queue` | `admin_kyc_repository_impl.dart` | `/admin/kyc` (3 tab status) |
| GET | `/kyc/submissions/:id` | `admin_kyc_repository_impl.dart` | `/admin/kyc/:id` |
| POST | `/admin/kyc/submissions/:id/approve` | `admin_kyc_repository_impl.dart` | KYC detail → body `{ trialDays: 7 }` |
| POST | `/admin/kyc/submissions/:id/reject` | `admin_kyc_repository_impl.dart` | body `{ reason, items[] }` |
| GET | `/admin/users/:id/subscription` | `admin_trial_repository_impl.dart` | `/admin/users/:id/trial` |
| POST | `/admin/users/:id/trial` | `admin_trial_repository_impl.dart` | Grant trial |
| DELETE | `/admin/users/:id/trial` | `admin_trial_repository_impl.dart` | Revoke trial |

### Admin — Báo cáo vi phạm (mock, chờ BE)

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| — | *(chưa có trên BE)* | `mock_abuse_report_repository.dart` | `/admin/abuse-reports` (list, 4 tab) |
| — | *(chưa có trên BE)* | `mock_abuse_report_repository.dart` | `/admin/abuse-reports/:id` (detail + actions) |

**Actions FE đã có (mock):** `investigate`, `dismiss`, `resolve` (+ tuỳ chọn ẩn nội dung / khóa user theo `targetType`).  
**Khi BE expose API** (gợi ý): `GET /admin/abuse-reports`, `GET /admin/abuse-reports/:id`, `POST .../investigate|dismiss|resolve`. Mỗi action moderation thực tế (ban, hide property…) nên push `NotificationType.system` + ghi audit log server-side (spec §14).

### Staff invites

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| POST | `/staff/invites` | `staff_repository.dart` | `/staff/manage` — mời email |
| GET | `/staff/invites` | `staff_repository.dart` | Danh sách invite |
| DELETE | `/staff/invites/:id` | `staff_repository.dart` | Huỷ invite |
| GET | `/staff/invites/verify/:token` | `staff_repository.dart` | `/staff/accept?token=` |
| POST | `/staff/invites/accept` | `staff_repository.dart` | Accept (Google hoặc password) |
| GET | `/staff` | `staff_repository.dart` | Staff list |
| DELETE | `/staff/:userId` | `staff_repository.dart` | Gỡ nhân viên |

Accept body (password): `{ token, method: "password", name, password, phone? }`  
Accept body (Google): `{ token, method: "google", idToken }`  
→ Response chỉ tokens → FE gọi `GET /auth/profile`.

### Reviews

| Method | Path | Repository | Màn hình |
|---|---|---|---|
| GET | `/properties/:id/reviews` | `review_repository.dart` | `/reviews/:id` |
| POST | `/properties/:id/reviews` | `review_repository.dart` | `/reviews/:id/write?bookingId=` |
| POST | `/properties/:id/reviews/:reviewId/reply` | `review_repository.dart` | Owner reply (trong reviews screen) |
| DELETE | `/admin/reviews/:reviewId` | `review_repository.dart` | Admin hide review |

Create review body: `{ bookingId, cleanliness, location, amenities, service, value, accuracy, comment?, photos? }` — mỗi tiêu chí 1–5.

### Notifications & Devices

| Method | Path | Repository | Màn hình / Service |
|---|---|---|---|
| GET | `/notifications` | `notification_repository.dart` | `/notifications` (filter chip: Tất cả / Booking / Thanh toán / **Hệ thống**) |
| GET | `/notifications/unread-count` | `notification_repository.dart` | Badge AppBar |
| PATCH | `/notifications/:id/read` | `notification_repository.dart` | Notification detail |
| PATCH | `/notifications/read-all` | `notification_repository.dart` | Mark all |

**Deep link filter:** `/notifications?type=system` — mở sẵn tab **Hệ thống** (dùng cho lịch sử moderation / audit push từ BE).
| POST | `/devices` | `device_repository.dart` | `push_notification_service.dart` (sau login) |
| DELETE | `/devices/:token` | `device_repository.dart` | Trước logout |

Device body: `{ fcmToken, platform, deviceModel?, osVersion?, appVersion?, locale? }`.

### App version

| Method | Path | Service | Màn hình |
|---|---|---|---|
| GET | `/app/version` | `app_version_service.dart` | Startup → `/update-required` nếu force update |

Query: `platform=android|ios`, `currentVersion=1.1.3`.  
Expect `data`: `{ latestVersion, minSupportedVersion, releaseNotes, storeUrl: { ios, android } }`.

### Partner API (tích hợp riêng)

| Method | Path | Repository | Ghi chú |
|---|---|---|---|
| GET | `/partner/properties` | `partner_repository.dart` | Header `X-Partner-Key` |
| GET | `/partner/properties/:id` | `partner_repository.dart` | |
| GET | `/partner/properties/:id/availability` | `partner_repository.dart` | query `year`, `month` |
| POST | `/partner/bookings` | `partner_repository.dart` | |
| POST | `/partner/bookings/:id/cancel` | `partner_repository.dart` | |

App mobile **có repository** nhưng **không có màn hình consumer** — dùng cho tích hợp B2B / script.

---

## 6. Chi tiết từng module

### 6.1 Auth (`features/auth/`)

**Luồng đăng nhập email:**

```
LoginScreen
  → AuthRepository.login(identifier, password)
  → POST /auth/login  body: { email, password }   ⚠️ xem mục 9 — BE spec dùng identifier
  → Lưu tokens
  → GET /auth/profile
  → AuthNotifier cập nhật state → router redirect
```

**Luồng đăng ký (chỉ OWNER trên app B2B):**

```
RegisterScreen
  → POST /auth/register
     body: { name, email, password, role: 1, phone? }   // role=1 OWNER
     header: X-Device-Id (optional)
  → GET /auth/profile
```

SALE **không** tự đăng ký role=2 — vào qua `/staff/accept`.  
CUSTOMER (role=3) **không** thuộc app này — nếu cần B2C sẽ là app/product riêng.

**Google / Apple Sign-In:**

```
LoginScreen → loginWithGoogle(role?)
  → Google SDK lấy idToken
  → POST /auth/google  body: { idToken, role? }

Nếu data.isNewUser === true:
  → RolePickerScreen (/auth/role-picker)
  → completeGoogleSignInWithRole(idToken, role)
  → POST /auth/google lần 2 có role

Nếu có tokens:
  → GET /auth/profile → vào app
```

Apple tương tự qua `POST /auth/apple` với `{ idToken, role?, email?, name?, authorizationCode?, platform }`.

**Splash:**

- Đọc token local → `GET /auth/profile` nếu còn session.
- Song song check `GET /app/version`.

**File chính:**

| File | Vai trò |
|---|---|
| `auth_repository.dart` | Tất cả API auth |
| `auth_controller.dart` | `authProvider`, `currentUserProvider`, refresh profile |
| `login_screen.dart`, `register_screen.dart`, `role_picker_screen.dart` | UI |

---

### 6.2 Profile (`features/profile/`)

| Route | API |
|---|---|
| `/profile` | Đọc `currentUserProvider` (từ profile cache) |
| `/profile/edit` | `PUT /users/:id` + refresh `GET /auth/profile` |
| `/profile/change-password` | `POST /auth/change-password` |
| `/profile/delete-account` | `DELETE /users/me` body optional `{ reason }` |
| `/profile/help`, `/privacy`, `/terms`, `/consent` | Static UI — **không API** |
| `/profile/feedback` | Analytics local — **chưa POST BE** |
| `/profile/tickets` | Mock data — **chưa API** |
| `/profile/notifications` | Local prefs — **chưa API** |
| `/profile/data-request` | Static / placeholder |

---

### 6.3 Customer mode — **ĐÃ GỠ (2026-06-06)**

Module `features/customer/`, `CustomerRepository`, routes `/home`, `/search`, `/my-bookings`, `/account` và toggle mode khách **đã xoá khỏi codebase**. App chỉ phục vụ OWNER / SALE / ADMIN.

API `POST /bookings/customer-hold`, `GET /bookings/my-bookings` — **không dùng** trên app B2B (dành product khách nếu có sau này).

**Luồng booking:** mục 6.6 — `/rooms/:id/hold` → `POST /bookings/hold`.

---

### 6.4 Dashboard (`features/dashboard/`)

| Route | API | Fields hiển thị |
|---|---|---|
| `/dashboard` | `GET /dashboard/stats` | KPI cards, pills trạng thái phòng, booking hôm nay |

Banner FE render từ **`user` profile** (không gọi API riêng):

| Điều kiện `UserModel` | Banner |
|---|---|
| `needsKyc` | CTA verify KYC |
| `isKycPending` | Đang chờ duyệt |
| `isInTrial` | Còn X ngày trial |
| `isSubscriptionPastDue` | Quá hạn thanh toán |
| SALE `!isSaleMembershipActive` | Chưa được gán / suspended |

Pull-to-refresh → `authProvider.notifier.refreshProfile()` + invalidate `dashboardStatsProvider`.

---

### 6.5 Properties / Rooms — Quản lý cơ sở (`features/properties/`, `features/rooms/`)

App gọi backend resource **`/properties`** — mỗi property = một đơn vị cho thuê (homestay/phòng).

| Route | Hành động | API |
|---|---|---|
| `/properties` | List | `GET /properties?includeInactive=true` |
| `/properties/new` | Tạo | `POST /properties` |
| `/properties/:id` | Hub quản lý | `GET /properties/:id` |
| `/properties/:id/info` | Sửa thông tin | `PATCH /properties/:id` |
| `/properties/:id/images` | Upload/xóa/cover | POST/DELETE/PATCH images |
| `/properties/:id/pricing` | Bảng giá | `PUT /properties/:id/prices` |
| `/properties/:id/amenities` | Tiện ích | `PATCH /properties/:id` |
| `/properties/:id/rules` | Nội quy | `PATCH /properties/:id` |
| `/properties/:id/location` | Vị trí | `PATCH /properties/:id` |
| `/properties/:id/services` | Dịch vụ | `PATCH /properties/:id` |
| `/properties/:id/cancellation` | Chính sách huỷ | `PATCH /properties/:id` |
| `/rooms` | Danh sách (management) | `GET /properties/public` — **tất cả căn active**, mọi role đều thấy |
| `/rooms/:id` | Chi tiết | `GET /properties/:id` |
| `/rooms/:id/hold` | Staff giữ phòng | `POST /bookings/hold` |

**Guard:** OWNER chưa KYC approved → redirect `/verify/cccd-front` khi vào mutate routes.

**Model:** `RoomModel`, `HomestayModel` parse cùng shape từ `/properties`.

---

### 6.6 Bookings — B2B: SALE/OWNER giữ phòng cho khách (`features/bookings/`)

Đây là **module nghiệp vụ trung tâm** của app: nhân viên/chủ homestay lock phòng trên hệ thống để giao cho khách đặt qua kênh ngoài (điện thoại, OTA, trực tiếp…).

| Route | API | Ai dùng |
|---|---|---|
| `/bookings` | `GET /bookings` | OWNER, SALE, ADMIN |
| `/bookings/:id` | GET + confirm/cancel/update | OWNER, SALE |
| `/bookings/check-in` | Filter local từ list | **Chưa phải check-in thật** — BE sẽ bổ sung `PATCH .../check-in` |
| `/bookings/check-out` | Filter local từ list | Tương tự — roadmap PMS |
| **`/rooms/:id/hold`** | **`POST /bookings/hold`** | **SALE, OWNER** — giữ phòng cho khách |
| `/calendar` | `GET /calendar/grid` (+ lock/unlock/sold) | Xem & thao tác lịch trước khi hold |

**Body staff hold (`POST /bookings/hold`) — API chính B2B booking:**

```json
{
  "propertyId": "uuid",
  "checkinDate": "2026-06-15",
  "checkoutDate": "2026-06-17",
  "customerName": "optional",
  "customerPhone": "optional",
  "depositAmount": 500000,
  "notes": "optional"
}
```

Trước khi hold, màn hình check conflict qua `GET /calendar/grid` (management) hoặc `GET /calendar/public-grid`.

**Vòng đời booking FE expect:**

```
HOLD (SALE giữ cho khách) → CONFIRMED (khách chốt) → COMPLETED
                      ↘ CANCELLED
```

**Booking status:** FE parse integer → enum `HOLD | CONFIRMED | CANCELLED | COMPLETED` (`app_constants.dart`). Roadmap: thêm `CHECKED_IN`, `NO_SHOW` khi BE có endpoint check-in/out.

---

### 6.7 Calendar (`features/calendar/`)

Tách biệt với `GET /bookings/calendar/:propertyId` (legacy theo tháng).

Grid calendar dùng:

- **Public:** `GET /calendar/public-grid` — không auth
- **Management:** `GET /calendar/grid` — scoped theo owner/SALE/admin

Actions trên từng ngày:

| FE action | API | Body |
|---|---|---|
| Lock | `POST /calendar/lock` | `{ propertyId, date, status: 0 }` |
| Hold | `POST /calendar/lock` | `{ status: 1 }` |
| Booked | `POST /calendar/lock` hoặc `PATCH /calendar/sold` | |
| Unlock | `DELETE /calendar/lock` | `{ propertyId, date }` |

`GET /calendar/admin-contact` — hiển thị SĐT/email hỗ trợ trên UI lịch.

---

### 6.8 Reports (`features/reports/`)

> **Mục đích tài liệu này:** BE implement **một endpoint** `GET /reports`. FE đã wire sẵn — gửi section này cho team API.

#### Route & code FE

| Route app | API | Repository | File |
|---|---|---|---|
| `/reports` | `GET /reports` | `report_repository.dart` | `features/reports/views/report_screen.dart` |

**Auth:** `Authorization: Bearer <accessToken>` (bắt buộc).

**Response envelope (chuẩn toàn app):**

```json
{
  "success": true,
  "data": { ... },
  "message": "..."
}
```

Lỗi: `{ "success": false, "message": "..." }` — FE hiển thị `message` trên màn báo cáo.

---

#### Query parameters

| Param | Bắt buộc | Giá trị | Ghi chú |
|---|---|---|---|
| `period` | Khuyến nghị | `today` \| `week` \| `month` \| `year` \| `custom` | Mặc định `month` nếu không truyền |
| `from` | **Bắt buộc khi `period=custom`** | `YYYY-MM-DD` | Ngày bắt đầu (inclusive) |
| `to` | **Bắt buộc khi `period=custom`** | `YYYY-MM-DD` | Ngày kết thúc (inclusive) |
| `month` | Legacy (optional) | `1`–`12` | Chỉ dùng tương thích API cũ |
| `year` | Legacy (optional) | `2026` | Chỉ dùng tương thích API cù |

**Ví dụ request FE thực tế gửi:**

```
GET /reports?period=month
GET /reports?period=today
GET /reports?period=week
GET /reports?period=year
GET /reports?period=custom&from=2026-06-01&to=2026-06-30
```

**Format ngày:** `YYYY-MM-DD` (FE format qua `report_repository.dart`, không có giờ/timezone trong query).

---

#### Semantics từng `period` (BE cần thống nhất 1 chuẩn)

| `period` | Khoảng thời gian gợi ý | Timezone |
|---|---|---|
| `today` | 00:00:00 → 23:59:59 **hôm nay** | `Asia/Ho_Chi_Minh` |
| `week` | Tuần hiện tại (BE chốt: T2–CN hoặc CN–T7, document rõ) | VN |
| `month` | Tháng dương lịch hiện tại | VN |
| `year` | Năm dương lịch hiện tại | VN |
| `custom` | `[from 00:00, to 23:59]` inclusive | VN |

**`previousPeriod` (bắt buộc cho KPI delta):** kỳ ngay trước **cùng độ dài** với kỳ đang xem.

| Kỳ đang xem | Kỳ so sánh gợi ý |
|---|---|
| `today` | Hôm qua |
| `week` | Tuần trước |
| `month` | Tháng trước |
| `year` | Năm trước |
| `custom` `[from, to]` N ngày | N ngày ngay trước `from` |

FE tính % delta: `(current - previous) / previous * 100`. Nếu `previous = 0` → FE hiển thị `—` (không crash).

---

#### Validation BE (trả `400`)

| Rule | Message gợi ý |
|---|---|
| `period=custom` mà thiếu `from` hoặc `to` | `from và to bắt buộc khi period=custom` |
| `from > to` | `from phải ≤ to` |
| `to` sau hôm nay (VN) | `to không được ở tương lai` |
| `period` không hợp lệ | `period không hợp lệ` |

---

#### Phạm vi dữ liệu theo role

| Role | Scope |
|---|---|
| **OWNER** | Chỉ property thuộc owner đăng nhập |
| **SALE** | Chỉ property thuộc `ownerId` mà sale được gán |
| **ADMIN** | Toàn hệ thống (hoặc theo policy nội bộ BE) |

**Nguồn doanh thu (FE hiển thị trên UI):** booking **đã xác nhận + hoàn thành** trong kỳ (không tính HOLD huỷ). BE document rõ rule aggregate để khớp dashboard.

---

#### Response `data` — schema đầy đủ FE đang parse

File model: `features/reports/data/report_models.dart`  
Repository parse thêm: `recentBookings[]` → `BookingModel` (`data/repositories/report_repository.dart`).

##### KPI cards (4 ô đầu màn hình)

| Field | Type | UI | Ghi chú |
|---|---|---|---|
| `revenue` | int | Doanh thu | VND, tổng kỳ |
| `occupancyRate` | number | Lấp đầy | **0..100** (FE hiển thị `%`) |
| `adr` | int | Đơn giá TB | VND — Average Daily Rate |
| `totalBookings` | int | Booking | Tổng booking trong kỳ |
| `previousPeriod.revenue` | int | Delta doanh thu | |
| `previousPeriod.occupancy` | number | Delta lấp đầy | **0..100** |
| `previousPeriod.adr` | int | Delta ADR | |
| `previousPeriod.bookings` | int | Delta booking | |

##### Trạng thái booking (donut chart)

| Field | Type | Status |
|---|---|---|
| `holdCount` | int | HOLD = 0 |
| `confirmedCount` | int | CONFIRMED = 1 |
| `cancelledCount` | int | CANCELLED = 2 |
| `completedCount` | int | COMPLETED = 3 |

##### Chart xu hướng — `revenueByDay[]`

Mỗi phần tử (1 ngày trong kỳ):

| Field | Type | Ghi chú |
|---|---|---|
| `date` | string ISO date | `"2026-06-01"` |
| `revenue` | int | VND |
| `bookings` | int | |
| `occupancy` | number | **0..1** (FE ×100 khi plot) |

FE toggle metric: doanh thu / lấp đầy / booking trên cùng series.

##### Top phòng — `topRooms[]` (gợi ý top 5)

| Field | Type |
|---|---|
| `roomId` | string (UUID) |
| `name` | string |
| `coverImage` | string? URL |
| `revenue` | int VND |
| `bookings` | int |
| `occupancy` | number **0..1** |

##### Phân tích lưu trú

**`dayOfWeekOccupancy`** — occupancy theo thứ (T2→CN):

```json
{ "values": [0.6, 0.7, 0.65, 0.8, 0.9, 0.95, 0.85] }
```

Index `0` = Thứ Hai, `6` = Chủ Nhật. Mỗi value **0..1**.

**`lengthOfStay`** — histogram số đêm:

| Field | Bucket UI |
|---|---|
| `oneNight` | 1 đêm |
| `twoToThree` | 2–3 đêm |
| `fourToSeven` | 4–7 đêm |
| `eightPlus` | 8+ đêm |

##### Booking gần đây — `recentBookings[]`

Parse thành `BookingModel`. FE hiển thị paginate 5 dòng/trang.

| Field | Type | Bắt buộc UI |
|---|---|---|
| `id` | string | ✓ |
| `propertyId` | string | ✓ |
| `checkinDate` | string date/datetime | ✓ |
| `checkoutDate` | string date/datetime | ✓ |
| `status` | int | ✓ — `0=HOLD, 1=CONFIRMED, 2=CANCELLED, 3=COMPLETED` |
| `customerName` | string? | ✓ (fallback "Không tên") |
| `guestCount` | int | optional, default 2 |
| `property` | object? | **Cần** `{ "name": "Tên phòng" }` cho subtitle |
| `customerPhone`, `depositAmount`, `saleId`, `sale` | optional | |

Sort: **mới nhất trước**, trong phạm vi kỳ đã chọn.

##### Đánh giá khách

**`ratingSummary`** (owner-level, ưu tiên — BE tính sẵn):

| Field | Type |
|---|---|
| `avgRating` | number 0..5 |
| `totalReviews` | int |
| `totalProperties` | int — số căn có review |
| `distribution` | object | `{"5": 8, "4": 4, "3": 1}` — key string OK |
| `breakdown` | object | 6 tiêu chí (xem dưới) |

**`propertyRatings[]`** — per property (fallback nếu thiếu `ratingSummary`):

| Field | Type |
|---|---|
| `propertyId`, `propertyName` | string |
| `coverImage` | string? |
| `avgRating`, `totalReviews` | number, int |
| `distribution`, `breakdown` | như trên |

**`breakdown` 6 tiêu chí** (dùng chung):

```json
{
  "cleanliness": 4.5,
  "location": 4.3,
  "amenities": 4.2,
  "service": 4.6,
  "value": 4.1,
  "accuracy": 4.4
}
```

**`recentReviews[]`** — preview 3 review gần nhất:

| Field | Type |
|---|---|
| `id`, `propertyId`, `propertyName` | string |
| `customerName` | string |
| `customerAvatar` | string? |
| `rating` | number 1..5 |
| `comment` | string |
| `createdAt` | ISO datetime |
| `photos` | string[] URLs |

##### Field legacy / phụ (FE parse, default 0 nếu thiếu)

`totalRooms`, `activeRooms`, `thisMonthBookings`, `totalDeposit`, `roomsWithCover`, `roomsWithPrice`

---

#### Example response (rút gọn)

```json
{
  "success": true,
  "data": {
    "revenue": 15000000,
    "adr": 850000,
    "occupancyRate": 72.5,
    "totalBookings": 42,
    "holdCount": 3,
    "confirmedCount": 10,
    "completedCount": 25,
    "cancelledCount": 4,
    "previousPeriod": {
      "revenue": 12000000,
      "bookings": 38,
      "occupancy": 65.0,
      "adr": 800000
    },
    "revenueByDay": [
      {
        "date": "2026-06-01",
        "revenue": 500000,
        "bookings": 2,
        "occupancy": 0.75
      }
    ],
    "topRooms": [
      {
        "roomId": "uuid",
        "name": "Phòng 101",
        "coverImage": "https://...",
        "revenue": 3000000,
        "bookings": 8,
        "occupancy": 0.8
      }
    ],
    "dayOfWeekOccupancy": {
      "values": [0.6, 0.7, 0.65, 0.8, 0.9, 0.95, 0.85]
    },
    "lengthOfStay": {
      "oneNight": 10,
      "twoToThree": 20,
      "fourToSeven": 8,
      "eightPlus": 2
    },
    "recentBookings": [
      {
        "id": "uuid",
        "propertyId": "uuid",
        "checkinDate": "2026-06-10",
        "checkoutDate": "2026-06-12",
        "status": 1,
        "customerName": "Nguyễn A",
        "guestCount": 2,
        "property": { "name": "Homestay X" }
      }
    ],
    "propertyRatings": [],
    "ratingSummary": {
      "avgRating": 4.4,
      "totalReviews": 25,
      "totalProperties": 3,
      "distribution": { "5": 15, "4": 7, "3": 3 },
      "breakdown": {
        "cleanliness": 4.5,
        "location": 4.3,
        "amenities": 4.2,
        "service": 4.6,
        "value": 4.1,
        "accuracy": 4.4
      }
    },
    "recentReviews": [],
    "totalRooms": 10,
    "activeRooms": 8
  },
  "message": "OK"
}
```

---

#### Hành vi FE (Tuỳ chỉnh) — BE cần biết

1. User tap chip **Tuỳ chỉnh** → app mở date range picker.
2. Chọn xong → FE gọi `GET /reports?period=custom&from=...&to=...`.
3. Huỷ picker → **không gọi API**, giữ kỳ cũ.
4. Chưa chọn ngày → FE **không gọi API** (tránh 400).
5. Đổi kỳ (Hôm nay / Tuần / …) → FE giữ data cũ + progress bar mỏng khi reload.

---

#### API **chưa cần** (FE không gọi)

Các endpoint tách riêng trong roadmap PMS — **chưa wire**:

- `GET /reports/occupancy`
- `GET /reports/adr`
- `GET /reports/revpar`
- `POST /reports/export?format=csv|xlsx`

Gom hết vào `GET /reports` là đủ cho release hiện tại.

---

#### Checklist BE (ưu tiên triển khai)

- [ ] `period=today|week|month|year` với timezone VN
- [ ] `period=custom` + `from`/`to` inclusive + validation 400
- [ ] `previousPeriod` cùng độ dài kỳ
- [ ] `revenue`, `adr`, `occupancyRate`, `totalBookings`
- [ ] `revenueByDay[]` — 1 điểm/ngày trong kỳ
- [ ] `recentBookings[]` + nested `property.name`
- [ ] Status counts cho donut
- [ ] Scope OWNER / SALE
- [ ] (Optional phase 2) `topRooms`, `dayOfWeekOccupancy`, `lengthOfStay`, ratings

---

### 6.9 Verify + Subscription — KYC OWNER (`features/verify/`)

**State machine FE** (enum `VerifyStatus` — camelCase khớp BE):

```
draft → kycSubmitted → paymentPending → awaitingApproval
                              ↓
                    approved → trial → active
                              ↓
                         rejected → resubmit
```

**Source of truth cho gate UI:** `user.kycStatus` từ `GET /auth/profile` (`none|pending|approved|rejected`), **không** dùng local verify controller cho route guard.

**Luồng màn hình thanh toán (BE v1.9):**

| Bước | Route | API |
|---|---|---|
| 1. CCCD mặt trước | `/verify/cccd-front` | `POST /kyc/upload-cccd-front` (multipart) |
| 2. CCCD mặt sau | `/verify/cccd-back` | `POST /kyc/upload-cccd-back` |
| 3. Selfie | `/verify/selfie` | `POST /kyc/upload-selfie` + `cccdFrontId` |
| 4. Chọn gói | `/verify/select-plan` | `GET /billing/plans` |
| 5a. Vào payment | `/verify/payment` | `GET /payments/active` → rehydrate session pending; null → cho initiate |
| 5b. Tạo session | (confirm plan) | `POST /payments/initiate` (`method: bank_transfer`) |
| 5c. Poll | | `GET /payments/:sessionId/status` — 5s/60s rồi 15s; dừng khi `!= pending` hoặc FCM `payment` |
| 5d. Huỷ session | nút Hủy/Đổi gói | `POST /payments/:sessionId/cancel` |
| 6. Submit hồ sơ | (auto sau paid) | `POST /kyc/submit` |
| 7. Chờ duyệt | `/verify/pending` | Poll `GET /kyc/submissions/:id` + `GET /kyc/status` (`latestPayment`) |
| 8. Trial | `/verify/approved` | Profile refresh |
| Từ chối | `/verify/rejected` | Resubmit / refund |
| Lịch sử TT | `/verify/payment-history` | `GET /payments/history?limit&cursor` |
| Gia hạn | `/verify/subscription-detail` | `POST /payments/renew` |

OCR CCCD chạy **on-device** (ML Kit). FE gửi optional `ocrResult` JSON lên BE — BE không cần gọi FPT.AI từ phía upload nếu đã nhận OCR từ app.

Paywall modal (`paywall_modal.dart`) — không có route; hydrate từ `GET /kyc/status` khi mở.

---

### 6.10 Admin (`features/admin/`)

| Route | Role | API |
|---|---|---|
| `/admin` | ADMIN, OWNER (hub) | — |
| `/admin/users` | ADMIN | `GET /users` |
| `/admin/users/new` | ADMIN | `POST /users` |
| `/admin/users/:id/edit` | ADMIN | GET/PUT/DELETE user |
| `/admin/users/:id/trial` | ADMIN | subscription + grant/revoke trial |
| `/admin/kyc` | ADMIN | `GET /admin/kyc/queue?status=&page=&pageSize=` |
| `/admin/kyc/:id` | ADMIN | GET detail, approve, reject |
| `/admin/abuse-reports` | ADMIN | **Mock** — `MockAbuseReportRepository` (4 tab: Chờ xử lý / Tất cả / Đã xử lý / Bỏ qua) |
| `/admin/abuse-reports/:id` | ADMIN | **Mock** — detail + actions: điều tra, bỏ qua, xử lý xong (ẩn nội dung / khóa user) |
| `/admin/role-permissions` | ADMIN | **Local SharedPreferences only** |

KYC queue FE gọi 3 lần parallel: `status=awaiting_approval`, `approved`, `rejected` (pageSize 100).

**Báo cáo vi phạm — file chính:**

| Layer | File |
|---|---|
| Model | `features/admin/data/models/abuse_report.dart` |
| Repository | `abuse_report_repository.dart` + `mock_abuse_report_repository.dart` |
| Controller | `features/admin/controllers/abuse_report_controller.dart` |
| Views | `abuse_reports_screen.dart`, `abuse_report_detail_screen.dart` |

**Lịch sử moderation:** Không còn màn riêng. BE ghi audit (spec §14) + push `type=system` → admin xem tại `/notifications?type=system`. Route cũ `/admin/moderation-audit` redirect sang đó.

---

### 6.11 Staff (`features/staff/`)

| Route | API |
|---|---|
| `/staff/manage` | invites CRUD + `GET /staff` + `DELETE /staff/:id` |
| `/staff/accept?token=` | verify + accept (public) |

Owner mời: `POST /staff/invites { email }` → BE gửi email (FE hiển thị `inviteLink` nếu BE trả).

---

### 6.12 Reviews (`features/reviews/`)

Owner xem/phản hồi đánh giá từ khách (khách gửi review qua **kênh khác** — web B2C hoặc app khách tương lai, không qua app B2B này).

| Route | API |
|---|---|
| `/reviews/:propertyId` | `GET /properties/:id/reviews?page&pageSize&sort&minRating?` |
| `/reviews/:propertyId/write?bookingId=` | `POST /properties/:id/reviews` — **legacy** nếu không có app khách |

Owner reply → `POST .../reviews/:reviewId/reply { reply }`.  
Admin hide → `DELETE /admin/reviews/:reviewId { reason }`.

---

### 6.13 Notifications (`features/notifications/`)

| Route | API |
|---|---|
| `/notifications` | `GET /notifications` |
| `/notifications?type=system` | Cùng API — FE filter client-side tab **Hệ thống** (lịch sử moderation / audit) |
| `/notifications/:id` | `PATCH /notifications/:id/read` |

`NotificationType`: `booking` | `payment` | `system`. Label UI: Booking / Thanh toán / **Hệ thống**.

FCM payload FE expect (deep link): `data.type`, `data.targetType`, `data.targetId` — handler set ở `PushNotificationService.onNotificationTap` (app root).

**Moderation audit UX:** Admin không mở màn audit riêng. Khi BE implement `GET /admin/audit-log`, có thể:
- (Ưu tiên) Push từng action moderation qua `/notifications` với `type=system`, hoặc
- (Bổ sung) Màn audit read-only gọi audit-log API — hiện **chưa có**.

Sau login: `POST /devices` register token. Logout: `DELETE /devices/:fcmToken` rồi `POST /auth/logout`.

---

## 7. Màn hình chưa ghép API (UI-only / mock)

| Màn hình | Route | Trạng thái |
|---|---|---|
| Abuse reports (list + detail) | `/admin/abuse-reports`, `/admin/abuse-reports/:id` | **Mock** — `MockAbuseReportRepository`, chưa gọi BE |
| ~~Moderation audit~~ | `/admin/moderation-audit` | **Đã gỡ** — redirect `/notifications?type=system` |
| Role permissions | `/admin/role-permissions` | Lưu local device, không sync BE |
| Feedback / báo lỗi | `/profile/feedback` | Chỉ analytics event local |
| My tickets | `/profile/tickets` | Hardcoded mock tickets |
| Notification preferences | `/profile/notifications` | SharedPreferences |
| Data request (GDPR) | `/profile/data-request` | Placeholder |
| Customer mode (legacy) | — | **Đã xoá** |
| Customer đặt phòng | — | **Đã xoá** (`CustomerRepository` + screens) |

---

## 8. API khai báo nhưng app chưa dùng

Trong `api_constants.dart` hoặc spec BE có nhưng **mobile chưa integrate**:

| Path | Ghi chú |
|---|---|
| `POST /bookings/customer-hold` | **Out of scope app B2B** — dành product khách (nếu có) |
| `GET /bookings/my-bookings` | Legacy customer screen — sẽ gỡ |
| `PATCH /bookings/:id/customer-cancel` | Legacy — sẽ gỡ |
| `GET /properties/public` | Tab `/rooms` — danh sách căn active toàn hệ thống |
| `GET /properties/share/:id` | Share link public — chưa có UI |
| `/partner/*` | Có `PartnerRepository`, không có screen |
| Chat REST + WebSocket | Spec §17 — app chưa có module chat |
| `GET /admin/audit-log` | Spec §14 — chưa có màn FE; UX tạm thời qua thông báo `type=system` |
| `/admin/abuse-reports` (BE) | Chưa có endpoint — FE dùng mock |
| Disputes, Leads | Spec §13, §15 — chưa có module FE |
| Permissions API (BE) | App dùng mock local cho admin role-permissions |
| Generic `/uploads` | Spec §23 — app upload qua endpoint feature-specific (KYC, property images) |

---

## 9. Điểm cần BE lưu ý / gap hiện tại

### 9.1 Login bằng SĐT

FE hiện gửi:

```json
POST /auth/login
{ "email": "<identifier>", "password": "..." }
```

Comment trong code: khi BE deploy field `identifier` (email **hoặc** phone), FE sẽ đổi key `'email'` → `'identifier'`.  
Nếu BE đã chỉ nhận `identifier` mà FE chưa update → login phone sẽ 400.

### 9.2 Auth response không có `user`

Mọi flow login/register/google/apple/refresh/staff-accept: **chỉ tokens**. FE bắt buộc `GET /auth/profile` ngay sau đó. Nếu profile fail → coi login fail.

### 9.3 `UserModel` fields BE cần trả ở `/auth/profile`

| Field | Dùng cho |
|---|---|
| `role` (0–3) | Route guard, UI |
| `kycStatus`, `kycSubmissionId` | KYC banner, property guard |
| `subscriptionStatus`, `subscriptionPlanId`, `subscriptionCycle` | Subscription banner |
| `trialEndsAt`, `nextChargeAt` | Trial countdown |
| `ownerId`, `saleMembershipStatus` | SALE scope (`invited/active/suspended/unassigned`) |
| `isActive`, `emailVerified` | Admin user management |

### 9.4 Property = Room

FE không tách `/rooms` riêng trên BE. **Tab `/rooms`** dùng `GET /properties/public` (toàn hệ thống). CRUD property của mình dùng `GET/POST/PATCH /properties`. Tên file legacy `room_*` nhưng API field là `propertyId`.

### 9.5 Multipart upload

| Endpoint | Field name |
|---|---|
| KYC CCCD/selfie | `image` |
| Property images | `images` (multiple) |
| KYC optional | `ocrResult` (JSON string), `cccdFrontId` |

### 9.6 Payment polling (BE v1.9)

- Rehydrate: `GET /payments/active` hoặc `GET /kyc/status` → field `latestPayment` (không persist sessionId local).
- Sau `POST /payments/initiate`: poll `GET /payments/:sessionId/status` — 5s trong 60s đầu, rồi 15s; dừng khi `status != pending` hoặc FCM `data.type == "payment"`.
- **`qrExpiresAt`** (15 phút): countdown QR. Sau khi hết → UI "Đang đối soát, tối đa 24h" (dùng **`expiresAt`**).
- Huỷ: `POST /payments/:sessionId/cancel` trước khi đóng modal / đổi gói.
- **`method`**: chỉ `bank_transfer`.

### 9.7 Admin KYC approve response

FE không cần full submission trong approve response — sẽ invalidate list và refetch. Tối thiểu: `{ submissionId, status, approvedAt, trialEndsAt }`.

### 9.8 DELETE `/users/me`

FE gọi cho self-delete (App Store compliance). Cần BE cho phép user xoá chính mình (không chỉ ADMIN delete `/users/:id`).

### 9.9 Error codes Reviews

FE handle message từ BE cho: `400 booking_not_completed`, `403 not_your_booking`, `409 already_reviewed`.

### 9.10 Real-time

App **chưa** dùng Socket.IO. Mọi cập nhật realtime hiện tại: pull-to-refresh, poll (KYC pending, payment status), FCM push (devices registered).

### 9.11 Báo cáo vi phạm — chờ BE

FE đã có queue + detail + actions (pattern giống KYC admin), nhưng **chưa có API**. Cần BE:

| Endpoint gợi ý | Mô tả |
|---|---|
| `GET /admin/abuse-reports?status&page&limit` | List (status: `pending \| investigating \| resolved \| dismissed`) |
| `GET /admin/abuse-reports/count-active` | Badge trên Admin hub (pending + investigating) |
| `GET /admin/abuse-reports/:id` | Detail kèm target (property/user/review/booking) |
| `POST /admin/abuse-reports/:id/investigate` | pending → investigating |
| `POST /admin/abuse-reports/:id/dismiss` | Bỏ qua |
| `POST /admin/abuse-reports/:id/resolve` | `{ resolution, hideContent?, banUser? }` — BE thực thi moderation thật |

Sau resolve: ghi audit log (§14) + push notification `type=system` cho admin liên quan.

### 9.12 Lịch sử moderation

- **Không** ship màn audit placeholder riêng — đã xoá `moderation_audit_screen.dart`.
- Admin xem hành động kiểm duyệt qua **Thông báo → Hệ thống** (`/notifications?type=system`).
- `GET /admin/audit-log` (spec §14) vẫn **chưa integrate** — dùng khi cần tra cứu sâu (filter action, IP, date range).

---

## 10. Cấu trúc thư mục code

```
lib/
├── core/                          # Hạ tầng
│   ├── constants/
│   │   ├── api_constants.dart     # ★ Tất cả endpoint paths
│   │   └── app_constants.dart     # Enums: role, booking status...
│   ├── network/
│   │   ├── api_client.dart        # Dio + auth interceptor
│   │   └── api_response.dart      # Wrapper + parseDioError
│   ├── storage/secure_storage.dart
│   ├── services/
│   │   ├── app_version_service.dart
│   │   ├── push_notification_service.dart
│   │   └── device_id_service.dart
│   └── utils/app_router.dart      # ★ Routes + guard
│
├── data/                          # Model + repository dùng chung
│   ├── models/                    # user, room, booking, homestay, notification, calendar...
│   └── repositories/              # auth, user, booking, room, homestay, customer,
│                                  # calendar, dashboard, report, notification, device, partner
│
├── features/                      # MVC theo feature
│   ├── auth/          → login, register, splash, role picker
│   ├── customer/      → ⚠️ LEGACY out of scope B2B (sẽ gỡ)
│   ├── dashboard/     → KPI dashboard
│   ├── properties/    → CRUD property sub-screens
│   ├── rooms/         → list/detail (wrap properties API)
│   ├── bookings/      → list, detail, hold, calendar, guest flow
│   ├── calendar/      → grid calendar controller
│   ├── reports/       → báo cáo doanh thu
│   ├── verify/        → KYC + payment + subscription (7 screens)
│   ├── admin/         → users, KYC queue, trial, abuse reports (mock), role-permissions (local)
│   ├── staff/         → invite + accept
│   ├── reviews/       → list, write, reply
│   ├── notifications/ → inbox
│   └── profile/       → settings, delete account, static legal
│
├── shared/
│   ├── providers/     → theme, view mode
│   └── widgets/       → AppScaffold, loading, empty, error...
│
└── main.dart          → ProviderScope, Firebase, version check, router
```

**Luồng trace bug integration (gợi ý cho BE):**

1. Xác định màn hình / route user đang dùng (mục 4–6).
2. Tìm controller trong `features/<feature>/controllers/`.
3. Controller gọi repository nào → xem method + body trong mục 5–6.
4. Đối chiếu response shape với model trong `data/models/` hoặc `features/*/data/models/`.

---

## Phụ lục A — Mock repositories (QA)

App giữ mock song song real impl cho QA override Riverpod:

| Feature | Mock file | Real impl |
|---|---|---|
| KYC verify | `mock_verify_repository.dart` | `verify_repository_impl.dart` |
| Admin KYC | *(không có mock trong tree hiện tại)* | `admin_kyc_repository_impl.dart` |
| Admin abuse reports | `mock_abuse_report_repository.dart` | *(chưa có — chờ BE)* |

Production build mặc định trỏ **real impl** (abuse reports tạm thời chỉ có mock).

---

## Phụ lục B — Tài liệu liên quan

| File | Nội dung |
|---|---|
| `docs/API_SPEC_FULL.md` | Spec BE đầy đủ (endpoint, schema, business rules) |
| `REPORT_FE_ANDROID_2026-06-06.md` | Feedback BE → FE (patch v1.9, B2B, payment fix) |
| `CLAUDE.md` | Conventions nội bộ team mobile |
| `lib/core/constants/api_constants.dart` | Source of truth path API trên app |

---

## Phụ lục C — Trả lời câu hỏi BE (§7 REPORT_FE_ANDROID)

| # | Câu hỏi BE | Trả lời PM/FE (2026-06-06) |
|---|---|---|
| 1 | Customer mode: tách hay hoàn thiện? | **Tách.** App này thuần **B2B** — OWNER + SALE quản lý và **hold booking cho khách**. Khách **không đặt** trên app. Gỡ customer mode + không wire `customer-hold`. |
| 2 | Apple Sign-In còn giữ? | Giữ cho **login** (`POST /auth/apple`) trên iOS. Không có Apple IAP — subscription qua `bank_transfer` như Android. |
| 3 | VietQR vs STK? | FE hiển thị QR + thông tin chuyển khoản từ session; cần cùng `content` để webhook match (chi tiết khi implement payment UI). |
| 4 | Ai update doc? | FE update `docs/FE_APP_ANDROID.md` (file này) — đã sync mô hình B2B + BE v1.9 payment. |

---

*Tài liệu mô tả app Flutter mobile Halong24h — **PMS B2B**. Khi BE thay đổi contract, cập nhật song song `docs/API_SPEC_FULL.md` và báo FE sync `api_constants.dart` + models.*
