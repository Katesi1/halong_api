# Halong24h Backend — Full API Spec for Frontend

> Tài liệu chính thức cho team FE Web (Next.js admin/host) và App Mobile (Android/iOS).
> Bao gồm tất cả endpoint, schema response, business rule, WebSocket guide và integration checklist.
>
> **Cập nhật**: 2026-06-05 (v1.8 — thêm §2A Authorization rules đầy đủ cho FE) · **BE base**: NestJS 11 · **DB**: PostgreSQL + Prisma · **Auth**: JWT · **Real-time**: Socket.IO

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
    "isActive": true,
    "emailVerified": true,
    "gender": null,
    "dateOfBirth": null,
    "kycBypass": false,
    "kycStatus": "approved",
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

`permissions[]` chỉ có entries cho SALE (qua module `UserPermission`):
```json
"permissions": [
  { "module": "properties", "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false },
  { "module": "bookings",   "canCreate": true,  "canRead": true,  "canUpdate": true,  "canDelete": false }
]
```
Với ADMIN/OWNER/CUSTOMER → `permissions: []` (mảng rỗng, KHÔNG phải `undefined`).

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
| `POST /bookings/customer-hold` | Đặt phòng 24h |
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
| `POST /properties` | 403 `subscription.featureLocked` |
| `PUT /properties/:id` | 403 `subscription.featureLocked` |
| `POST /staff/invites` | 403 `subscription.featureLocked` (thay cho `staff.subscriptionRequired` cũ — không lộ trạng thái) |

SALE inherit entitlement của OWNER được gán (`user.ownerId`). Nếu OWNER hết trial → SALE cũng bị 403 generic.

**Unlock**: khi ADMIN duyệt thanh toán qua `POST /admin/users/:id/subscription/mark-paid` (luồng manual_bank/web/Google Play) → `subscriptionStatus` chuyển `active` → tất cả endpoint trên hoạt động trở lại ngay lập tức, không cần re-login.

**Note**: Các status khác (`past_due`, `cancelled`, `frozen`) cũng làm `isOwnerEntitled` trả false → cùng message `featureLocked`. Riêng `frozen` vẫn giữ logic block ở payment endpoints (existing).

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
| `POST /properties/:id/reviews` | Có booking COMPLETED tương ứng và chưa review | 400 `bookingNotCompleted` hoặc 409 `alreadyReviewed` |
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

---

## 4. Properties

Base path: `/properties`.

### 4.1 Public

| Method | Path | Query |
|---|---|---|
| `GET` | `/properties/public` | `checkinDate?, checkoutDate?, guests?, minPrice?, maxPrice?, type?, view?` — **array phẳng PropertyCardDto[]** (legacy, dùng cho mobile) |
| `GET` | `/properties/search` | Full filter + pagination + sort — **dùng cho customer web list/search** (xem §4.7) |
| `GET` | `/properties/public/:slug` | **Chi tiết phòng cho customer web** (kèm giá + host) — xem §4.11 |
| `GET` | `/properties/share/:id` | — (trả PropertyDto không kèm giá, theo `id`, dùng cho share link nội bộ) |

### 4.2 Authenticated CRUD

| Method | Path | Role |
|---|---|---|
| `GET` | `/properties?includeInactive&view` | ADMIN/OWNER/SALE |
| `GET` | `/properties/:id` | Any auth |
| `POST` | `/properties` | ADMIN/OWNER (+ permission) |
| `PATCH` | `/properties/:id` | ADMIN/OWNER/SALE (+ permission) |
| `PUT` | `/properties/:id/prices` | ADMIN/OWNER/SALE (+ permission) |
| `DELETE` | `/properties/:id` | ADMIN/OWNER (+ permission) |

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

> **Business rule (v1.9+)**: OWNER đã KYC + subscription active/trial → `POST /properties` tạo ngay `moderationStatus = "approved"`, `isActive = true` (public mặc định). OWNER tự bật/tắt `isActive` qua `PATCH /properties/:id`. ADMIN/SALE tạo thay mặt owner cũng `approved` + `isActive = true`.
> **Điều kiện tạo phòng**: KYC approved (hoặc `kycBypass`) + subscription entitled — hai cổng độc lập, không còn hàng chờ duyệt admin khi tạo mới.
> **OWNER/SALE list:** `GET /properties` tự động bao gồm property `inactive/rejected/suspended` của mình (không cần truyền `?includeInactive=true`). ADMIN/khác phải truyền `?includeInactive=true` mới thấy inactive.

