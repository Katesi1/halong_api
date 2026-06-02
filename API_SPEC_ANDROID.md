# API Spec — Halong24h Backend (Android Client)

> Tài liệu API dành cho lập trình viên app Android.
> Base URL: `https://<host>/` (xem env). Ngày cập nhật: 2026-06-02.

---

## 1. Quy ước chung

### 1.1 Base URL & Headers

| Header | Bắt buộc | Mô tả |
|---|---|---|
| `Authorization: Bearer <accessToken>` | Có (trừ endpoint `@Public`) | JWT access token |
| `Accept-Language` | Không | `vi` (mặc định) hoặc `en` — quyết định ngôn ngữ message/error |
| `Content-Type: application/json` | Có (POST/PUT/PATCH) | Trừ multipart upload |
| `X-Partner-Key` | Có (partner only) | Chỉ cho `/partner/*` |

### 1.2 Response wrapper

Tất cả response 2xx:
```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": { ... }
}
```

Tất cả response lỗi:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "...",
  "errors": { "fieldName": ["error message"] },
  "path": "/auth/login",
  "timestamp": "2026-06-02T10:30:00.000Z"
}
```

> Khi parse: nếu `success=true` → đọc `data`. Nếu `success=false` → hiển thị `message`, và `errors` (nếu có) để highlight từng field trên form.

### 1.3 Kiểu dữ liệu

| Kiểu | Định dạng | Ví dụ |
|---|---|---|
| Date (chỉ ngày) | `YYYY-MM-DD` | `2026-06-15` |
| DateTime | ISO 8601 UTC | `2026-06-02T10:30:00.000Z` |
| Giá tiền | Integer VND (không thập phân) | `1500000` = 1.500.000đ |
| Phone | 10 số bắt đầu `0` | `0901234567` |
| UUID | 36 ký tự v4 | `7c9e6679-7425-40de-944b-e07fc1f90ae7` |

### 1.4 Enum chính

```kotlin
// Role
const val ROLE_ADMIN    = 0
const val ROLE_OWNER    = 1
const val ROLE_SALE     = 2
const val ROLE_CUSTOMER = 3

// Property type
const val PROPERTY_VILLA    = 0
const val PROPERTY_HOMESTAY = 1
const val PROPERTY_HOTEL    = 2

// Booking status
const val BOOKING_HOLD      = 0  // Đang giữ chỗ
const val BOOKING_CONFIRMED = 1  // Đã xác nhận
const val BOOKING_CANCELLED = 2  // Đã huỷ
const val BOOKING_COMPLETED = 3  // Đã hoàn tất

// Cancellation policy
const val POLICY_FLEXIBLE = 0
const val POLICY_MODERATE = 1
const val POLICY_STRICT   = 2

// Notification type
const val NOTI_BOOKING = 0
const val NOTI_PAYMENT = 1
const val NOTI_SYSTEM  = 2

// KYC status (string)
// "none" | "pending" | "approved" | "rejected"
```

### 1.5 Rate limit

| Nhóm | Giới hạn |
|---|---|
| `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` | 5 req/giờ/IP |
| `/auth/login`, `/auth/google`, `/auth/apple` | 10 req/15phút/IP |
| `/staff/invites/verify/:token` | 10 req/phút/IP |
| Mặc định | Không giới hạn (vẫn nên debounce client) |

Khi vượt rate limit → `HTTP 429 Too Many Requests`.

---

## 2. Authentication

Base path: `/auth`

### 2.1 POST `/auth/register` — Đăng ký

**Public.** Auto-login, trả token ngay.

Request:
```json
{
  "name": "Nguyễn Văn A",
  "email": "user@example.com",
  "password": "secret123",
  "role": 3,                  // 1=OWNER, 3=CUSTOMER (KHÔNG cho ADMIN/SALE)
  "phone": "0901234567"       // optional, 10 số bắt đầu 0
}
```

Response `data`:
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": { "id": "...", "name": "...", "email": "...", "phone": "...", "role": 3, "isActive": true }
}
```

> **Lưu ý device throttle:** Backend giới hạn tối đa 3 tài khoản tạo từ cùng device trong 24h (dựa trên fingerprint header). App nên gắn `User-Agent` ổn định.

### 2.2 POST `/auth/login`

**Public.**

```json
{
  "identifier": "user@example.com",  // email HOẶC phone 10 số
  "password": "secret123"
}
```

Response = giống `/register`.

### 2.3 POST `/auth/google` — Google Sign-In

**Public.**

