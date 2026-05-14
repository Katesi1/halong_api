# Halong24h Backend — API Reference & System Overview

> Tài liệu tổng hợp toàn bộ endpoint, business logic, schema, cron job, webhook
> của BE NestJS để FE / partner / dev mới onboard nhanh.
>
> **Base URL (production)**: `https://api.halong24h.com`
> **Swagger UI**: `https://api.halong24h.com/index.html`
> **Tech**: NestJS 11 · TypeScript 5.7 · PostgreSQL + Prisma · Redis · JWT
> **Cập nhật**: 2026-05-10

---

## 🆕 Changelog 2026-05-10 — align với APP_SPEC

| # | Thay đổi | Section |
|---|---|---|
| ✅ | `POST /auth/apple` (Apple Sign-In iOS, Apple Guideline 4.8) | [5.8](#58-post-authapple--ios-only) |
| ✅ | `DELETE /users/me` (self-delete, compliance Apple/Google/GDPR) | [8](#8-users--permissions) |
| ✅ | `GET /app/version` (force-update check) + `POST /admin/app-version` | [16.7](#167-app-version-force-update-check) |
| ✅ | `GET /bookings/calendar/:propertyId?year=&month=` (calendar grid theo property) | [11](#11-bookings) |
| ✅ | Phone regex tighten: `^0\d{9}$` (chính xác 10 số) | applies tới `/auth/register` + `/staff/invites/accept` |
| ✅ | `/auth/forgot-password` rate limit **5 req / giờ / IP** | [23.2](#232-per-route-limits) |
| ⚠️ | Customer hold TTL = **24 giờ** (BE giữ business rule, FE update spec section 15.1) | [11.2](#112-hold-logic) |
| 🆕 | Schema thêm `users.appleSub` + bảng `app_versions` | [21](#21-database-schema) |
| 🆕 | ENV thêm `APPLE_CLIENT_ID` (iOS bundle ID) | [22](#22-environment-variables) |

> 🔒 **BE đã verify** mọi điểm trong APP_SPEC Section 17 checklist — xem [Phụ lục](#phụ-lục--checklist-app_spec).

---

## Mục lục

1. [Quy ước chung](#1-quy-ước-chung)
2. [Authentication & JWT](#2-authentication--jwt)
3. [Phân quyền & Role](#3-phân-quyền--role)
4. [Enum reference](#4-enum-reference)
5. [Auth endpoints](#5-auth-endpoints) — Login/Register/Google/**Apple (mới)**
6. [Devices & Push notification](#6-devices--push-notification)
7. [Notifications](#7-notifications)
8. [Users & Permissions](#8-users--permissions) — gồm **DELETE /users/me (mới)**
9. [Staff Invite Flow](#9-staff-invite-flow)
10. [Properties](#10-properties)
11. [Bookings](#11-bookings) — gồm **/bookings/calendar/:propertyId (mới)**
12. [Calendar](#12-calendar)
13. [Reviews](#13-reviews)
14. [KYC (User)](#14-kyc-user)
15. [KYC Admin](#15-kyc-admin)
16. [Billing & Payment + App Version](#16-billing--payment) — gồm **16.7 App Version (mới)**
17. [Dashboard & Reports](#17-dashboard--reports)
18. [Partner API](#18-partner-api)
19. [Webhooks](#19-webhooks)
20. [Cron jobs](#20-cron-jobs)
21. [Database schema](#21-database-schema)
22. [Environment variables](#22-environment-variables)
23. [Anti-spam & Rate limiting](#23-anti-spam--rate-limiting)

---

## 1. Quy ước chung

### 1.1 Response thành công
```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```
Tất cả service trả `{ message, data }` rồi `ResponseInterceptor` (global) wrap thành object trên.

### 1.2 Response lỗi
```json
{
  "success": false,
  "statusCode": 400,
  "message": "...",
  "errors": null,
  "path": "/endpoint",
  "timestamp": "2026-05-09T10:00:00.000Z"
}
```

### 1.3 HTTP Status Codes thường dùng
| Code | Ý nghĩa |
|---|---|
| 200 | OK (GET / PATCH / DELETE) |
| 201 | Created (POST tạo resource mới) |
| 400 | Validation fail / dữ liệu sai |
| 401 | Chưa login / token sai |
| 403 | Không có quyền / role không match |
| 404 | Resource không tồn tại |
| 409 | Conflict (duplicate, đã tồn tại, ...) |
| 410 | Gone (token expire / invite hết hạn) |
| 429 | Too Many Requests (anti-spam) |
| 500 | Server error |

### 1.4 Headers chuẩn
| Header | Khi dùng | Mô tả |
|---|---|---|
| `Authorization: Bearer <token>` | Endpoint cần auth | Access token (TTL 15 phút) |
| `Accept-Language: vi` hoặc `en` | Optional | Ngôn ngữ response (default: `en`) |
| `Content-Type: application/json` | POST/PUT/PATCH | Body JSON |
| `X-Device-Id: <id>` | `/auth/register`, `/auth/google` | Anti-spam tracking (Flutter `device_info_plus`) |
| `X-Partner-Key: <key>` | `/partner/*` | API key đối tác |

### 1.5 CORS đang allow
- Origin: `*` (dev), bắt buộc whitelist khi prod cứng
- Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
- Headers: `Content-Type, Authorization, X-Partner-Key, X-Device-Id, Accept-Language`

---

## 2. Authentication & JWT

### 2.1 Token structure
- **Access token**: JWT secret = `JWT_SECRET`, **TTL 15 phút (900s)**
  ```json
  { "sub": "<userId>", "email": "...", "role": 0..3, "iat": ..., "exp": ... }
  ```
- **Refresh token**: JWT secret = `JWT_REFRESH_SECRET`, **TTL 7 ngày (604800s)**
  - Hash bcrypt(10) lưu vào `users.refreshToken`
  - **1 token per user** — login mới ghi đè token cũ ⇒ effective single-device sau khi access token cũ expire (≤15 phút)

### 2.2 Flow
```
POST /auth/login | /auth/google | /auth/register
   → { accessToken, refreshToken, user }

[Sau 15 phút access expired]
POST /auth/refresh { refreshToken }
   → { accessToken, refreshToken } (rotation)

POST /auth/logout (Bearer)
   → set users.refreshToken = NULL
```

### 2.3 Global guards
Đặt trong `app.module.ts` (apply cho mọi endpoint):
1. `JwtAuthGuard` — bypass khi có `@Public()` decorator
2. `RolesGuard` — check `@Roles(...)` decorator
3. `PermissionGuard` — check `@Permission(module, action)` decorator (chỉ áp dụng nơi có decorator)
4. `ThrottlerGuard` — global 100 req / 60s, override per-route bằng `@Throttle({...})`

---

## 3. Phân quyền & Role

### 3.1 4 roles
| Role | Code | Mô tả | Cách tạo |
|---|:---:|---|---|
| ADMIN | 0 | Quản trị toàn hệ thống | Seed DB only |
| OWNER | 1 | Chủ homestay/villa, có KYC + subscription | Self-register |
| SALE | 2 | Nhân viên, gắn với 1 OWNER qua `ownerId` | Accept invite từ OWNER |
| CUSTOMER | 3 | Khách đặt phòng | Self-register |

### 3.2 Bảng quyền chính
| Chức năng | ADMIN | OWNER | SALE | CUSTOMER |
|---|:---:|:---:|:---:|:---:|
| Login (mọi cách) | ✅ | ✅ | ✅ | ✅ |
| Self-register | ❌ (seed) | ✅ | ❌ (qua invite) | ✅ |
| Quản lý users | ✅ | ❌ | ❌ | ❌ |
| Quản lý properties | ✅ | ✅ (own) | ✅ (own owner's) | ❌ |
| Quản lý bookings | ✅ | ✅ (own) | ✅ (own owner's) | ❌ |
| Customer đặt/huỷ booking | ❌ | ❌ | ❌ | ✅ |
| Tạo review | ❌ | ❌ | ❌ | ✅ |
| Reply review | ✅ | ✅ (own) | ❌ | ❌ |
| Mời SALE | ❌ | ✅ (KYC + sub) | ❌ | ❌ |
| Approve KYC | ✅ | ❌ | ❌ | ❌ |
| Xem reports | ✅ | ✅ (own) | ✅ (own owner's) | ❌ |

### 3.3 Data scoping cho SALE
SALE có `ownerId` trỏ về OWNER → tự động scope dữ liệu qua helper `getEffectiveOwnerId(user)`:
- ADMIN: `null` → thấy tất cả
- OWNER: `user.id` → thấy data của mình
- SALE: `user.ownerId` (hoặc UNASSIGNED nếu chưa gán) → thấy data của OWNER mình

### 3.4 Granular permissions (UserPermission)
Bên cạnh role, ADMIN có thể cấp/thu hồi permission CRUD cho user theo từng module:
- Modules: `properties`, `bookings`, `calendar`, `reviews`
- Actions: `canCreate`, `canRead`, `canUpdate`, `canDelete`
- Default: `canRead = true`, các action khác `false`
- Endpoint quản lý: `GET /permissions/:userId`, `PUT /permissions/:userId`

---

## 4. Enum reference

| Enum | Giá trị (integer) |
|---|---|
| **Role** | `0`=ADMIN, `1`=OWNER, `2`=SALE, `3`=CUSTOMER |
| **Booking Status** | `0`=HOLD, `1`=CONFIRMED, `2`=CANCELLED, `3`=COMPLETED |
| **Property Type** | `0`=VILLA, `1`=HOMESTAY, `2`=HOTEL |
| **Cancellation Policy** | `0`=FLEXIBLE, `1`=MODERATE, `2`=STRICT |
| **Notification Type** (DB) | `0`=BOOKING, `1`=PAYMENT, `2`=SYSTEM |
| **Calendar Lock** | `0`=LOCKED, `1`=HOLD, `2`=BOOKED |
| **Gender** | `0`=MALE, `1`=FEMALE, `2`=OTHER |

| Enum | Giá trị (string) |
|---|---|
| **KYC Status** | `none`, `pending`, `approved`, `rejected` |
| **KYC Submission Status** | `draft`, `kyc_submitted`, `payment_pending`, `awaiting_approval`, `approved`, `rejected`, `refunded` |
| **Subscription Status** | `none`, `trial`, `active`, `past_due`, `cancelled` |
| **Payment Status** | `pending`, `paid`, `failed`, `expired`, `refunded` |
| **Payment Kind** | `subscription`, `renew`, `upgrade`, `refund` |
| **Payment Method** | `vnpay_qr`, `bank_transfer`, `card` |
| **Payment Provider** | `vnpay`, `casso`, `sepay`, `manual_bank` |
| **Push Notification Type** | `booking_created`, `booking_confirmed`, `booking_cancelled`, `payment_succeeded`, `payment_failed`, `kyc_approved`, `kyc_rejected`, `staff_invite_accepted`, `staff_removed` |

---

## 5. Auth endpoints

Base: `/auth`

### 5.1 Public (không cần token)

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/register` | Tự đăng ký OWNER hoặc CUSTOMER (anti-spam: 5/h/IP, 3/24h/deviceId) |
| POST | `/auth/login` | Email + password |
| POST | `/auth/google` | Google ID token + role (xem 5.4) |
| POST | `/auth/apple` | Apple ID token + role (xem 5.5) — iOS only |
| POST | `/auth/refresh` | Đổi refresh token lấy access mới |
| POST | `/auth/forgot-password` | Gửi mã đặt lại (rate limit 5/h/IP) |
| POST | `/auth/reset-password` | Reset bằng token JWT |

### 5.2 Cần Bearer token

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/logout` | Clear refresh token DB |
| GET | `/auth/profile` | Lấy thông tin user hiện tại (kèm permissions) |
| POST | `/auth/change-password` | Đổi mật khẩu (cần `currentPassword`) |

### 5.3 User shape chuẩn (login/register/google trả cùng format)
```json
{
  "id": "uuid",
  "name": "Nguyen Van A",
  "email": "a@gmail.com",
  "avatar": "https://...",
  "phone": "0901234567",
  "role": 3,
  "ownerId": null,
  "isActive": true,
  "emailVerified": true,
  "kycStatus": "none",
  "subscriptionStatus": "none",
  "trialEndsAt": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```
`/auth/profile` trả thêm: `gender, dateOfBirth, kycBypass, subscriptionPlanId, subscriptionCycle, nextChargeAt, permissions[]`.

### 5.4 POST `/auth/google` — 4 case response

| Case | HTTP | Body |
|---|---|---|
| Existing user login | 200 | `{ accessToken, refreshToken, user }` |
| New user + role hợp lệ (1=OWNER hoặc 3=CUSTOMER) | 200 | `{ accessToken, refreshToken, user }` (đã tạo user) |
| **New user + thiếu role** | **200** | `{ isNewUser: true, googleProfile: { email, name, avatar, sub } }` ← FE phải push role picker screen |
| Token sai / email chưa verified | 401 | error |
| `role=0` (ADMIN) | 403 | "Không thể đăng ký role admin qua Google" |
| `role=2` (SALE) | 403 | "SALE phải accept invite từ OWNER" |
| `role` ngoài {0,1,2,3} | 400 | "Role không hợp lệ" |
| Account `isActive=false` | 403 | "Tài khoản đã bị vô hiệu hoá" |

**Verify logic** (BE):
- `verifyIdToken({ audience: GOOGLE_OAUTH_WEB_CLIENT_ID })` — sai audience = 401
- `email_verified === true` — false = 401
- Lookup `googleSub` trước, fallback `email` (auto-link Google vào account email cũ)
- Set `emailVerified=true` + `avatar` từ Google `picture`

### 5.5 POST `/auth/register`

Body:
```json
{
  "name": "Nguyen Van A",
  "email": "a@example.com",
  "password": "matkhau123",
  "role": 3,         // 1=OWNER, 3=CUSTOMER (2 SALE bị reject)
  "phone": "0912345678"
}
```
Header optional: `X-Device-Id`. Anti-spam threshold 3 account/24h/deviceId, 10/24h/IP.

### 5.6 POST `/auth/login`
```json
{ "email": "a@example.com", "password": "matkhau123" }
```

### 5.7 POST `/auth/refresh`
```json
{ "refreshToken": "eyJ..." }
```
→ `{ accessToken, refreshToken }` (rotation, refresh cũ invalidate)

### 5.8 POST `/auth/apple` — iOS only

Apple Sign-In flow (Apple Guideline 4.8). Logic giống `/auth/google` nhưng có 2 khác biệt:

1. **Apple chỉ trả `email + name` ở LẦN ĐẦU user authorize** — sau đó chỉ có `idToken + sub`
2. FE phải **cache** `email + name` từ lần đầu, gửi kèm body các lần sau (best-effort)
3. Verify `audience` = `APPLE_CLIENT_ID` (iOS bundle ID), không phải Web Client ID

Body:
```json
{
  "idToken": "eyJ...",
  "role": 3,                       // optional, 1=OWNER hoặc 3=CUSTOMER
  "email": "user@privaterelay...", // optional, FE cache từ lần đầu
  "name": "Nguyen Van A",          // optional, FE cache từ lần đầu
  "authorizationCode": "...",      // optional, dùng cho Apple revoke flow
  "platform": "ios"
}
```

Header optional: `X-Device-Id`. Anti-spam threshold giống Google.

Response — 4 case giống `/auth/google`:
- Existing user → 200 `{ accessToken, refreshToken, user }`
- New user + role hợp lệ → 200 (đã tạo user)
- New user + thiếu role → 200 `{ isNewUser: true, appleProfile: { email, name, sub } }`
- Errors: 401 (token sai), 400 (Apple không trả email + FE không cache), 403 (role=0/2 hoặc account disabled)

---

## 6. Devices & Push notification

Base: `/devices` — mọi endpoint đều cần Bearer token.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/devices` | Register FCM token sau login (idempotent) |
| DELETE | `/devices/:token` | Unregister khi logout (URL-encode token!) |
| GET | `/devices` | List device của user (cho UX "Quản lý thiết bị") |

### 6.1 POST `/devices`
```json
{
  "fcmToken": "fXKnT4...:APA91b...",
  "platform": "ios",            // bắt buộc: ios | android
  "deviceModel": "iPhone 13",   // optional
  "osVersion": "17.4",          // optional
  "appVersion": "1.0.2",        // optional
  "locale": "vi"                // optional: vi | en
}
```
Response 200: `{ id, platform, lastActiveAt }`. **Idempotent**: gọi lại với cùng token chuyển ownership sang user hiện tại.

### 6.2 DELETE `/devices/:token`
Path param phải URL-encode (token chứa `:`). Idempotent — không tồn tại cũng trả 200.

### 6.3 Push payload format BE gửi qua FCM

```json
{
  "notification": {
    "title": "Đặt phòng mới",
    "body": "Khách Nguyễn A đã đặt phòng (15/05 → 17/05)"
  },
  "data": {
    "type": "booking_created",
    "deepLink": "/bookings/<uuid>",
    "targetId": "<uuid>"
  },
  "android": { "priority": "high", "notification": { "sound": "default" } },
  "apns": { "payload": { "aps": { "sound": "default", "badge": 1 } } }
}
```

### 6.4 Bảng 9 push types đã hook

| `data.type` | Trigger | Người nhận | `data.deepLink` |
|---|---|---|---|
| `booking_created` | Staff `POST /bookings/hold` | OWNER | `/bookings/:id` |
| `booking_created` | Customer `POST /bookings/customer-hold` | OWNER | `/bookings/:id` |
| `booking_confirmed` | Staff `PATCH /bookings/:id/confirm` | OWNER + CUSTOMER | OWNER: `/bookings/:id`, CUSTOMER: `/my-bookings` |
| `booking_cancelled` | Staff `PATCH /bookings/:id/cancel` | OWNER + CUSTOMER (nếu có) | OWNER: `/bookings/:id`, CUSTOMER: `/my-bookings` |
| `booking_cancelled` | Customer `PATCH /bookings/:id/customer-cancel` | OWNER | `/bookings/:id` |
| `payment_succeeded` | KYC payment paid (VNPay / Bank webhook) | User | `/my-bookings` |
| `payment_succeeded` | Renew payment paid | User | `/my-bookings` |
| `payment_failed` | VNPay IPN báo fail | User | `/my-bookings` |
| `kyc_approved` | Admin `POST /admin/kyc/submissions/:id/approve` | OWNER | `/dashboard` |
| `kyc_rejected` | Admin `POST /admin/kyc/submissions/:id/reject` | OWNER | `/verify/rejected` |
| `staff_invite_accepted` | SALE `POST /staff/invites/accept` | OWNER | `/staff/manage` |
| `staff_removed` | OWNER `DELETE /staff/:userId` | SALE bị xoá | `/login` (FE detect → force logout) |

### 6.5 Behavior
- **Multi-token per user** — 1 user có iPad + iPhone đều nhận push
- **Auto-cleanup**: token bị Firebase trả `messaging/registration-token-not-registered` → BE xoá khỏi DB
- **Push fail không ảnh hưởng business flow** — booking vẫn confirm dù push fail
- **DB notification luôn có** — kể cả khi push không gửi được, user vẫn xem được trong app qua `GET /notifications`

---

## 7. Notifications

Base: `/notifications` — cần Bearer.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/notifications` | List notification của user |
| GET | `/notifications/unread-count` | Số notification chưa đọc |
| PATCH | `/notifications/:id/read` | Mark 1 notification đã đọc |
| PATCH | `/notifications/read-all` | Mark all đã đọc |

`type` trong response trả string: `booking | payment | system`.

---

## 8. Users & Permissions

Base: `/users` — cần Bearer (mọi endpoint).

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/users` | ADMIN | List users (filter `?role=`) |
| GET | `/users/available-staff` | ADMIN, OWNER | List SALE chưa thuộc owner nào |
| GET | `/users/my-staff` | OWNER | List SALE thuộc owner hiện tại |
| GET | `/users/:id` | ADMIN, OWNER | Detail (OWNER chỉ xem SALE của mình) |
| POST | `/users` | ADMIN | Tạo user mới |
| POST | `/users/my-staff` | OWNER | Add SALE đã tồn tại vào team (theo email) |
| PUT | `/users/:id` | All (self) / ADMIN (any) | Update — non-admin chỉ sửa được `name, phone, email, gender, dateOfBirth` |
| PATCH | `/users/:id/kyc-bypass` | ADMIN | Bật/tắt `kycBypass` — cho OWNER skip KYC để quản lý property |
| **DELETE** | **`/users/me`** | **All authed** | **Self-delete** (compliance Apple/Google/GDPR). Body `{ reason? }` (max 200 chars). Soft-delete + free email/phone unique để re-register ngay |
| DELETE | `/users/:id` | ADMIN | Soft delete (`deletedAt = now`) |
| DELETE | `/users/my-staff/:id` | OWNER | Gỡ SALE khỏi team (set `ownerId = null`, không xoá user) |

> **Lưu ý**: `/users/my-staff` (POST) khác `/staff/invites` — endpoint cũ này add SALE đã có account, endpoint mới invite user **chưa có account** qua email. Cả 2 cùng tồn tại.

### 8.1 Permissions

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/permissions/:userId` | ADMIN | Lấy permissions của user theo module |
| PUT | `/permissions/:userId` | ADMIN | Bulk upsert permissions |

PUT body:
```json
{
  "permissions": [
    { "module": "properties", "canCreate": true, "canRead": true, "canUpdate": true, "canDelete": false },
    { "module": "bookings",   "canCreate": false, "canRead": true, "canUpdate": true, "canDelete": false }
  ]
}
```

---

## 9. Staff Invite Flow

Base: `/staff` — flow mời SALE qua email.

### 9.1 Endpoints

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/staff/invites` | OWNER | Tạo invite (gửi email + trả `inviteLink + shortCode`) |
| GET | `/staff/invites?status=` | OWNER | List invite (`pending\|accepted\|expired\|cancelled\|all`) |
| DELETE | `/staff/invites/:id` | OWNER | Huỷ invite (chỉ pending) |
| GET | `/staff/invites/verify/:token` | **Public** | Verify token / shortCode (rate limit 10/phút/IP) |
| POST | `/staff/invites/accept` | **Public** | Accept invite — tạo SALE account, trả tokens |
| GET | `/staff?isActive=` | OWNER | List SALE hiện tại (default `isActive=true`) |
| DELETE | `/staff/:userId` | OWNER | Soft-delete SALE + revoke session + push `staff_removed` |

### 9.2 POST `/staff/invites`
Body: `{ "email": "nv1@gmail.com" }`

Validate ở service:
- OWNER phải có `kycStatus === 'approved'` HOẶC `kycBypass = true`
- `subscriptionStatus IN ('trial', 'active')`
- Email chưa có account (`deletedAt = null`)
- Chưa có invite `status='pending'` còn hạn

Response 201:
```json
{
  "data": {
    "invite": { "id", "email", "shortCode": "HL-XXXXXX", "status": "pending", "expiresAt", "createdAt" },
    "inviteLink": "https://halong24h.com/staff/accept?token=<64-hex>",
    "emailSent": true
  }
}
```

### 9.3 GET `/staff/invites/verify/:token`
Path param có thể là **token đầy đủ (64 hex)** hoặc **shortCode `HL-XXXXXX`** — BE auto-detect.

Response: `{ email, owner: { name, avatar, homestayName }, expiresAt, status }`

### 9.4 POST `/staff/invites/accept`
2 method:

**Cách A — Google**:
```json
{ "token": "HL-XXXXXX", "method": "google", "idToken": "eyJ..." }
```
Email Google **bắt buộc khớp** với invite.email.

**Cách B — Password**:
```json
{
  "token": "HL-XXXXXX",
  "method": "password",
  "name": "Nguyen Van B",
  "password": "MatKhau123!",
  "phone": "0901234567"
}
```
Email lấy từ invite.email. Password ≥ 8 ký tự, phone format `0\d{9}`.

Response 200: `{ accessToken, refreshToken, user }` (giống `/auth/login` shape, role=2 SALE).

### 9.5 Token & shortCode
- **Token**: 64 hex chars (32 random bytes) — dùng cho universal link
- **ShortCode**: `HL-XXXXXX` (6 chars, alphabet bỏ I/O/0/1) — nhập tay
- **TTL**: 7 ngày
- Auto-expire stale `pending` invites khi user gọi verify (sau hạn)

### 9.6 Email service
- SMTP: Gmail App Password (`smtp.gmail.com:587`)
- ENV: `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Nếu SMTP credentials thiếu → BE log warn, vẫn trả `inviteLink + shortCode` để OWNER share thủ công (không break flow)

---

## 10. Properties

Base: `/properties` — JWT + RolesGuard.

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/properties/public` | Public | List property công khai (filter date/guests/price/type/view) |
| GET | `/properties/share/:id` | Public | Detail share link (giấu giá) |
| GET | `/properties` | ADMIN, OWNER, SALE | List (scope theo `getEffectiveOwnerId`) |
| GET | `/properties/:id` | Bất kỳ user đã login | Detail |
| POST | `/properties` | ADMIN, OWNER | Tạo property + notify ADMIN |
| PATCH | `/properties/:id` | ADMIN, OWNER, SALE | Update partial |
| DELETE | `/properties/:id` | ADMIN, OWNER | Soft delete |
| PUT | `/properties/:id/prices` | ADMIN, OWNER, SALE | Update prices (`weekday/weekend/holiday/adultSurcharge/childSurcharge`) |
| POST | `/properties/:id/images` | ADMIN, OWNER, SALE | Upload max 20 ảnh JPG/PNG/WEBP, max 10MB/file |
| DELETE | `/properties/:id/images/:imageId` | ADMIN, OWNER, SALE | Xoá ảnh |
| PATCH | `/properties/:id/images/:imageId/cover` | ADMIN, OWNER, SALE | Set ảnh bìa |

### 10.1 Property fields
```
id, ownerId, name, type, code (unique),
view ("sea" | "city" | null),
address, latitude, longitude, mapLink,
bedrooms, bathrooms, standardGuests, maxGuests,
weekdayPrice, weekendPrice, holidayPrice,
adultSurcharge, childSurcharge,
amenities[], cancellationPolicy, rules, services[], description,
checkInTime ("14:00"), checkOutTime ("12:00"),
isActive, createdAt, updatedAt, deletedAt
```

### 10.2 Image upload
- multipart/form-data, field name **`images`**
- MIME: chỉ `image/jpeg`, `image/png`, `image/webp`
- Upload lên Cloudinary, lưu `imageUrl + publicId + isCover + order`
- Ảnh đầu tiên auto set `isCover = true` nếu chưa có cover

---

## 11. Bookings

Base: `/bookings` — JWT.

### 11.1 Endpoints

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/bookings` | ADMIN, OWNER, SALE | List (filter `propertyId, status`) |
| GET | `/bookings/my-bookings` | All authenticated | Booking của customer hiện tại |
| GET | `/bookings/calendar/:propertyId?year=&month=` | ADMIN, OWNER, SALE | Lịch booking 1 property theo tháng (`days[]` với status: `available\|locked\|hold\|booked` + `bookingId` + `note`) |
| GET | `/bookings/:id` | ADMIN, OWNER, SALE | Detail |
| POST | `/bookings/hold` | All (cần `bookings:create`) | Staff giữ chỗ 30 phút (Redis hold) |
| POST | `/bookings/customer-hold` | All authenticated | Customer giữ chỗ 24 giờ |
| PATCH | `/bookings/:id/confirm` | ADMIN, OWNER, SALE | Xác nhận booking → status CONFIRMED |
| PATCH | `/bookings/:id/cancel` | ADMIN, OWNER, SALE | Huỷ booking |
| PATCH | `/bookings/:id/customer-cancel` | All authenticated | Customer huỷ (chỉ HOLD, không huỷ được CONFIRMED) |
| PUT | `/bookings/:id` | ADMIN, OWNER, SALE | Update partial |

### 11.2 Hold logic
- **Staff hold**: `holdExpireAt = now + 30 phút`, ID lưu vào Redis
- **Customer hold**: `holdExpireAt = now + 24 giờ`
- **Cron job mỗi phút** (`expireHoldBookings`): scan booking `status=HOLD AND holdExpireAt < now` → set CANCELLED + delHold Redis
- Response trả `holdRemainingSeconds = max(0, (holdExpireAt - now) / 1000)`

### 11.3 Validation
- `checkoutDate > checkinDate` (else 400)
- `checkinDate >= now` (else 400 "không thể trong quá khứ")
- Conflict check: scan booking `status IN (HOLD, CONFIRMED)` overlap khoảng date → 409
- Calendar lock conflict: scan `calendar_locks` overlap → 409

### 11.4 Booking fields
```
id, propertyId, saleId, customerId,
customerName, customerPhone (cho walk-in không có account),
checkinDate, checkoutDate,
status (HOLD/CONFIRMED/CANCELLED/COMPLETED),
holdExpireAt, depositAmount, guestCount, notes,
createdAt, updatedAt
```

---

## 12. Calendar

Base: `/calendar`.

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| GET | `/calendar/properties` | ADMIN, OWNER, SALE | List property cho calendar (filter `type, ownerId`) |
| GET | `/calendar/public-grid` | Public | Lịch tổng public, không cần auth |
| GET | `/calendar/grid` | ADMIN, OWNER, SALE | Lịch quản lý — scope theo user, có thêm `note` (tên khách) |
| POST | `/calendar/lock` | ADMIN, OWNER, SALE | Khoá ngày (`{ propertyId, date, status }`) |
| DELETE | `/calendar/lock` | ADMIN, OWNER, SALE | Mở khoá ngày |
| PATCH | `/calendar/sold` | ADMIN, OWNER, SALE | Đánh dấu ngày đã bán |
| GET | `/calendar/admin-contact` | Public | Thông tin liên hệ admin |

### 12.1 Grid response
Mỗi property có mảng `days[]`:
```json
{
  "date": "2026-05-15",
  "status": 0,         // 0=AVAILABLE, 1=LOCKED, 2=HOLD, 3=BOOKED
  "note": "Khách Nguyễn A"  // chỉ /grid (auth), không có ở /public-grid
}
```

---

## 13. Reviews

Base path mixed (`/properties/:id/reviews`, `/admin/reviews/:id`). JWT.

| Method | Path | Role | Mô tả |
|---|---|---|---|
| POST | `/properties/:id/reviews` | CUSTOMER | Tạo review (booking phải COMPLETED + chưa review) |
| GET | `/properties/:id/reviews` | Public | List reviews (filter `page, pageSize, sort, minRating`) |
| POST | `/properties/:id/reviews/:reviewId/reply` | ADMIN, OWNER | Owner reply review |
| DELETE | `/admin/reviews/:reviewId` | ADMIN | Ẩn review (set `isHidden=true`) |

### 13.1 Review schema
6 score fields, mỗi score 1-5 integer:
- `cleanliness, location, amenities, service, value, accuracy`
- `avgRating = sum / 6.0` (auto compute)
- `comment` (text), `photos` (Json array URLs)
- `ownerReply, ownerReplyAt`
- `isHidden, hiddenReason` (admin moderation)

### 13.2 Sort options
`newest | oldest | highest | lowest`

---

## 14. KYC (User)

Base: `/kyc` — JWT + role OWNER.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/kyc/upload-cccd-front` | Multipart `image` (max 5MB) + `ocrResult` JSON string |
| POST | `/kyc/upload-cccd-back` | Như trên |
| POST | `/kyc/upload-selfie` | Multipart `image`, dùng face match |
| POST | `/kyc/submit` | Submit hồ sơ chờ duyệt (status `kyc_submitted`) |
| GET | `/kyc/status` | KYC status hiện tại |
| GET | `/kyc/submissions/:id` | Detail submission (ADMIN hoặc owner) |
| POST | `/kyc/submissions/:id/resubmit` | Resubmit các item bị reject |

### 14.1 Submission lifecycle
```
draft
   ↓ (upload đủ 3 ảnh + submit)
kyc_submitted
   ↓ (BE link với payment session — Owner trả phí trial 7 ngày)
payment_pending → paid → awaiting_approval
   ↓ (Admin duyệt)
approved | rejected
   ↓ (rejected có thể resubmit)
   ↓ (refunded nếu refund subscription)
```

### 14.2 Required uploads (3 type)
- `cccd_front`, `cccd_back`, `selfie` (mỗi type 1 ảnh duy nhất, upsert by submission + type)

---

## 15. KYC Admin

Base: `/admin/kyc` — JWT + role ADMIN.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/admin/kyc/queue?status=&page=&pageSize=` | Queue chờ duyệt (default `awaiting_approval`) |
| POST | `/admin/kyc/submissions/:id/approve` | Body `{ trialDays }` — duyệt + tạo subscription trial |
| POST | `/admin/kyc/submissions/:id/reject` | Body `{ reason, items[] }` — items = `["cccdFront","cccdBack","selfie"]` |

Approve flow:
1. Set `kyc_submissions.status = approved`, `approvedAt`, `approvedById`
2. Set `users.kycStatus = approved`
3. Tạo `subscriptions` record nếu chưa có (status=ACTIVE, endsAt = now + trialDays)
4. Push `kyc_approved` → `/dashboard`

Reject flow:
1. Set `status = rejected`, `rejectReason`, `rejectedItems`
2. Set `users.kycStatus = rejected`
3. Push `kyc_rejected` → `/verify/rejected`

---

## 16. Billing & Payment

### 16.1 Billing plans (public)

`GET /billing/plans` — list plan công khai. Không cần auth.

Plan fields: `id, name, pricePerRoom, minCharge, maxRooms, yearlyDiscountPct, vatPct, features[], active`.

### 16.2 Payment endpoints (`/payments`)

| Method | Path | Role | Mô tả |
|---|---|---|---|
| POST | `/payments/initiate` | OWNER | Tạo session subscription (gắn với KYC submission) |
| POST | `/payments/renew` | OWNER | Tạo session gia hạn |
| GET | `/payments/history` | OWNER, ADMIN | List session (cursor pagination) |
| GET | `/payments/:sessionId/status` | OWNER | Check status |
| POST | `/payments/:sessionId/refund` | OWNER | Yêu cầu hoàn tiền (chỉ KYC subscription bị reject hoặc awaiting_approval) |
| POST | `/payments/vnpay/ipn` | Public webhook | VNPay IPN (HMAC-verified) |
| POST | `/payments/bank-webhook` | Public webhook | Casso/Sepay (header secret-verified) |

### 16.3 Payment methods
- `vnpay_qr` — generate VNPay payUrl, FE redirect
- `bank_transfer` — generate VietQR + content reference, user chuyển thủ công, Casso/Sepay webhook reconcile
- `card` — chưa active

### 16.4 Reference code (bank transfer)
Format trên content chuyển khoản: `HL <sessionId>` — BE extract sessionId từ description để match.

### 16.5 Status flow
```
pending
   ↓ (timeout 1h cron)
expired

   ↓ (webhook báo paid)
paid → trigger:
  - SUBSCRIPTION kind: KYC submission → awaiting_approval, push payment_succeeded
  - RENEW kind: extend subscription endsAt + 1 cycle, push payment_succeeded

   ↓ (webhook báo fail)
failed → push payment_failed
```

### 16.6 Invoice number
Auto-generate khi chuyển sang `paid`: `INV-YYYY-NNNN` (sequential per year).

---

## 16.7 App Version (Force-update check)

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/app/version?platform=&currentVersion=` | **Public** | Trả version metadata để FE check force/soft update |
| POST | `/admin/app-version` | ADMIN | Upsert version cho 1 platform (FE không gọi) |

### GET `/app/version` response
```json
{
  "data": {
    "latestVersion": "1.2.0",
    "minSupportedVersion": "1.0.0",
    "releaseNotes": "- Fix bug X\n- Cải thiện performance",
    "storeUrl": {
      "ios": "https://apps.apple.com/app/...",
      "android": "https://play.google.com/store/apps/..."
    }
  }
}
```

Nếu `?platform` không truyền → trả cả `ios` + `android`. Nếu DB chưa có row → trả tất cả `null` (FE coi như upToDate, không block).

### POST `/admin/app-version`
```json
{
  "platform": "ios",
  "latestVersion": "1.2.0",
  "minSupportedVersion": "1.0.0",
  "releaseNotes": "- ...",
  "storeUrl": "https://apps.apple.com/app/idXXXX"
}
```
Upsert by platform — gọi nhiều lần idempotent.

---

## 17. Dashboard & Reports

| Method | Path | Role | Mô tả |
|---|---|---|---|
| GET | `/dashboard/stats` | ADMIN, OWNER, SALE | KPI hôm nay (scope theo role) |
| GET | `/reports?period=&from=&to=` | ADMIN, OWNER, SALE | Báo cáo mở rộng (today/week/month/year/custom) |

`/reports` query:
- `period`: `today | week | month | year | custom`
- `from, to`: required khi `period=custom` (format `YYYY-MM-DD`)
- Legacy: `month` (1-12), `year` (BE backward-compat)

Response chứa: KPIs, trend chart, top rooms, ratings summary, recent reviews.

---

## 18. Partner API

Base: `/partner` — auth qua header `X-Partner-Key` (PartnerApiKeyGuard, không dùng JWT).

| Method | Path | Mô tả |
|---|---|---|
| GET | `/partner/properties?page=&limit=&type=` | List property |
| GET | `/partner/properties/:id` | Detail |
| GET | `/partner/properties/:id/availability?year=&month=` | Tình trạng theo tháng |
| POST | `/partner/bookings` | Tạo booking external |
| POST | `/partner/bookings/:id/cancel` | Huỷ booking |

Partner key lưu ở bảng `partner_keys` với `isActive` + `rateLimit`.

---

## 19. Webhooks

### 19.1 VNPay IPN
- URL: `POST /payments/vnpay/ipn` (set ở VNPay portal)
- Verify HMAC SHA512 với `VNPAY_HASH_SECRET`
- Response: `{ RspCode, Message }` (định dạng VNPay yêu cầu)
- Codes: `00` confirm success, `01` order not found, `02` already processed, `04` invalid amount, `97` invalid signature, `99` invalid request

### 19.2 Bank webhook (Casso / Sepay auto-detect)
- URL: `POST /payments/bank-webhook`
- Header (1 trong 3):
  - `Secure-Token: <secret>` (Casso v2)
  - `X-Webhook-Secret: <secret>` (Casso v1 / custom)
  - `Authorization: Apikey <secret>` (Sepay)
- Match secret với `BANK_WEBHOOK_SECRET` (else 403)
- Extract sessionId từ description (`HL <sessionId>`) → match `paymentSession`
- Tolerance amount mismatch: `BANK_AMOUNT_TOLERANCE_VND` (handle phí ngân hàng)

---

## 20. Cron jobs

| Schedule | Job | Mô tả |
|---|---|---|
| Mỗi phút | `BookingsService.expireHoldBookings` | Auto-cancel booking HOLD quá hạn (`holdExpireAt < now`) |
| Mỗi 5 phút | `PaymentService.expirePendingSessions` | Set status `expired` cho session pending quá `expiresAt` |
| Mỗi giờ | `PaymentService.processTrialExpiry` | User trial → active khi `trialEndsAt < now`, set `nextChargeAt = now + 30d` |

---

## 21. Database schema

PostgreSQL + Prisma. Bảng chính:

### Core
- **users** — user accounts (role, email, password nullable cho Google/Apple-only, googleSub, appleSub, emailVerified, avatar, kycStatus, subscriptionStatus, refreshToken hash, registerDeviceId/Ip cho anti-spam)
- **user_permissions** — granular CRUD permission per module per user
- **app_versions** — force-update metadata (1 row per platform: ios, android)

### Properties
- **properties** — homestay/villa/hotel
- **property_images** — Cloudinary URLs

### Bookings & Calendar
- **bookings** — booking records (HOLD/CONFIRMED/CANCELLED/COMPLETED)
- **calendar_locks** — manual lock dates per property

### Reviews
- **property_reviews** — 6-criteria rating, owner reply, admin hide

### KYC
- **kyc_submissions** — submission lifecycle (draft → submitted → paid → approved/rejected)
- **kyc_uploads** — CCCD front/back/selfie images

### Billing & Payment
- **billing_plans** — starter/professional/enterprise
- **subscriptions** — user subscription (trial/active/past_due/cancelled)
- **payment_sessions** — VNPay/bank transfer sessions

### Notifications & Push
- **notifications** — DB notification rows (3 types: booking/payment/system)
- **user_devices** — FCM tokens (multi-device per user, có metadata)

### Staff
- **staff_invites** — invite flow (token + shortCode + status + expiresAt)

### Partner
- **partner_keys** — external partner API keys

---

## 22. Environment variables

### Database & Cache
```
DATABASE_URL=postgresql://...
REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
```

### JWT
```
JWT_SECRET=<random>
JWT_REFRESH_SECRET=<random>
JWT_EXPIRES_IN=15m         # not used (hard-coded 900s)
JWT_REFRESH_EXPIRES_IN=7d  # not used (hard-coded 604800s)
```

### App
```
PORT=3000
NODE_ENV=development|production
```

### Admin seed
```
ADMIN_PHONE, ADMIN_PASSWORD, ADMIN_NAME
```

### Cloudinary
```
CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
```

### Google OAuth
```
GOOGLE_OAUTH_WEB_CLIENT_ID=832659566372-25rp2ch2s7nqiho1057i1ho1g2i1ffmc.apps.googleusercontent.com
```

### Apple Sign-In
```
APPLE_CLIENT_ID=com.halongtravel.halong24h    # iOS bundle ID = audience verify Apple idToken
```

### Frontend & SMTP
```
FRONTEND_BASE_URL=https://halong24h.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=halong24h.team@gmail.com
SMTP_PASS=<app password 16 chars>
SMTP_FROM=Halong24h <halong24h.team@gmail.com>
```

### Firebase (FCM Push)
```
FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/halong24h-firebase.json
```
> File JSON đặt ở `secrets/` (gitignored). Project Firebase: `halong24h-production`.

### Payments — VietQR (bank transfer)
```
BANK_NAME, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_NAME, BANK_BIN
BANK_WEBHOOK_SECRET=<dùng cho Casso/Sepay>
```

### Payments — VNPay
```
VNPAY_TMN_CODE, VNPAY_HASH_SECRET
VNPAY_API_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_RETURN_URL=https://halong24h.com/payments/vnpay/return
VNPAY_IPN_URL=https://api.halong24h.com/payments/vnpay/ipn
```

---

## 23. Anti-spam & Rate limiting

### 23.1 Throttler global
- 100 req / 60s / IP (default `ThrottlerModule`)

### 23.2 Per-route limits

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5 req / 1h / IP |
| `POST /auth/google` | 10 req / 1h / IP |
| `POST /auth/apple` | 10 req / 1h / IP |
| `POST /auth/forgot-password` | 5 req / 1h / IP |
| `GET /staff/invites/verify/:token` | 10 req / 1 phút / IP |

### 23.3 Register account spam (deviceId tracking)
Áp dụng ở `/auth/register` và `/auth/google` (khi tạo user mới):
- Trong 24h, **3 account / deviceId** → 429
- Trong 24h, **10 account / IP** (cho phép share office wifi) → 429
- FE phải gửi `X-Device-Id` header (Flutter `device_info_plus`)
- Lưu `users.registerDeviceId` + `users.registerIp` + index theo `(deviceId, createdAt)` và `(ip, createdAt)`

### 23.4 Trust proxy
`app.set('trust proxy', true)` — Express đọc đúng IP client từ `X-Forwarded-For` khi qua nginx.

---

# PHẦN II — CHI TIẾT ENDPOINT CHO FE WEB (CUSTOMER)

> Phần này viết riêng cho dev FE web đang làm giao diện **khách hàng (CUSTOMER, role=3)**.
> Mỗi endpoint có đủ: mục đích, khi nào FE gọi, headers, request, response mẫu, lỗi, ghi chú.
> Các endpoint đánh dấu ⭐ là endpoint chính cho luồng customer.
>
> **Quy ước response** (mọi endpoint dưới đây đều được `ResponseInterceptor` wrap):
> ```json
> { "success": true, "message": "...", "data": <body bên dưới> }
> ```
> Phần `data: { ... }` ở mỗi mục là **giá trị nằm trong `data`** sau khi wrap.

---

## 24. AUTH cho Customer

### 24.1 ⭐ POST `/auth/register` — Đăng ký CUSTOMER

| Mục | Giá trị |
|---|---|
| **Mục đích** | Tạo tài khoản CUSTOMER mới bằng email + password |
| **Khi nào gọi** | Form "Đăng ký" trên web |
| **Auth** | Public, rate limit `5 req / 1h / IP` + `3 account / 24h / deviceId` + `10 account / 24h / IP` |

**Headers**:
- `Content-Type: application/json`
- `X-Device-Id: <uuid>` *(khuyến nghị — anti-spam)*
- `Accept-Language: vi | en` *(optional)*

**Request body**:
```json
{
  "name": "Nguyen Van A",
  "email": "a@example.com",
  "password": "matkhau123",
  "role": 3,
  "phone": "0901234567"
}
```

| Field | Validate | Bắt buộc |
|---|---|:---:|
| `name` | string, 2–100 ký tự | ✅ |
| `email` | định dạng email, unique | ✅ |
| `password` | min 6 ký tự | ✅ |
| `role` | `1` (OWNER) hoặc `3` (CUSTOMER) — FE customer luôn gửi `3` | ✅ |
| `phone` | regex `^0\d{9}$` (10 số, bắt đầu 0) | ❌ |

**Response 201**:
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi...",
  "user": {
    "id": "uuid",
    "name": "Nguyen Van A",
    "email": "a@example.com",
    "phone": "0901234567",
    "role": 3,
    "avatar": null,
    "isActive": true,
    "emailVerified": false,
    "kycStatus": "none",
    "subscriptionStatus": "none",
    "createdAt": "2026-05-14T03:00:00.000Z",
    "updatedAt": "2026-05-14T03:00:00.000Z"
  }
}
```

**Lỗi**:
- `400` — email/password sai định dạng, role không thuộc `{1,3}`
- `409` — email/phone đã tồn tại
- `429` — quá ngưỡng rate limit

**Ghi chú FE**:
- Lưu `accessToken` + `refreshToken` ngay sau response (LocalStorage / cookie HttpOnly tuỳ chiến lược).
- Sau register có thể gọi luôn `POST /devices` để đăng ký FCM token nhận push.

---

### 24.2 ⭐ POST `/auth/login` — Đăng nhập bằng email HOẶC số điện thoại

| Mục | Giá trị |
|---|---|
| **Mục đích** | Đăng nhập tài khoản đã có — chấp nhận **email hoặc SĐT** |
| **Khi nào gọi** | Form đăng nhập |
| **Auth** | Public |

**Request body** (chuẩn mới — dùng `identifier`):
```json
{ "identifier": "a@example.com", "password": "matkhau123" }
```
hoặc đăng nhập bằng SĐT:
```json
{ "identifier": "0912345678", "password": "matkhau123" }
```

| Field | Validate | Bắt buộc |
|---|---|:---:|
| `identifier` | string không rỗng — BE tự detect email vs SĐT: SĐT match regex `^0\d{9}$` hoặc `^\+84\d{9}$` (auto-normalize `+84xxx` → `0xxx`), còn lại coi là email | ✅ |
| `password` | min 6 ký tự | ✅ |

**Backward-compat**: nếu FE cũ còn gửi `{ "email": "..." }` hoặc `{ "phone": "..." }` — BE vẫn nhận (auto-map sang `identifier`).

**Response 200**: giống `/auth/register` — trả `{ accessToken, refreshToken, user }`.

**Lỗi**:
- `400` — `identifier` rỗng hoặc không hợp lệ
- `401` — email/SĐT không tồn tại, sai password, hoặc account đã bị xoá / `isActive=false`. Message duy nhất: `"Email/số điện thoại hoặc mật khẩu không đúng"` (không leak account tồn tại)

**Ghi chú**:
- BE so khớp **case-insensitive** với email; với phone phải khớp chính xác sau khi normalize.
- User phải có `password` (account Google/Apple-only chưa set password sẽ login fail → hướng dẫn dùng nút "Đăng nhập Google/Apple").

---

### 24.3 ⭐ POST `/auth/google` — Đăng nhập / Đăng ký Google

| Mục | Giá trị |
|---|---|
| **Mục đích** | Login/register bằng Google ID token (web dùng Google Identity Services hoặc OAuth2 popup) |
| **Khi nào gọi** | Sau khi FE lấy được `idToken` từ Google |
| **Auth** | Public, rate limit `10 req / 1h / IP` |

**Headers**: `X-Device-Id: <uuid>` *(khuyến nghị)*

**Request body**:
```json
{
  "idToken": "eyJhbGciOi...",
  "role": 3
}
```

| Field | Bắt buộc | Ghi chú |
|---|:---:|---|
| `idToken` | ✅ | Google ID token, BE verify audience = `GOOGLE_OAUTH_WEB_CLIENT_ID` |
| `role` | conditional | Bỏ trống nếu user đã có account; với user mới phải gửi `1` hoặc `3` (`0`/`2` bị reject 403) |

**Response 200 — 4 case**:

1. **User đã tồn tại** → trả tokens như login thường:
   ```json
   { "accessToken": "...", "refreshToken": "...", "user": { ... } }
   ```

2. **User mới + có gửi role hợp lệ** → BE tự tạo user, trả tokens.

3. **User mới + KHÔNG gửi role** → BE không tạo user, trả profile để FE bật màn role-picker:
   ```json
   {
     "isNewUser": true,
     "googleProfile": {
       "email": "a@gmail.com",
       "name": "Nguyen Van A",
       "avatar": "https://lh3.googleusercontent.com/...",
       "sub": "1234567890"
     }
   }
   ```
   ➜ FE hiện popup chọn vai trò (Customer/Owner), rồi **gọi lại** `/auth/google` với cùng `idToken` + `role` đã chọn.

4. **Lỗi**: `401` (token sai / email chưa verified), `403` (role=0/2 hoặc account disabled), `400` (role ngoài `{0,1,2,3}`).

---

### 24.4 POST `/auth/refresh` — Lấy access token mới

| Mục | Giá trị |
|---|---|
| **Mục đích** | Sau 15 phút access token hết hạn, dùng refresh token đổi cặp mới |
| **Khi nào gọi** | Khi nhận `401` từ bất kỳ endpoint nào (interceptor FE retry) |
| **Auth** | Public |

**Request body**:
```json
{ "refreshToken": "eyJhbGciOi..." }
```

**Response 200**:
```json
{ "accessToken": "...", "refreshToken": "..." }
```
> Refresh cũ **bị invalidate** sau khi rotate — FE PHẢI overwrite cả 2 token.

**Lỗi**: `401` token sai/hết hạn → FE force logout, quay về màn login.

---

### 24.5 POST `/auth/forgot-password` — Quên mật khẩu

| Mục | Giá trị |
|---|---|
| **Mục đích** | Gửi email/SMS reset password |
| **Auth** | Public, rate limit `5 req / 1h / IP` |

**Request body**:
```json
{ "identifier": "a@example.com" }
```
`identifier` chấp nhận **email hoặc phone**.

**Response 200**:
```json
{ "message": "Đã gửi hướng dẫn đặt lại mật khẩu" }
```

**Lỗi**: `404` user không tồn tại, `429` rate limited.

**Ghi chú FE**: vì lý do bảo mật, nên hiện cùng thông báo dù 200 hay 404 (tránh leak email tồn tại).

---

### 24.6 POST `/auth/reset-password` — Đặt lại mật khẩu

**Request body**:
```json
{
  "token": "<reset token từ email>",
  "newPassword": "matkhauMoi123"
}
```

**Response 200**: `{ "message": "Đặt lại mật khẩu thành công" }`

**Lỗi**: `400` token sai/expired, `401` chưa verify OTP.

> Sau khi reset, **tất cả refresh token cũ bị invalidate** → user bị logout tất cả thiết bị, phải login lại.

---

### 24.7 ⭐ GET `/auth/profile` — Lấy thông tin user hiện tại

| Mục | Giá trị |
|---|---|
| **Mục đích** | Lấy full profile của user đang đăng nhập (header avatar, trang "Tài khoản của tôi", v.v.) |
| **Khi nào gọi** | Sau login, hoặc khi vào trang account |
| **Auth** | Bearer token |

**Response 200**:
```json
{
  "id": "uuid",
  "name": "Nguyen Van A",
  "email": "a@example.com",
  "avatar": "https://...",
  "phone": "0901234567",
  "role": 3,
  "ownerId": null,
  "isActive": true,
  "emailVerified": true,
  "gender": 0,
  "dateOfBirth": "1995-06-15",
  "kycStatus": "none",
  "kycBypass": false,
  "subscriptionStatus": "none",
  "subscriptionPlanId": null,
  "subscriptionCycle": null,
  "trialEndsAt": null,
  "nextChargeAt": null,
  "permissions": [],
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### 24.8 POST `/auth/change-password` — Đổi mật khẩu khi đã login

**Auth**: Bearer.
**Request**:
```json
{ "currentPassword": "matkhau123", "newPassword": "matkhauMoi456" }
```
**Response 200**: `{ "message": "Đổi mật khẩu thành công" }`
**Lỗi**: `401` `currentPassword` sai.
> Không invalidate session — user vẫn giữ login hiện tại.

---

### 24.9 POST `/auth/logout` — Đăng xuất

**Auth**: Bearer.
**Body**: không.
**Response 200**: `{ "message": "Đăng xuất thành công" }`

> BE clear `refreshToken` trong DB. Access token vẫn còn hiệu lực đến hết TTL (≤15 phút) — FE phải **xoá token ở local** ngay.
> FE nên gọi kèm `DELETE /devices/:token` trước/sau logout để gỡ FCM token (xem 27.2).

---

### 24.10 ⭐ DELETE `/users/me` — Xoá tài khoản (compliance Apple/Google/GDPR)

| Mục | Giá trị |
|---|---|
| **Mục đích** | Cho user tự xoá vĩnh viễn account (soft-delete, email/phone được giải phóng) |
| **Khi nào gọi** | Setting → "Xoá tài khoản" (BẮT BUỘC có nếu app lên store) |
| **Auth** | Bearer |

**Request body** (optional):
```json
{ "reason": "Không còn sử dụng" }
```
`reason` ≤ 200 ký tự.

**Response 200**: `{ "message": "Tài khoản đã được xoá" }`

**Ghi chú FE**:
- FE nên hiện modal confirm 2 bước (kèm cảnh báo "không thể khôi phục").
- Sau khi 200, FE clear toàn bộ token + redirect về trang chủ.
- Booking history vẫn được giữ ở BE (audit), nhưng email/phone unique được mở khoá → user có thể register lại với email cũ.

---

## 25. APP VERSION — Check force update

### 25.1 ⭐ GET `/app/version` — Lấy thông tin version

| Mục | Giá trị |
|---|---|
| **Mục đích** | App launch check: hiện popup "force update" / "soft update" |
| **Khi nào gọi** | Mỗi lần mở app (mobile) — web có thể dùng để check banner thông báo bản web mới |
| **Auth** | Public |

**Query**:
- `platform` *(optional)* — `ios` | `android` | `web`. Nếu bỏ trống → trả cả 3.
- `currentVersion` *(optional)* — version hiện tại, BE không dùng để verify, chỉ để FE so sánh local.

**Response 200** (1 platform):
```json
{
  "latestVersion": "1.2.0",
  "minSupportedVersion": "1.0.0",
  "releaseNotes": "- Fix bug X\n- Cải thiện performance",
  "storeUrl": "https://apps.apple.com/app/...",
  "forceUpdate": false
}
```

**Response 200** (không truyền `platform`):
```json
{
  "ios": { "latestVersion": "...", "minSupportedVersion": "...", "releaseNotes": "...", "storeUrl": "..." },
  "android": { ... },
  "web": null
}
```

**Logic FE**:
- Nếu `currentVersion < minSupportedVersion` → bắt buộc update (chặn UI).
- Nếu `currentVersion < latestVersion` → khuyến nghị update (banner đóng được).
- Nếu DB BE chưa có row platform đó → tất cả null → coi như up-to-date.

---

## 26. PUBLIC DISCOVERY — Trang chủ, listing, detail, calendar

### 26.1 ⭐ GET `/properties/public` — List property công khai (homepage / search)

| Mục | Giá trị |
|---|---|
| **Mục đích** | Trang chủ + trang tìm kiếm — hiện danh sách homestay/villa/hotel |
| **Auth** | Public |

**Query params** (tất cả optional):

| Param | Loại | Mô tả |
|---|---|---|
| `checkinDate` | `YYYY-MM-DD` | Lọc property còn trống trong khoảng |
| `checkoutDate` | `YYYY-MM-DD` | Cặp với `checkinDate` |
| `guests` | int | Số khách (lọc theo `maxGuests`) |
| `minPrice` | int (VND) | Lọc giá tối thiểu |
| `maxPrice` | int (VND) | Lọc giá tối đa |
| `type` | `0` (VILLA) / `1` (HOMESTAY) / `2` (HOTEL) | Loại |
| `view` | `sea` / `city` | Hướng view |

**Response 200**:
```json
{
  "properties": [
    {
      "id": "uuid",
      "name": "Villa Sea View 01",
      "code": "VL-001",
      "type": 0,
      "view": "sea",
      "address": "Hạ Long, Quảng Ninh",
      "bedrooms": 3,
      "bathrooms": 2,
      "standardGuests": 6,
      "maxGuests": 8,
      "weekdayPrice": 2500000,
      "weekendPrice": 3500000,
      "holidayPrice": 5000000,
      "cancellationPolicy": 1,
      "amenities": ["wifi","pool","bbq"],
      "coverImage": "https://res.cloudinary.com/.../cover.jpg",
      "images": [
        { "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }
      ],
      "avgRating": 4.6,
      "reviewCount": 24
    }
  ],
  "total": 42
}
```

**Ghi chú FE**:
- Khi user **chưa chọn ngày**, giá có thể chỉ trả `weekdayPrice/weekendPrice/holidayPrice` để FE hiện "Từ X₫/đêm".
- Khi user **đã chọn ngày**, BE filter conflict — chỉ trả property còn trống.

---

### 26.2 ⭐ GET `/properties/share/:id` — Detail share link (không cần login)

| Mục | Giá trị |
|---|---|
| **Mục đích** | Link share Zalo/FB — user chưa login vẫn xem được property |
| **Auth** | Public |

**Path**: `:id` — UUID property.

**Response 200**: giống `26.3` nhưng **không có giá chi tiết** (chỉ giá hiển thị, không có internal pricing fields).

**Lỗi**: `404` không tìm thấy / đã ngưng hoạt động.

---

### 26.3 ⭐ GET `/properties/:id` — Detail property (cần login)

| Mục | Giá trị |
|---|---|
| **Mục đích** | Trang chi tiết property — đầy đủ thông tin để booking |
| **Auth** | Bearer (mọi user đã login) |

**Response 200**:
```json
{
  "id": "uuid",
  "name": "Villa Sea View 01",
  "code": "VL-001",
  "type": 0,
  "view": "sea",
  "address": "Hạ Long, Quảng Ninh",
  "latitude": 20.95,
  "longitude": 107.08,
  "mapLink": "https://maps.google.com/...",
  "bedrooms": 3,
  "bathrooms": 2,
  "standardGuests": 6,
  "maxGuests": 8,
  "weekdayPrice": 2500000,
  "weekendPrice": 3500000,
  "holidayPrice": 5000000,
  "adultSurcharge": 200000,
  "childSurcharge": 100000,
  "amenities": ["wifi","pool","bbq","aircon"],
  "cancellationPolicy": 1,
  "rules": "Không hút thuốc, không pet...",
  "services": ["breakfast","airport_pickup"],
  "description": "Villa view biển, gần bãi tắm...",
  "checkInTime": "14:00",
  "checkOutTime": "12:00",
  "images": [
    { "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }
  ],
  "avgRating": 4.6,
  "reviewCount": 24,
  "owner": { "id": "uuid", "name": "Owner A", "avatar": "https://..." }
}
```

**Lỗi**: `404` không tồn tại.

---

### 26.4 ⭐ GET `/calendar/public-grid` — Lịch trống công khai

| Mục | Giá trị |
|---|---|
| **Mục đích** | Hiện calendar trên trang detail property (user chưa login vẫn xem được ngày nào trống) |
| **Auth** | Public |

**Query**:
- `startDate` *(required)* — `YYYY-MM-DD`
- `endDate` *(required)* — `YYYY-MM-DD`
- `propertyId` *(optional)* — lọc 1 property
- `type` *(optional)* — `0/1/2` loại property

**Response 200**:
```json
{
  "properties": [
    {
      "id": "uuid",
      "name": "Villa Sea View 01",
      "type": 0,
      "days": [
        { "date": "2026-05-15", "status": 0 },
        { "date": "2026-05-16", "status": 2 },
        { "date": "2026-05-17", "status": 3 }
      ]
    }
  ]
}
```

| `status` | Ý nghĩa | FE hiển thị |
|:---:|---|---|
| `0` | AVAILABLE | Trắng, click được |
| `1` | LOCKED (admin/owner khoá) | Xám, disable |
| `2` | HOLD (đang có booking giữ chỗ) | Vàng, disable |
| `3` | BOOKED (đã được đặt) | Đỏ, disable |

> Endpoint public **không trả tên khách** (`note`). Chỉ endpoint `/calendar/grid` (auth staff) mới có.

---

### 26.5 GET `/calendar/admin-contact` — Thông tin liên hệ admin

**Auth**: Public.
**Response 200**:
```json
{
  "phone": "0912345678",
  "email": "support@halong24h.com",
  "address": "Hạ Long, Quảng Ninh",
  "zalo": "https://zalo.me/...",
  "facebook": "https://fb.com/...",
  "website": "https://halong24h.com"
}
```
Dùng cho footer / nút "Liên hệ ngay".

---

### 26.6 ⭐ GET `/properties/:id/reviews` — List reviews của property

**Auth**: Public.

**Query**:
| Param | Loại | Default |
|---|---|---|
| `page` | int | `1` |
| `pageSize` | int (max 50) | `20` |
| `sort` | `newest` / `oldest` / `highest` / `lowest` | `newest` |
| `minRating` | int 1–5 | (không filter) |

**Response 200**:
```json
{
  "reviews": [
    {
      "id": "uuid",
      "user": { "name": "Khách Nguyễn A", "avatar": "https://..." },
      "cleanliness": 5,
      "location": 5,
      "amenities": 4,
      "service": 5,
      "value": 4,
      "accuracy": 5,
      "avgRating": 4.67,
      "comment": "Villa rất đẹp, view biển tuyệt vời...",
      "photos": ["https://...","https://..."],
      "ownerReply": "Cảm ơn anh/chị đã ghé...",
      "ownerReplyAt": "2026-05-10T08:00:00.000Z",
      "createdAt": "2026-05-09T10:00:00.000Z"
    }
  ],
  "total": 24,
  "page": 1,
  "pageSize": 20,
  "summary": {
    "avgScore": 4.6,
    "totalReviews": 24,
    "breakdown": { "5": 18, "4": 4, "3": 1, "2": 1, "1": 0 }
  }
}
```

---

## 27. DEVICES — Đăng ký Push Notification (Web Push / FCM)

### 27.1 ⭐ POST `/devices` — Đăng ký FCM token

| Mục | Giá trị |
|---|---|
| **Mục đích** | Sau khi user login, FE lấy FCM token (Firebase Web SDK) và gửi BE để nhận push |
| **Khi nào gọi** | Sau mỗi lần login thành công, và sau khi user cấp quyền notification |
| **Auth** | Bearer |

**Request body**:
```json
{
  "fcmToken": "fXKnT4...:APA91b...",
  "platform": "android",
  "deviceModel": "Chrome Desktop",
  "osVersion": "Windows 10",
  "appVersion": "1.0.0",
  "locale": "vi"
}
```

| Field | Validate | Bắt buộc |
|---|---|:---:|
| `fcmToken` | string | ✅ |
| `platform` | `ios` / `android` (web dùng `android` vì FCM Web Push gắn nhóm Android) | ✅ |
| `deviceModel`, `osVersion`, `appVersion`, `locale` | string ≤ 100/20/20/10 ký tự | ❌ |

**Response 200**:
```json
{ "id": "uuid", "platform": "android", "lastActiveAt": "2026-05-14T03:10:00.000Z" }
```

**Ghi chú**:
- **Idempotent**: gọi lại với cùng `fcmToken` → cập nhật ownership sang user hiện tại.
- 1 user có thể có nhiều device (web + mobile).

---

### 27.2 DELETE `/devices/:token` — Gỡ FCM token

**Auth**: Bearer.
**Path**: `:token` — **PHẢI URL-encode** vì FCM token chứa ký tự `:`.

**Response 200**: `{ "message": "Đã gỡ thiết bị" }` (idempotent — không tồn tại cũng trả 200).

Gọi khi: user logout, user revoke quyền notification.

---

### 27.3 GET `/devices` — List thiết bị của user

**Auth**: Bearer.
**Response 200**:
```json
{
  "devices": [
    { "id": "uuid", "platform": "android", "deviceModel": "Chrome Desktop", "osVersion": "Windows 10", "lastActiveAt": "..." },
    { "id": "uuid", "platform": "ios", "deviceModel": "iPhone 13", "lastActiveAt": "..." }
  ]
}
```
Dùng cho màn "Quản lý thiết bị đăng nhập" — UX cho user thấy đang login ở đâu.

---

## 28. NOTIFICATIONS — Thông báo trong app

### 28.1 ⭐ GET `/notifications` — List thông báo

**Auth**: Bearer.

**Response 200**:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "booking",
      "title": "Đặt phòng được xác nhận",
      "body": "Booking #ABC của bạn cho Villa Sea View 01 đã được xác nhận.",
      "data": { "deepLink": "/my-bookings", "targetId": "<bookingId>" },
      "isRead": false,
      "createdAt": "2026-05-14T03:00:00.000Z",
      "readAt": null
    }
  ],
  "total": 5
}
```

`type`: `booking` / `payment` / `system`.

---

### 28.2 ⭐ GET `/notifications/unread-count` — Đếm số chưa đọc

**Auth**: Bearer.
**Response 200**: `{ "unreadCount": 3 }`

Dùng cho **badge** ở icon chuông trên header.

---

### 28.3 PATCH `/notifications/:id/read` — Đánh dấu 1 thông báo đã đọc

**Auth**: Bearer.
**Response 200**: `{ "message": "OK" }`

---

### 28.4 PATCH `/notifications/read-all` — Đánh dấu tất cả đã đọc

**Auth**: Bearer.
**Response 200**: `{ "message": "OK" }`

---

## 29. BOOKING — Luồng đặt phòng cho Customer

Luồng chuẩn:
```
[Detail property] → POST /bookings/customer-hold   (giữ chỗ 24h)
                  → User vào /my-bookings để theo dõi
                  → Staff confirm → status CONFIRMED
                  → Hoặc user tự huỷ → PATCH /customer-cancel
```

### 29.1 ⭐ POST `/bookings/customer-hold` — Customer giữ chỗ 24 giờ

| Mục | Giá trị |
|---|---|
| **Mục đích** | Customer click "Đặt phòng" → BE giữ chỗ 24h chờ confirm/thanh toán |
| **Auth** | Bearer (mọi user đã login) |

**Request body**:
```json
{
  "propertyId": "uuid",
  "checkinDate": "2026-06-01",
  "checkoutDate": "2026-06-03",
  "guestCount": 4,
  "notes": "Cần thêm 1 giường phụ"
}
```

| Field | Validate | Bắt buộc |
|---|---|:---:|
| `propertyId` | UUID | ✅ |
| `checkinDate` | `YYYY-MM-DD`, **>= hôm nay** | ✅ |
| `checkoutDate` | `YYYY-MM-DD`, **> checkinDate** | ✅ |
| `guestCount` | int ≥ 1, ≤ `property.maxGuests` | ❌ |
| `notes` | string | ❌ |

**Response 201**:
```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "customerId": "uuid",
  "checkinDate": "2026-06-01",
  "checkoutDate": "2026-06-03",
  "status": 0,
  "holdExpireAt": "2026-05-15T03:00:00.000Z",
  "holdRemainingSeconds": 86400,
  "guestCount": 4,
  "notes": "Cần thêm 1 giường phụ",
  "depositAmount": 0,
  "createdAt": "2026-05-14T03:00:00.000Z"
}
```

**Lỗi**:
- `400` — `checkinDate < hôm nay`, `checkoutDate <= checkinDate`, `guestCount > maxGuests`
- `409` — Conflict: ngày đã bị booking khác (HOLD/CONFIRMED) hoặc admin lock

**Ghi chú FE**:
- `holdRemainingSeconds`: dùng để **countdown** trên UI (`max(0, holdExpireAt - now) / 1000`).
- Cron BE mỗi phút sẽ auto-set CANCELLED nếu hết 24h chưa confirm.
- Sau khi hold, push notification gửi tới OWNER → OWNER vào confirm.

---

### 29.2 ⭐ GET `/bookings/my-bookings` — Booking của tôi

**Auth**: Bearer.

**Query** (optional):
- `status` — `0` HOLD / `1` CONFIRMED / `2` CANCELLED / `3` COMPLETED. Bỏ trống = tất cả.

**Response 200**:
```json
{
  "bookings": [
    {
      "id": "uuid",
      "property": {
        "id": "uuid",
        "name": "Villa Sea View 01",
        "coverImage": "https://...",
        "address": "Hạ Long, Quảng Ninh"
      },
      "checkinDate": "2026-06-01",
      "checkoutDate": "2026-06-03",
      "status": 0,
      "holdExpireAt": "2026-05-15T03:00:00.000Z",
      "holdRemainingSeconds": 86200,
      "guestCount": 4,
      "depositAmount": 0,
      "totalAmount": 5000000,
      "notes": "...",
      "createdAt": "2026-05-14T03:00:00.000Z",
      "canCancel": true,
      "canReview": false
    }
  ],
  "total": 3
}
```

**Ghi chú**:
- `canCancel`: chỉ `true` khi status = `HOLD`.
- `canReview`: chỉ `true` khi status = `COMPLETED` và user chưa review.

---

### 29.3 ⭐ GET `/bookings/:id` — Chi tiết 1 booking

**Auth**: Bearer.

**Response 200**: object đơn lẻ giống item trong `my-bookings` + thêm:
- `customerName`, `customerPhone`
- `cancellationPolicy` của property
- Full property detail (image array, amenities...)

**Lỗi**: `403` nếu không phải booking của user, `404` không tồn tại.

---

### 29.4 ⭐ PATCH `/bookings/:id/customer-cancel` — Customer huỷ booking

**Auth**: Bearer.
**Body**: không cần.

**Response 200**: `{ "message": "Đã huỷ booking" }`

**Lỗi**:
- `400` — Booking không ở status `HOLD` (không huỷ được `CONFIRMED` — phải liên hệ chủ nhà)
- `403` — Không phải booking của user

**Ghi chú FE**: Hiện confirm modal trước khi gọi. Sau khi 200, refresh `/my-bookings`.

---

## 30. REVIEWS — Customer viết đánh giá

### 30.1 ⭐ POST `/properties/:id/reviews` — Viết review

| Mục | Giá trị |
|---|---|
| **Điều kiện** | User có booking COMPLETED cho property này VÀ chưa review |
| **Auth** | Bearer, role = `CUSTOMER` |

**Path**: `:id` — UUID property.

**Request body**:
```json
{
  "bookingId": "uuid",
  "cleanliness": 5,
  "location": 5,
  "amenities": 4,
  "service": 5,
  "value": 4,
  "accuracy": 5,
  "comment": "Villa rất đẹp, view biển tuyệt vời...",
  "photos": ["https://...", "https://..."]
}
```

| Field | Validate | Bắt buộc |
|---|---|:---:|
| `bookingId` | UUID | ✅ |
| `cleanliness`, `location`, `amenities`, `service`, `value`, `accuracy` | int 1–5 | ✅ (cả 6) |
| `comment` | string ≤ 1000 ký tự | ❌ |
| `photos` | mảng URL (FE phải upload Cloudinary trước rồi gửi URL) | ❌ |

**Response 201**:
```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "bookingId": "uuid",
  "cleanliness": 5,
  "location": 5,
  "amenities": 4,
  "service": 5,
  "value": 4,
  "accuracy": 5,
  "avgRating": 4.67,
  "comment": "...",
  "photos": ["..."],
  "createdAt": "..."
}
```

**Lỗi**:
- `400` — score ngoài 1–5
- `403` — `bookingId` không phải của user, hoặc booking chưa `COMPLETED`
- `409` — Đã review booking này rồi

---

### 30.2 GET `/properties/:id/reviews`
Đã viết ở **26.6**.

---

## 31. BILLING — Plans (nếu có UI nâng cấp)

### 31.1 GET `/billing/plans` — List gói subscription

**Auth**: Public.
**Response 200**:
```json
{
  "plans": [
    {
      "id": "starter",
      "name": "Starter",
      "pricePerRoom": 100000,
      "minCharge": 500000,
      "maxRooms": 5,
      "yearlyDiscountPct": 20,
      "vatPct": 8,
      "features": ["Quản lý booking","Lịch tổng","Báo cáo cơ bản"],
      "active": true
    }
  ]
}
```

> Endpoint này chủ yếu cho OWNER. Customer thường không thấy. Nếu web có trang giới thiệu giá cho chủ nhà → dùng endpoint này.

---

## 32. ERROR CODES & RECOVERY (cho FE interceptor)

| HTTP | Hành động FE khuyến nghị |
|---|---|
| `400` | Hiện validation error inline (đọc `message` + `errors` từ response) |
| `401` | Thử refresh token một lần. Nếu refresh cũng 401 → clear token + redirect login |
| `403` | Hiện toast "Bạn không có quyền". Không retry |
| `404` | Hiện trang "Không tìm thấy" |
| `409` | Hiện toast conflict — vd "Email đã tồn tại", "Phòng đã được đặt" |
| `410` | Token/invite/session expire — yêu cầu thao tác lại từ đầu |
| `429` | Hiện toast "Quá nhiều yêu cầu, thử lại sau X phút" |
| `500` | Hiện toast "Lỗi hệ thống, vui lòng thử lại". Log Sentry |

**Shape lỗi BE trả về**:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Email không hợp lệ",
  "errors": null,
  "path": "/auth/register",
  "timestamp": "2026-05-14T03:00:00.000Z"
}
```

---

## 33. AUTH FLOW — Recommended interceptor logic (FE)

```
1. Mỗi request gắn Authorization: Bearer <accessToken>
2. Nếu response 401:
   a. Đang có refreshToken? → call POST /auth/refresh
      - 200: update cả accessToken + refreshToken, retry request gốc 1 lần
      - !200: clear tokens, redirect /login
   b. Không có refreshToken: redirect /login
3. Nếu response 403/404/409/410/429: KHÔNG retry, hiện error theo bảng 32
4. Token storage: khuyến nghị accessToken ở memory + refreshToken ở cookie HttpOnly Secure (nếu dùng được)
```

---

## 34. PUSH NOTIFICATION TYPES (cho web push)

Khi FE đăng ký FCM, BE sẽ gửi push với `data.type` + `data.deepLink`. FE handle:

| `data.type` | `data.deepLink` | Người nhận | Action FE |
|---|---|---|---|
| `booking_created` | `/bookings/:id` | OWNER (không phải Customer) | — |
| `booking_confirmed` | `/my-bookings` | CUSTOMER | Toast + click → vào my-bookings |
| `booking_cancelled` | `/my-bookings` | CUSTOMER | Toast |
| `payment_succeeded` | `/my-bookings` | User | Toast success |
| `payment_failed` | `/my-bookings` | User | Toast error |

(Các loại `kyc_*`, `staff_*` chỉ dành cho OWNER/SALE, customer không nhận.)

---

## 35. CHECKLIST FE WEB CUSTOMER

Khi tích hợp API, đảm bảo:

- [ ] Lưu `accessToken` + `refreshToken` đúng cách, có interceptor refresh khi 401
- [ ] Sau login: gọi `POST /devices` để đăng ký FCM token web
- [ ] Sau logout: clear local token + gọi `DELETE /devices/:token`
- [ ] Mỗi request có `Accept-Language` để BE trả message đúng ngôn ngữ
- [ ] Gửi `X-Device-Id` (uuid persist localStorage) ở các endpoint auth — giảm rate-limit collision
- [ ] Trang detail property: load song song `/properties/:id` + `/properties/:id/reviews` + `/calendar/public-grid`
- [ ] Trang my-bookings: hiện countdown từ `holdRemainingSeconds`, auto-refresh khi hết
- [ ] Trang review: chỉ enable nút "Đánh giá" khi `canReview = true`
- [ ] Notification badge: poll `/notifications/unread-count` mỗi 30s HOẶC dựa hoàn toàn vào FCM push
- [ ] Setting "Xoá tài khoản": gọi `DELETE /users/me` với confirm 2 bước
- [ ] App version: gọi `GET /app/version?platform=web&currentVersion=...` ở splash, hiện banner update nếu cần

---

## Phụ lục — Kiến trúc files

```
src/
├── app.module.ts                    # Root module — register everything
├── main.ts                          # Bootstrap (CORS, Swagger, ValidationPipe, trust proxy)
│
├── common/                          # Cross-cutting concerns
│   ├── decorators/                  # @CurrentUser, @Public, @Roles, @Permission, @Lang
│   ├── guards/                      # JwtAuthGuard, RolesGuard, PermissionGuard, PartnerApiKeyGuard
│   ├── filters/                     # AllExceptionsFilter
│   ├── interceptors/                # ResponseInterceptor (wrap), LoggingInterceptor
│   ├── pipes/                       # ValidationPipe (global)
│   └── dto/                         # Shared response DTO
│
├── config/                          # External services
│   ├── cloudinary.module.ts/.service.ts
│   └── redis.module.ts/.service.ts
│
├── prisma/                          # Prisma client wrapper
│
├── i18n/                            # vi.ts + en.ts + Lang resolver
│
└── modules/
    ├── auth/                        # Login, register, Google, Apple, forgot-password
    ├── users/                       # CRUD users + my-staff + DELETE /users/me
    ├── permissions/                 # Granular permission CRUD
    ├── staff/                       # Invite flow (POST/GET/DELETE invites + accept)
    ├── devices/                     # FCM token register/unregister/list
    ├── notifications/               # In-app notification + auto FCM push wrapper
    ├── firebase/                    # Firebase Admin SDK init
    ├── email/                       # SMTP (nodemailer) + invite template
    ├── properties/                  # CRUD properties + images
    ├── bookings/                    # Hold/confirm/cancel + calendar + cron expire
    ├── calendar/                    # Lock + grid views
    ├── reviews/                     # 6-criteria reviews + reply + hide
    ├── kyc/                         # CCCD upload + submit + resubmit
    ├── admin-kyc/                   # Admin queue + approve/reject
    ├── billing/                     # Plans (public)
    ├── payment/                     # VNPay/bank session + webhooks + cron
    ├── dashboard/                   # KPI stats + reports
    ├── app-version/                 # Force-update check + admin upsert
    └── partner/                     # External partner API
```

---

## Phụ lục — Test sandbox

- **Production**: `https://api.halong24h.com`
- **Local dev**: `http://localhost:3000`
- **Swagger UI**: `<base>/index.html`
- **Default admin** (seed): `phone=Admin, password=Abcd@1234`
- **VNPay sandbox**: `https://sandbox.vnpayment.vn/devreg/`

cURL nhanh:
```bash
# Login
curl -X POST https://api.halong24h.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a@x.com","password":"matkhau123"}'

# Register device (sau login)
curl -X POST https://api.halong24h.com/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fcmToken":"...","platform":"ios","deviceModel":"iPhone 13"}'

# Apple Sign-In (iOS only)
curl -X POST https://api.halong24h.com/auth/apple \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: <device-uuid>" \
  -d '{"idToken":"eyJ...","role":3,"email":"user@example.com","name":"Nguyen Van A","platform":"ios"}'

# Force-update check (public, gọi ở app launch)
curl 'https://api.halong24h.com/app/version?platform=ios&currentVersion=1.0.2'

# Self-delete account
curl -X DELETE https://api.halong24h.com/users/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Không còn dùng"}'

# Booking calendar 1 property
curl 'https://api.halong24h.com/bookings/calendar/<propertyId>?year=2026&month=5' \
  -H "Authorization: Bearer $TOKEN"

# Trigger 1 KYC approve để test push
curl -X POST https://api.halong24h.com/admin/kyc/submissions/<id>/approve \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"trialDays":7}'
# → device OWNER nhận push: type=kyc_approved, deepLink=/dashboard
```

---

## Phụ lục — Checklist APP_SPEC

Đối chiếu Section 17 của [APP_SPEC.md](APP_SPEC.md):

| # | Yêu cầu FE | Trạng thái BE |
|---|---|:---:|
| 1 | `/auth/login` body field tên `email` | ✅ |
| 2 | `/auth/google` + `/auth/apple` support 4 case (existing/new+role/new-no-role/error) | ✅ |
| 3 | `/auth/google` + `/auth/apple` reject role=0 (403), role=2 (403) | ✅ |
| 4 | `/auth/google` audience verify = WEB_CLIENT_ID | ✅ |
| 5 | `/auth/apple` audience verify = APPLE_CLIENT_ID (iOS bundle ID) | ✅ |
| 6 | `/auth/apple` cache email/name lần đầu (FE gửi kèm sau) | ✅ |
| 7 | `/auth/refresh` rotation invalidate token cũ | ✅ |
| 8 | `X-Device-Id` anti-spam tracking ở 3 endpoint auth | ✅ |
| 9 | **`DELETE /users/me`** — self-delete cho user hiện tại | ✅ Live |
| 10 | **`GET /app/version`** — public, trả version metadata | ✅ Live |
| 11 | `/devices` POST upsert (token đổi user → update userId) | ✅ |
| 12 | `/devices` DELETE idempotent | ✅ |
| 13 | Push payload có `data.deepLink` cho FE routing | ✅ |
| 14 | `/staff/invites/verify/:token` public, rate limit 10/min/IP | ✅ |
| 15 | `/staff/invites/accept` public, support method=google + method=password | ✅ |
| 16 | Property/booking endpoints auto-scope theo `getEffectiveOwnerId(user)` | ✅ |
| 17 | OWNER mutate property cần `kycStatus='approved'` (re-check ngoài FE guard) | ✅ |
| 18 | OWNER tạo invite cần KYC + subscription active | ✅ |
| 19 | Soft-delete user (`deletedAt` + revoke refresh token) | ✅ |
| 20 | FCM Admin SDK gửi push qua Service Account JSON | ✅ |
| 21 | `/auth/forgot-password` rate limit 5/h | ✅ (IP-based, không phải email-based) |
| 22 | Phone regex `^0\d{9}$` (10 số) | ✅ |
| 23 | `/bookings/calendar/:propertyId?year=&month=` | ✅ Live |

> 23/23 ✅. **BE đã ready cho FE integrate đầy đủ.**

---

## Phụ lục — Mismatch FE vs BE còn lại

| # | Spec | FE expect | BE thực tế | Action |
|---|---|---|---|---|
| 1 | Customer hold TTL | 15 phút (APP_SPEC §15.1) | **24 giờ** (BE business rule) | FE cập nhật spec — BE giữ. Response trả `holdRemainingSeconds` để FE countdown đúng |
| 2 | `/auth/forgot-password` rate scope | per-email | per-IP (5/h/IP) | Per-IP đủ chặn spam thông thường. Nếu cần per-email báo BE add custom tracker |
| 3 | Apple `email` privacy relay | Apple có thể trả `xyz@privaterelay.appleid.com` | BE accept như email thật | OK — vẫn unique, vẫn nhận push email được qua relay |