**Moderation status**:
- `approved` — property được phép hoạt động; public khi `isActive = true`
- `rejected` — admin từ chối → `isActive = false`; OWNER edit lại → auto `approved`, tự bật `isActive` nếu muốn public
- `suspended` — admin tạm ngưng property đang hoạt động → `isActive = false`; OWNER **không** tự bật lại (`PATCH isActive=true` → 403); cần admin `POST /properties/:id/approve`
- `pending` — legacy (dữ liệu cũ trước v1.9); property mới không còn vào trạng thái này

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
  "bedrooms": 3, "bathrooms": 2,
  "standardGuests": 6, "maxGuests": 8,
  "floorArea": 120,
  "weekdayPrice": 2000000, "weekendPrice": 3000000, "holidayPrice": 4500000,
  "adultSurcharge": 200000, "childSurcharge": 100000,
  "amenities": ["wifi", "pool"],
  "cancellationPolicy": 1,
  "rules": "...", "services": ["..."], "description": "...",
  "checkInTime": "14:00", "checkOutTime": "12:00",
  "ratingAvg": 4.92, "reviewCount": 37,
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
  "standardGuests": 6, "maxGuests": 8,
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

**Query params** (tất cả optional):

| Param | Kiểu | Ghi chú |
|---|---|---|
| `checkinDate`, `checkoutDate` | `YYYY-MM-DD` | Loại property bị HOLD/CONFIRMED đè ngày trùng |
| `guests` | int ≥1 | `maxGuests >= guests` |
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
- Chỉ trả property `isActive=true, deletedAt=null`. Slug không tồn tại / inactive → **404**.
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

---

## 5. Bookings

Base path: `/bookings`. Auth required.

### 5.1 Endpoints

| Method | Path | Role | Body / Query |
|---|---|---|---|
| `GET` | `/bookings?propertyId&status&page&limit` | ADMIN/OWNER/SALE | — |
| `GET` | `/bookings/my-bookings?status&page&limit` | Any auth | — |
| `GET` | `/bookings/calendar/:propertyId?year&month` | ADMIN/OWNER/SALE | Lịch tháng cho 1 property |
| `GET` | `/bookings/:id` | ADMIN/OWNER/SALE | — |
| `POST` | `/bookings/hold` | ADMIN/OWNER/SALE (CUSTOMER bị chặn) | Hold 30 phút |
| `POST` | `/bookings/customer-hold` | CUSTOMER (+all) | Hold 24h |
| `PATCH` | `/bookings/:id/confirm` | ADMIN/OWNER/SALE | HOLD → CONFIRMED |
| `PATCH` | `/bookings/:id/paid` | ADMIN/OWNER/SALE | `{ amount? }` Ghi nhận thu tiền |
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