```json
{
  "idToken": "<google_id_token>",
  "role": 3   // bắt buộc nếu là user mới, bỏ qua nếu đã tồn tại
}
```

### 2.4 POST `/auth/apple` — Apple Sign-In (iOS, app dùng chung backend)

Bỏ qua trên Android.

### 2.5 POST `/auth/refresh` — Lấy access token mới

**Public.**

```json
{ "refreshToken": "..." }
```

Response giống `/login`. Khi access token hết hạn (401) → gọi refresh → retry request gốc.

### 2.6 POST `/auth/forgot-password`

```json
{ "identifier": "user@example.com" }  // email hoặc phone
```

Trả về `MessageResponse` (luôn 200 dù user có tồn tại hay không — chống user enumeration).

### 2.7 POST `/auth/reset-password`

```json
{ "token": "<token_from_email_or_sms>", "newPassword": "newSecret123" }
```

### 2.8 POST `/auth/logout`

**Auth required.** Invalidate refresh token hiện tại. App nên gọi `DELETE /devices/:fcmToken` trước khi logout.

### 2.9 GET `/auth/profile`

**Auth required.** Trả về user object đầy đủ:
```json
{
  "id": "...", "name": "...", "email": "...", "phone": "...",
  "role": 1, "isActive": true, "avatar": "https://...",
  "gender": "male", "dateOfBirth": "1990-01-01",
  "kycStatus": "approved",        // none|pending|approved|rejected
  "kycBypass": false,
  "subscription": {                // có thể null
    "planId": "rooms_5", "cycle": "monthly", "status": "active",
    "expiresAt": "2026-07-02T...", "rooms": 5, "trialActive": false
  }
}
```

### 2.10 POST `/auth/change-password`

```json
{ "oldPassword": "...", "newPassword": "..." }
```

---

## 3. Device & Push Notification (FCM)

Base path: `/devices`. Auth required.

### 3.1 POST `/devices` — Đăng ký FCM token

Gọi NGAY sau khi login thành công và mỗi khi FCM token thay đổi (`onNewToken`).

```json
{
  "fcmToken": "fK3...:APA91b...",
  "platform": "android",          // "ios" | "android"
  "deviceModel": "Pixel 8",
  "osVersion": "Android 15",
  "appVersion": "1.4.2",
  "locale": "vi"
}
```

Idempotent: gọi lại với cùng token → no-op. Nếu token này đang gắn user khác → tự động chuyển sang user mới.

### 3.2 DELETE `/devices/:token` — Huỷ đăng ký

Gọi trước khi logout. Path param là FCM token.

### 3.3 GET `/devices` — List device

Trả mảng `UserDevice` (chủ yếu cho màn "Quản lý phiên đăng nhập").

---

## 4. App Version (Force Update)

### 4.1 GET `/app/version?platform=android&currentVersion=1.4.2`

**Public.** Gọi lúc app launch:

```json
{
  "platform": "android",
  "latestVersion": "1.5.0",
  "minSupportedVersion": "1.3.0",
  "releaseNotes": "Sửa lỗi đặt phòng...",
  "storeUrl": "https://play.google.com/store/apps/details?id=..."
}
```

App logic:
- `currentVersion < minSupportedVersion` → **Force update** (chặn).
- `currentVersion < latestVersion` → Banner "Có bản mới" (cho phép tiếp tục).

---

## 5. Properties (Tìm/Xem homestay)

Base path: `/properties`.

### 5.1 GET `/properties/public` — Customer search

**Public.**

Query params (tất cả optional):
| Tham số | Kiểu | Mô tả |
|---|---|---|
| `checkinDate` | `YYYY-MM-DD` | Loại bỏ property đã bị giữ/đặt khoảng ngày này |
| `checkoutDate` | `YYYY-MM-DD` | |
| `guests` | int | Số khách (filter theo `maxGuests`) |
| `minPrice`, `maxPrice` | int VND | Lọc giá |
| `type` | 0/1/2 | VILLA/HOMESTAY/HOTEL |
| `view` | `sea` \| `city` | |

Response: `PropertyDto[]` (xem 5.4).

### 5.2 GET `/properties/share/:id` — Trang share

**Public.** Trả property detail KHÔNG kèm giá (chỉ thông tin marketing).

### 5.3 GET `/properties/:id`

**Auth required** (customer cần auth để xem chi tiết kèm giá). Trả PropertyDto đầy đủ.

### 5.4 PropertyDto

```json
{
  "id": "uuid",
  "name": "Villa Hạ Long View",
  "type": 0,
  "code": "VL001",
  "view": "sea",
  "address": "Bãi Cháy, Hạ Long",
  "mapLink": "https://maps.google.com/...",
  "isActive": true,
  "bedrooms": 3,
  "bathrooms": 2,
  "standardGuests": 6,
  "maxGuests": 8,
  "weekdayPrice": 2000000,
  "weekendPrice": 3000000,
  "holidayPrice": 4500000,
  "adultSurcharge": 200000,
  "childSurcharge": 100000,
  "amenities": ["wifi", "pool", "parking"],
  "cancellationPolicy": 1,
  "rules": "Không hút thuốc...",
  "services": "Đưa đón sân bay...",
  "description": "...",
  "checkInTime": "14:00",
  "checkOutTime": "12:00",
  "images": [
    { "id": "uuid", "url": "https://...", "isCover": true }
  ]
}
```

### 5.5 Endpoint quản lý (OWNER/SALE/ADMIN)

App customer **KHÔNG dùng**. Tham khảo nếu app có chế độ OWNER:
- `GET /properties` — list (kèm filter `includeInactive`)
- `POST /properties`, `PATCH /properties/:id`, `DELETE /properties/:id`
- `POST /properties/:id/images` (multipart, field `images[]`, max 20 file × 10MB)
- `DELETE /properties/:id/images/:imageId`
- `PATCH /properties/:id/images/:imageId/cover`
- `PUT /properties/:id/prices`

---

## 6. Bookings

Base path: `/bookings`. Auth required.

### 6.1 POST `/bookings/customer-hold` — Customer giữ chỗ (24h)

**Role: CUSTOMER (và ADMIN/OWNER/SALE đều dùng được).**

```json
{
  "propertyId": "uuid",
  "checkinDate": "2026-06-15",
  "checkoutDate": "2026-06-17",
  "guestCount": 4
}
```

Response `BookingDto`:
```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "customerId": "uuid",
  "customerName": "...",
  "customerPhone": "...",
  "checkinDate": "2026-06-15",
  "checkoutDate": "2026-06-17",
  "status": 0,                         // HOLD
  "holdExpireAt": "2026-06-03T10:30:00.000Z",
  "holdRemainingSeconds": 86400,       // còn 24h
  "depositAmount": 0,
  "guestCount": 4
}
```

> App nên dùng `holdRemainingSeconds` để hiển thị countdown. Khi countdown = 0 → re-fetch để xác nhận trạng thái.

### 6.2 GET `/bookings/my-bookings` — Lịch sử đặt của tôi

Query: `status?` (0-3), `page?` (mặc định 1), `limit?` (mặc định 20).

Response:
```json
{
  "items": [ /* BookingDto */ ],
  "total": 25,
  "page": 1,
  "limit": 20
}
```

### 6.3 PATCH `/bookings/:id/customer-cancel` — Customer huỷ

Chỉ huỷ được khi `status = 0 (HOLD)` và booking thuộc về user.

### 6.4 Endpoint OWNER/SALE (tham khảo)

- `POST /bookings/hold` — staff giữ chỗ 30 phút, kèm `customerName`, `customerPhone`, `depositAmount`, `notes`
- `GET /bookings` — list có filter `propertyId`, `status`, paginate
- `GET /bookings/:id` — chi tiết
- `GET /bookings/calendar/:propertyId?year=2026&month=6` — lịch tháng
- `PATCH /bookings/:id/confirm` — chuyển HOLD → CONFIRMED
- `PATCH /bookings/:id/cancel` — staff huỷ
- `PUT /bookings/:id` — update customerName/Phone/guestCount/notes/depositAmount

---

## 7. Calendar (Lịch trống)

### 7.1 GET `/calendar/public-grid` — Lịch công khai

**Public.** Cho phép customer xem màn "Master calendar" tất cả property.

Query: `startDate?`, `endDate?` (YYYY-MM-DD), `propertyId?`, `type?` (0-2).

Response:
```json
{
  "properties": [
    {
      "id": "uuid", "name": "...", "type": 0,
      "days": [
        { "date": "2026-06-15", "status": "available" },
        { "date": "2026-06-16", "status": "hold" },
        { "date": "2026-06-17", "status": "booked" },
        { "date": "2026-06-18", "status": "locked" }
      ]
    }
  ]
}
```

### 7.2 GET `/calendar/admin-contact`

**Public.** Lấy phone/email admin cho nút "Liên hệ".

---

## 8. KYC (Định danh OWNER)

Base path: `/kyc`. Chỉ áp dụng cho role OWNER. Customer KHÔNG cần KYC.