### 5.3 BookingDto

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "saleId": "uuid?",
  "customerId": "uuid?",
  "customerName": "Nguyễn Văn A",
  "customerPhone": "0901234567",
  "checkinDate": "2026-06-15",
  "checkoutDate": "2026-06-17",
  "status": 0,
  "holdExpireAt": "2026-06-04T11:00:00.000Z",
  "holdRemainingSeconds": 1700,
  "depositAmount": 500000,
  "totalAmount": 4000000,
  "paidAmount": null,
  "paidAt": null,
  "guestCount": 4,
  "notes": "...",
  "propertyName": "Villa Bãi Cháy",
  "nights": 2
}
```

Status: `0=HOLD, 1=CONFIRMED, 2=CANCELLED, 3=COMPLETED, 4=NO_SHOW`

**Status `4=NO_SHOW`** (v1.14): cron mỗi ngày 03:30 tự đánh khi booking `CONFIRMED` đã qua `checkoutDate > 24h` mà `paidAt = null` (khách không tới + không hoàn tất thanh toán tại chỗ). FE hiển thị label "Khách không đến". App mobile cũ không biết status 4 → rơi vào nhánh default; nên cập nhật bản tiếp theo để hiển thị đúng.

**Tracking cancellation** (v1.14): mọi booking ở status `CANCELLED` có thêm các field:
- `cancelledAt: ISO | null`
- `cancelledByUserId: string | null` (null = system/cron expire)
- `cancelledByRole: 0|1|2|3 | null` (0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER)
- `cancelledReason: string | null` (pass-through từ body cancel, không enforce length)

**Lưu ý nullability cho HOLD:**
- `totalAmount` = **null** khi booking ở trạng thái HOLD (BE chưa tự tính từ bảng giá lúc tạo hold). Field này chỉ được set khi `markPaid` ghi vào.
- `depositAmount` = null nếu FE không gửi field này lúc `POST /bookings/hold`.
- `paidAmount`, `paidAt` = null cho tới khi `PATCH /bookings/:id/paid`.
- FE web hiển thị: gặp `null` thì show "Chưa chốt giá" (không hardcode 0 ₫).
- **Countdown HOLD**: dùng `holdRemainingSeconds` (server-computed, đã tính cả lệch giờ client), không tự tính `holdExpireAt - Date.now()`.

### 5.3.1 GET /bookings/:id — response giàu hơn list

Detail include thêm so với item trong list:
- `property.images` — 5 ảnh đầu (sort `order` asc), không bị giới hạn `isCover`.
- `property.owner` — `{ id, name, phone }`.
- `sale` — `{ id, name, phone }` (giống list).

Các field còn lại (`holdRemainingSeconds`, `propertyName`, `nights`) tính giống list.

### 5.3.2 PATCH /bookings/:id/cancel — Email khách kèm lý do

- Body optional: `{ reason?: string }` (`MinLength=10`, `MaxLength=500` nếu gửi). Bỏ trống cũng huỷ được.
- Reason **không lưu DB** (theo yêu cầu sản phẩm) — chỉ pass-through vào:
  - Email `booking_cancelled` gửi `booking.customer.email` (nếu khách có account + có email + SMTP cấu hình). Email kèm `propertyName`, `checkinDate`, `checkoutDate`, `reason`, `owner.name`, `owner.phone` để khách tiện liên hệ lại.
  - In-app notification subtitle của customer (vd: "Villa A đã được huỷ — Chủ nhà có việc đột xuất").
- Email không chặn flow: thất bại SMTP → log, vẫn trả `cancelSuccess`.
- Booking từ luồng customer chưa có account (`customerId=null`) → bỏ qua email.

### 5.4 PATCH /bookings/:id/paid

Body optional: `{ amount? }`. Nếu bỏ trống → BE dùng `totalAmount` hoặc `depositAmount`. Nếu booking đang HOLD → tự chuyển sang CONFIRMED + clear `holdExpireAt`.

> **Phân biệt luồng thanh toán** (FE đa nền tảng phải wire đúng):
> - `PATCH /bookings/:id/paid` — **OWNER/SALE ghi nhận tiền cọc/tiền phòng của KHÁCH** (chuyển khoản tay, tiền mặt, thanh toán offline). Chỉ ảnh hưởng `Booking.paymentStatus`.
> - `POST /payments/initiate` (§10.2) — **OWNER mua/gia hạn gói subscription của hệ thống Halong24h** (VietQR). Tạo `PaymentSession`, không liên quan booking khách.
> - 2 endpoint này không thay thế nhau. Dùng đúng theo use case.

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
- Nếu không truyền `propertyId` và `propertyIds` → trả tất cả properties của user (grid) hoặc tất cả properties đang hoạt động (public-grid)

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

**Nguồn doanh thu**: aggregate `Booking.depositAmount` của booking `status ∈ {CONFIRMED, COMPLETED}` overlapping kỳ. Revenue mỗi ngày = chia đều `depositAmount / số đêm`.

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
- `noShowRate` (v1.14, đã unblock): số booking có `status=NO_SHOW` đánh trong kỳ / booking đã cọc trong kỳ. Cron mark mỗi ngày 03:30 (xem §19 enum reference).
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
| `GET` | `/notifications?type&isRead&page&limit` | List |
| `GET` | `/notifications/unread-count` | `{ count }` |
| `PATCH` | `/notifications/:id/read` | Mark 1 read |
| `PATCH` | `/notifications/read-all` | Mark all read |

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

BE gửi data-message (không phải notification message):
```json
{
  "type": "booking",
  "title": "Booking mới",
  "subtitle": "...",
  "targetId": "<bookingId>",
  "targetType": "booking",
  "notificationId": "<uuid>",
  "pushType": "booking_confirmed",
  "deepLink": "/bookings/<bookingId>"
}
```

`pushType` mới: `chat_message`, `lead_new`, `dispute_opened`, `dispute_resolved`, `subscription_frozen`, `subscription_price_changed`, ...

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
`user.delete`, `user.kyc_bypass_toggle`,
`subscription.trial_grant`, `subscription.trial_revoke`, `subscription.set_price`, `subscription.mark_paid`, `subscription.freeze`, `subscription.unfreeze`,
`review.hide`, `review.restore`,
`kyc.approve`, `kyc.reject`,
`dispute.investigate`, `dispute.resolve`, `dispute.reject`,
`booking.mark_paid`.

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

15 template keys: `welcome_owner`, `welcome_sale`, `password_reset`, `booking_confirmed`, `booking_cancelled`, `booking_paid`, `kyc_approved`, `kyc_rejected`, `staff_invite`, `subscription_due`, `subscription_overdue`, `subscription_paid`, `dispute_opened`, `review_received`, `property_approved`.

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
- **Offline → FCM**: nếu recipient không có socket nào active, BE tự gửi FCM push với `pushType: "chat_message"` và `deepLink: "/conversations/:id"`.
- **Multi-device**: tất cả socket của 1 user đều nhận → đồng bộ web + mobile.
- **Retention 180 ngày**: cron 3AM xoá messages cũ. Conversation có `hasDispute=true` được giữ.
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

**Android**:
- [ ] `io.socket:socket.io-client:2.x`
- [ ] Connection trong service singleton, refresh token khi cần
- [ ] FCM handler `chat_message` → mở conversation deeplink
- [ ] Khi mở chat: REST history → join WS events

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
- [ ] Refresh-token interceptor (401 → refresh → retry, 401 lần 2 → logout)
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
- [ ] Authenticator xử lý 401 → refresh
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
| Wire chat retention | Khi message bị purge 180-day → tự xoá attachment Cloudinary tương ứng |

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

`bookingCount` = `saleBookings` + `customerBookings` (tổng booking user là sale hoặc khách).
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
- `/admin/subscriptions`, `/admin/disputes`, `/admin/audit-log`, `/admin/reviews`, `/conversations`, `/notifications`, `/bookings/my-bookings`, `/leads`

**Shape B** — array trực tiếp + `meta`:
- `/bookings` → `data: BookingDto[], meta: { total, page, limit }`

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
| **Cron retention chat** (mỗi ngày 3AM) | Khi message bị purge (> 180 ngày, không có dispute) → tự gọi `uploadsService.deleteByMessageIds()` để xoá attachment Cloudinary tương ứng |

### 23.7 Storage stack

- **Cloudinary** — đã có sẵn (dùng cho property images + KYC). Reuse, không thêm dep
- URL format: `https://res.cloudinary.com/<cloud_name>/image/upload/.../...` (image) hoặc `.../raw/upload/...` (PDF)
- **Public-read** (không signed URL ngắn hạn) — message URL phải xem được mãi (180 ngày retention)
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