### 8.1 POST `/kyc/upload-cccd-front` — Upload mặt trước CCCD

**Multipart form-data:**
| Field | Kiểu | Mô tả |
|---|---|---|
| `image` | file | JPG/PNG/WEBP/HEIC, max 5MB |
| `ocrResult` | string (JSON) | optional — kết quả OCR client-side |

### 8.2 POST `/kyc/upload-cccd-back` — Mặt sau CCCD
### 8.3 POST `/kyc/upload-selfie` — Ảnh selfie để face-match

(Format giống 8.1.)

### 8.4 POST `/kyc/submit` — Submit hồ sơ

Sau khi đã upload đủ 3 ảnh, gọi endpoint này để chuyển status → `pending`.

### 8.5 GET `/kyc/status`

Response:
```json
{
  "status": "pending",                    // none|pending|approved|rejected
  "submittedAt": "2026-06-01T...",
  "rejectedItems": [],                    // ["cccdFront", "selfie"] nếu bị reject
  "rejectReason": null,
  "uploads": {
    "cccdFront": { "url": "https://...", "uploadedAt": "..." },
    "cccdBack":  { "url": "https://...", "uploadedAt": "..." },
    "selfie":    { "url": "https://...", "uploadedAt": "..." }
  }
}
```

### 8.6 POST `/kyc/submissions/:id/resubmit`

```json
{ "items": ["cccdFront", "selfie"] }
```
Cho phép re-upload các item bị reject.

---

## 9. Notifications

Base path: `/notifications`. Auth required.

### 9.1 GET `/notifications?page=1&limit=20`

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Đặt phòng thành công",
      "subtitle": "Booking #ABC123 đã được xác nhận",
      "type": 0,
      "isRead": false,
      "createdAt": "2026-06-02T...",
      "targetId": "<bookingId>",
      "targetType": "booking"
    }
  ],
  "total": 50, "page": 1, "limit": 20
}
```

### 9.2 GET `/notifications/unread-count`

```json
{ "count": 5 }
```

App nên gọi định kỳ (vd: mỗi khi mở app, hoặc khi nhận FCM push) để cập nhật badge.

### 9.3 PATCH `/notifications/:id/read`
### 9.4 PATCH `/notifications/read-all`

---

## 10. Reviews

### 10.1 POST `/properties/:id/reviews` — Tạo review (CUSTOMER)

**Điều kiện:** Customer phải có booking với `status=3 (COMPLETED)` và chưa review.

```json
{
  "bookingId": "uuid",
  "cleanliness": 5,                       // 1-5
  "location": 4,
  "amenities": 5,
  "service": 5,
  "value": 4,
  "accuracy": 5,
  "comment": "Phòng đẹp, sạch sẽ...",     // optional, max 1000 chars
  "photos": ["https://...", "..."]        // optional, max 10 URL (upload trước)
}
```

### 10.2 GET `/properties/:id/reviews` — Danh sách review (Public)

Query: `page?` (1), `pageSize?` (20), `sort?` (`newest`|`oldest`|`highest`|`lowest`), `minRating?` (1-5).

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "customerId": "uuid",
      "cleanliness": 5, "location": 4, "amenities": 5,
      "service": 5, "value": 4, "accuracy": 5,
      "avgRating": 4.67,
      "comment": "...",
      "photos": ["..."],
      "ownerReply": "Cảm ơn quý khách...",
      "ownerReplyAt": "2026-06-03T...",
      "createdAt": "2026-06-02T..."
    }
  ],
  "summary": {
    "avgRating": 4.5, "totalReviews": 23,
    "ratingDistribution": { "5": 15, "4": 5, "3": 2, "2": 1, "1": 0 }
  },
  "page": 1, "pageSize": 20, "total": 23
}
```

---

## 11. Subscription & Billing (chỉ OWNER)

### 11.1 GET `/billing/plans` — List gói

**Public.** Trả danh sách plan: `rooms_1`, `rooms_5`, `rooms_10`, `rooms_unlimited` với giá `monthly`/`yearly`.

### 11.2 POST `/payments/initiate` — Tạo phiên thanh toán

**Role: OWNER.**

```json
{
  "planId": "rooms_5",
  "cycle": "monthly",                     // "monthly" | "yearly"
  "method": "vnpay_qr",                   // "vnpay_qr" | "bank_transfer" | "card"
  "rooms": 5,
  "totalAmount": 1100000                  // VND có VAT, client tính lại để verify
}
```