> **Phiên bản tài liệu**: v1.8 — 2026-06-05 (Authorization rules). Mọi thay đổi schema/endpoint vui lòng cập nhật file này và thông báo team FE qua channel chung.
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
| 1 | `PATCH /auth/profile` | **NEW** | `PATCH /auth/profile` | Body whitelist 3 field |
| 2 | `PATCH /admin/users/:id/role` | EXISTS | `PATCH /users/:id/role` | KHÔNG có prefix `/admin` — đổi URL |
| 3 | `GET /guests` | **NEW** | `GET /guests`, `GET /guests/:id` | Derive từ User role=CUSTOMER |
| 4 | `GET /subscriptions/me/invoices` | **NEW** | `GET /subscriptions/me/invoices` | Source: PaymentSession |
| 5 | `POST /admin/subscriptions/:id/call-log` | **NEW** | `POST + GET /admin/subscriptions/:id/call-log` | `:id` là userId của OWNER |
| 6 | `POST /calendar/bulk-lock` | EXISTS | `POST /calendar/bulk` | Body khác: `{ mode, items: [{propertyId, date}] }` |
| 7 | `GET /users?withStats=true` | EXPANDED | `GET /users?withStats=true` | Đã thêm `stats.disputeCount` + `lastActiveAt` |
| 8 | `GET /admin/disputes/:id` | EXPANDED | `GET /admin/disputes/:id` | Đã thêm `evidence`, `verdict`, `chatExcerpts`, `penalty` |
| 9 | `GET /admin/kyc/:id` | **NEW** | `GET /admin/kyc/:id` | Trả `verificationFields` (7 mục) |

### 25.2 #1 — `PATCH /auth/profile`

User tự sửa hồ sơ cá nhân. Whitelist 3 field. Không cho đổi role/password.

**Auth**: Bearer.

**Body** (tất cả optional, ít nhất 1 field):
```json
{ "fullName": "Nguyễn Văn A", "email": "new@example.com", "phone": "0901234567" }
```

Validate:
- `fullName`: string ≥ 1 ký tự (BE map sang `User.name`)
- `email`: định dạng email
- `phone`: 10 số bắt đầu `0`

**Response 200**: shape giống `GET /auth/profile` (full ProfileDto).

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