Response: `{ sessionId, paymentUrl, qrCode?, expiresAt }`.
> Trên Android: mở `paymentUrl` bằng Custom Tab. Sau khi thanh toán xong, redirect về deeplink → app gọi `GET /payments/:sessionId/status`.

### 11.3 GET `/payments/:sessionId/status`

```json
{ "status": "paid", "subscription": { ... } }
// status: pending | paid | failed | expired | refunded
```

### 11.4 GET `/payments/history?limit=50&cursor=...`

List transaction phân trang.

### 11.5 Google Play Billing (chưa có endpoint)

> **TODO Backend:** Hiện chỉ có Apple IAP verify (`POST /payments/apple/verify`). Khi triển khai Google Play Billing, sẽ có endpoint tương tự dạng `POST /payments/google/verify` với body `{ productId, purchaseToken }`. App Android cần dự trù wrapper Billing Library v6+.

---

## 12. Staff Module (cho OWNER quản lý SALE — nếu app hỗ trợ)

- `POST /staff/invites` body `{ email }` — gửi lời mời
- `GET /staff/invites?status=pending`
- `DELETE /staff/invites/:id` — huỷ invite
- `GET /staff?isActive=true` — list staff
- `DELETE /staff/:userId` — xoá staff
- `GET /staff/invites/verify/:token` (Public) — verify invite link
- `POST /staff/invites/accept` (Public) — staff accept invite, body `{ token, method: "google"|"password", idToken?, name?, password?, phone? }` → trả về `LoginResponse`

---

## 13. Mã lỗi & Xử lý

### 13.1 HTTP status thường gặp

| Status | Ý nghĩa | Hành động Android |
|---|---|---|
| 400 | Validation lỗi | Hiển thị `errors` per field |
| 401 | Token sai/hết hạn | Gọi `/auth/refresh` rồi retry; nếu refresh fail → logout |
| 403 | Không có quyền (role/permission) | Hiển thị `message` |
| 404 | Không tìm thấy | "Không tìm thấy..." |
| 409 | Conflict (vd: email tồn tại, ngày đã được book) | Hiển thị `message` |
| 429 | Rate limit | "Quá nhiều yêu cầu, vui lòng thử lại sau" |
| 5xx | Server lỗi | Retry exponential backoff (tối đa 3 lần) |

### 13.2 Token refresh flow (gợi ý OkHttp Authenticator)

```
1. Request gốc → 401
2. Lock mutex (tránh refresh đồng thời)
3. POST /auth/refresh với refreshToken
4. Nếu thành công → lưu accessToken/refreshToken mới, retry request gốc với header mới
5. Nếu thất bại (401) → xoá token local, navigate về màn Login
```

---

## 14. Push Notification Payload

Backend gửi FCM data-message (không phải notification message) để app tự render. Cấu trúc payload `data`:

```json
{
  "type": "booking",                      // booking | payment | system
  "title": "Đặt phòng mới",
  "subtitle": "...",
  "targetId": "<bookingId|paymentId>",
  "targetType": "booking",
  "notificationId": "<uuid>"
}
```

App click → deeplink theo `targetType` + `targetId`.

---

## 15. Checklist tích hợp Android

- [ ] HTTP client (Retrofit/OkHttp) gắn interceptor `Authorization`, `Accept-Language`
- [ ] Authenticator xử lý 401 → refresh token
- [ ] Lưu token bằng EncryptedSharedPreferences hoặc DataStore + Tink
- [ ] Đăng ký FCM token sau khi login + mỗi `onNewToken` callback
- [ ] Huỷ FCM token khi logout (DELETE /devices/:token)
- [ ] Force-update check ở splash screen (`/app/version`)
- [ ] Countdown timer cho booking HOLD (`holdRemainingSeconds`)
- [ ] Mở payment URL bằng Chrome Custom Tab + deeplink return
- [ ] Multipart upload cho KYC ảnh (compress < 5MB)
- [ ] Pull-to-refresh + paginate cho list (bookings, notifications, reviews)
- [ ] Badge unread cho notification (poll `/notifications/unread-count`)

---

## 16. Đầu mối liên hệ

- Backend lead: (cập nhật)
- Repo: `c:\website\backend`
- Swagger: `https://<host>/api/docs` (mở khi server chạy)
- File spec liên quan: `BACKEND_APPLE_IAP_SPEC.md` (Apple IAP chi tiết)

---

> Phiên bản tài liệu: v1.0 — 2026-06-02. Mọi thay đổi schema/endpoint vui lòng cập nhật file này + thông báo team Android qua channel `#mobile-backend`.
