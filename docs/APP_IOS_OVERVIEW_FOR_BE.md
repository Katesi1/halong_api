# Halong24h Mobile — Tổng quan chức năng & API cho team Backend

> Tài liệu mô tả **app mobile đang làm gì, luồng ra sao, gọi API nào**. Dùng để
> team BE đối chiếu contract. Mọi endpoint dưới đây được trích trực tiếp từ
> source (`lib/core/constants/api_constants.dart` + các repository), không phải
> lý thuyết.
>
> - **Base URL**: `https://api.halong24h.com`
> - **Spec chi tiết field-level**: `docs/API_SPEC_FULL.md` (tài liệu này bổ sung
>   góc nhìn "app gọi gì ở đâu").
> - Cập nhật: 2026-07-09.

---

## 1. Sản phẩm là gì

- **App B2B — chỉ dành cho quản lý** (ADMIN / OWNER / SALE). **Khách KHÔNG dùng
  app** — khách đặt phòng qua website. Trong app **không có** role CUSTOMER,
  không có luồng khách đặt phòng.
- Mục tiêu: quản lý cơ sở lưu trú (villa/homestay/khách sạn), phòng, booking,
  lịch, báo cáo doanh thu; KYC + subscription cho OWNER; chat realtime với khách;
  quản trị (ADMIN).
- Platform: Flutter (iOS + Android). State: Riverpod. HTTP: Dio. Realtime:
  Socket.IO. Push: FCM.

### Đơn vị dữ liệu quan trọng (dễ nhầm)

| Thuật ngữ BE | UI app gọi là | Ghi chú |
|---|---|---|
| `property` (`/properties`) | "Phòng" hoặc "Cơ sở" | Property vừa là **đơn vị lưu trú** vừa là **đơn vị booking**. Màn "Danh sách phòng" list các property. |
| `standardGuests` | Người lớn tiêu chuẩn | Đã bao trong giá |
| `standardChildren` | Trẻ em tiêu chuẩn | **Mới v1.27**, default 0 |
| `maxGuests` | Sức chứa tối đa | Tổng cả căn |

---

## 2. Vai trò & phân quyền

Role numeric: **ADMIN = 0, OWNER = 1, SALE = 2** (`CUSTOMER = 3` chỉ tồn tại ở
BE cho khách web, app chỉ gặp khi ADMIN xem danh sách user).

| Role | Sau login | Quyền chính |
|---|---|---|
| **SALE** (2) | `/dashboard` | Xem/thao tác trong phạm vi được OWNER gán; không vào `/admin` |
| **OWNER** (1) | `/dashboard` | CRUD cơ sở/phòng/booking của mình; mời & quản lý SALE; KYC + subscription; tài khoản nhận tiền |
| **ADMIN** (0) | `/dashboard` | Toàn quyền: quản lý user, duyệt KYC, duyệt bank, RBAC, moderation |

Route guard (client-side, mirror rule BE):
- Chưa login → mọi màn redirect `/login`.
- SALE truy cập `/admin/*` → redirect `/dashboard`.
- OWNER **chưa KYC approved** → chặn `/properties/new` + `/properties/:id/*`
  (các route mutate) → redirect `/verify/cccd-front`. Màn list `/properties` vẫn
  vào được để thấy banner CTA.

---

## 3. Cơ chế gọi API chung (client contract)

### 3.1 Response envelope
App **luôn** kỳ vọng shape:
```json
{ "success": true, "data": { ... }, "message": "..." }
```
App parse `response.data['data']`. List thì `data` là array.

### 3.2 Headers mặc định (mọi request)
```
Content-Type: application/json
X-Client-Type: mobile        // BE tách session slot theo client (v1.19)
Authorization: Bearer <accessToken>   // trừ các endpoint public auth
```

### 3.3 Auth & refresh token (interceptor tự động)
- Token lưu ở **SecureStorage** (không phải SharedPreferences).
- Interceptor tự gắn `Authorization` cho mọi request trừ **public auth paths**:
  `/auth/login`, `/auth/register`, `/auth/google`, `/auth/forgot-password`,
  `/auth/reset-password`, `/auth/refresh`.
- Khi nhận **401**: interceptor gọi `POST /auth/refresh` với
  `{ refreshToken }` (không kèm Authorization). BE trả
  `data: { accessToken, refreshToken? }`. Sau đó **retry request gốc** + replay
  các request đang chờ. Refresh chỉ chạy 1 lần đồng thời (queue các 401 khác).
- Nếu refresh thất bại → xóa token, buộc logout, redirect `/login`.
  - Refresh trả **403** → hiểu là **phiên bị đá** (thiết bị mobile khác chiếm
    slot session — v1.19) → thông báo riêng.
  - Còn lại → "phiên hết hạn".
- **Retry mạng/429**: request timeout/connection-error/429 được retry tối đa 2
  lần (exponential backoff + jitter, tôn trọng header `Retry-After`).

### 3.4 Timeout
`connectTimeout` = `receiveTimeout` = **30s**.

---

## 4. Luồng Auth & Profile (⚠️ quan trọng)

> **Auth chỉ trả TOKEN, KHÔNG trả `user`.** `/login`, `/register`, `/google`,
> `/apple`, `/refresh` chỉ trả `{ accessToken, refreshToken }`. Sau khi lưu token
> app **bắt buộc gọi `GET /auth/profile`** để lấy user. App KHÔNG parse
> `data.user` từ response auth.

| Chức năng | Method + Endpoint | Body app gửi |
|---|---|---|
| Đăng ký (OWNER) | `POST /auth/register` | `{ name, email, password, phone? }` |
| Đăng nhập | `POST /auth/login` | `{ email, password }` (key `email` = identifier) |
| Google Sign-In | `POST /auth/google` | `{ idToken }` |
| Apple Sign-In | `POST /auth/apple` | `{ idToken, email?, name? }` |
| Refresh token | `POST /auth/refresh` | `{ refreshToken }` |
| Lấy profile | `GET /auth/profile` | — (source of truth cho role/KYC/subscription) |
| Đăng xuất | `POST /auth/logout` | — |
| Quên mật khẩu | `POST /auth/forgot-password` | `{ email }` |
| Reset mật khẩu | `POST /auth/reset-password` | `{ ... token }` |
| Đổi mật khẩu | `POST /auth/change-password` | `{ oldPassword, newPassword }` |
| Cập nhật profile | `PUT /users/:id` | field profile (⚠️ **không** còn nhận `bank` — xem §11) |

**Auto-refresh profile** (để bắt thay đổi từ BE như admin vừa duyệt KYC/bank):
1. App resume foreground → gọi lại `GET /auth/profile`.
2. Pull-to-refresh dashboard.
3. Màn pending-approval poll `GET /kyc/status`.
4. Nhận FCM `subscription_*` / `bank_*` → refresh profile (xem §10).

---

## 5. Chức năng theo module + API

### 5.1 Dashboard
- KPI cards, banner subscription/KYC, thao tác nhanh, booking hôm nay.
- `GET /dashboard/stats`

### 5.2 Danh sách & chi tiết phòng (Properties)
Màn "Danh sách phòng" (SALE/OWNER/ADMIN xem, có tab Villa/Homestay/Khách sạn,
search, filter view + giá + **người lớn/trẻ em**).

| Chức năng | Method + Endpoint |
|---|---|
| List phòng | `GET /properties` |
| Chi tiết phòng | `GET /properties/:id` |
| Tạo phòng | `POST /properties` |
| Sửa phòng | `PATCH /properties/:id` |
| Xóa phòng | `DELETE /properties/:id` |
| Upload ảnh (multipart) | `POST /properties/:id/images` |
| Xóa ảnh | `DELETE /properties/:id/images/:imageId` |
| Đặt ảnh bìa | `PATCH /properties/:id/images/:imageId/cover` |
| Cập nhật bảng giá | `PUT /properties/:id/prices` |
| Share link công khai | `GET /properties/share/:id` (web render, không kèm giá) |

> **v1.27 (2026-07-08) — sức chứa trẻ em + filter:** app đã cập nhật:
> - Form tạo/sửa gửi thêm `standardChildren` (int ≥ 0).
> - Filter danh sách (client-side hiện tại): `adults → standardGuests >= adults`,
>   `children → standardChildren >= children`. App **chưa** đẩy filter này thành
>   query param API — đang lọc client. Nếu BE muốn app chuyển sang
>   `GET /properties/search?adults=&children=` thì cần confirm để app đổi.

### 5.3 Booking (SALE/OWNER)
Giữ phòng (hold) → xác nhận → đánh dấu đã thanh toán / hủy. Lịch theo tháng.

| Chức năng | Method + Endpoint | Ghi chú |
|---|---|---|
| List booking | `GET /bookings?propertyId=` | |
| Chi tiết | `GET /bookings/:id` | |
| Lịch booking tháng | `GET /bookings/calendar/:propertyId?year=&month=` | |
| Giữ phòng | `POST /bookings/hold` | body booking |
| Xác nhận | `PATCH /bookings/:id/confirm` | |
| Hủy | `PATCH /bookings/:id/cancel` | |
| Đánh dấu đã trả tiền (cọc) | `PATCH /bookings/:id/paid` | `{ amount? }` |
| **Xác nhận nhận phòng + thu nốt** | `PATCH /bookings/:id/checkin` | **(v1.31 — app CẦN wire)** `{ amount? }` → COMPLETED |
| Cập nhật | `PUT /bookings/:id` | |

> **v1.31 (2026-07-09) — luồng check-in (app owner CẦN bổ sung):**
> - **Chi tiết booking**: hiển thị `depositProofUrl` (ảnh bill CK cọc do khách gửi từ web) để owner đối chiếu trước khi bấm `/paid` ghi nhận cọc.
> - **Nút "Xác nhận nhận phòng + thu nốt"** → `PATCH /bookings/:id/checkin { amount? }` (booking phải `CONFIRMED`). Thành công → booking `COMPLETED`.
> - **BookingDto** có thêm `depositProofUrl`, `checkedInAt`, `completedAt`, `totalAmount`, `paidAmount` (default 0), `remainingAmount`, `priceBreakdown` (v1.29). Ô tiền: "Tổng"=`totalAmount`, "Đã thu"=`paidAmount`, "Còn lại"=`remainingAmount`, "Cần cọc"=`depositAmount`.
> - `POST /bookings/:id/deposit-proof` là endpoint **của khách web** — app owner KHÔNG gọi, chỉ hiển thị ảnh nhận được.

### 5.4 Calendar (lịch trống / khóa / đã bán)
| Chức năng | Method + Endpoint | Auth |
|---|---|---|
| Lưới lịch công khai | `GET /calendar/public-grid` | **Không cần token** |
| Lưới lịch quản lý | `GET /calendar/grid` | Bearer |
| Khóa ngày | `POST /calendar/lock` | Bearer |
| Mở khóa | `DELETE /calendar/lock` | Bearer |
| Đánh dấu đã bán | `PATCH /calendar/sold` | Bearer |
| Liên hệ admin (block) | `GET /calendar/admin-contact` | Bearer |

### 5.5 Reports
- Doanh thu, donut trạng thái, rating cơ sở...
- `GET /reports` (kèm query filter khoảng thời gian/cơ sở)

### 5.6 KYC + Subscription (OWNER) — feature `verify`
Luồng: upload CCCD trước/sau + selfie liveness → chọn plan → thanh toán
**VietQR bank transfer** → admin đối soát + duyệt → trial 7 ngày → gia hạn thủ
công. State machine 7 status: `draft → kycSubmitted → paymentPending →
awaitingApproval → approved → trial → active` (+ `rejected`/`refunded`).

| Chức năng | Method + Endpoint |
|---|---|
| Upload CCCD mặt trước (multipart) | `POST /kyc/upload-cccd-front` |
| Upload CCCD mặt sau (multipart) | `POST /kyc/upload-cccd-back` |
| Upload selfie (multipart) | `POST /kyc/upload-selfie` |
| Submit hồ sơ | `POST /kyc/submit` |
| Trạng thái KYC (poll) | `GET /kyc/status` |
| Chi tiết submission | `GET /kyc/submissions/:id` |
| Nộp lại (rejected) | `POST /kyc/submissions/:id/resubmit` |
| Danh sách gói | `GET /billing/plans` |
| Báo giá | `POST /payments/quote` |
| Khởi tạo thanh toán (VietQR) | `POST /payments/initiate` |
| Subscription/payment đang active | `GET /payments/active` |
| Trạng thái phiên thanh toán (poll) | `GET /payments/:sessionId/status` |
| Hủy phiên | `POST /payments/:sessionId/cancel` |
| Hoàn tiền | `POST /payments/:sessionId/refund` |
| Gia hạn | `POST /payments/renew` |
| Lịch sử thanh toán | `GET /payments/history` |

> **Thanh toán = VietQR bank transfer DUY NHẤT** (Apple IAP + VNPay đã gỡ). BE
> nhận `bank_transfer`. Đối soát thủ công bởi admin → bắn FCM
> `subscription_paid`. Xem §11 (iOS freemium).

### 5.7 Tài khoản nhận tiền OWNER (bank payout — admin duyệt)
| Chức năng | Method + Endpoint |
|---|---|
| Lấy trạng thái tài khoản | `GET /users/me/bank` |
| Gửi / sửa tài khoản (chờ duyệt) | `PUT /users/me/bank` |

> `PUT /users/:id` **không** còn nhận field `bank`. Tài khoản nhận tiền đi qua
> `/users/me/bank` + admin duyệt. Tạo phòng có thể yêu cầu `hasApprovedBank`.

### 5.8 Staff (OWNER mời nhân viên SALE qua email)
| Chức năng | Method + Endpoint |
|---|---|
| List lời mời | `GET /staff/invites` |
| Tạo lời mời | `POST /staff/invites` |
| Hủy lời mời | `DELETE /staff/invites/:id` |
| Verify token (public, màn accept) | `GET /staff/invites/verify/:token` |
| Chấp nhận lời mời | `POST /staff/invites/accept` |
| List nhân viên | `GET /staff` |
| Gỡ nhân viên | `DELETE /staff/:userId` |

Ngoài ra (user_repository, phục vụ gán SALE cho cơ sở):
- `GET /users/my-staff`, `GET /users/available-staff`,
  `DELETE /users/my-staff/:id`

### 5.9 Profile / Cài đặt / Hỗ trợ / GDPR
| Chức năng | Method + Endpoint |
|---|---|
| Upload đính kèm (ticket/feedback) | `POST /uploads`, `DELETE /uploads/:id` |
| List support ticket | `GET /support/tickets` |
| Chi tiết ticket | `GET /support/tickets/:id` |
| Tạo ticket | `POST /support/tickets` |
| Trả lời ticket | `POST /support/tickets/:id/reply` |
| Gửi feedback/report | `POST /feedback` |
| Yêu cầu xuất dữ liệu (GDPR) | `GET /users/me/data-export`, `POST /users/me/data-export` |
| Consent (marketing) | `GET /users/me/consents`, `PUT /users/me/consents` `{ marketing }` |
| Notification preferences | `GET/PUT /users/me/notification-preferences` |
| Trạng thái xóa tài khoản | `GET /users/me/deletion-status` |
| Khôi phục tài khoản | `POST /users/me/restore` |

### 5.10 Notifications (chuông trong app)
| Chức năng | Method + Endpoint |
|---|---|
| List thông báo | `GET /notifications` |
| Đếm chưa đọc | `GET /notifications/unread-count` |
| Đánh dấu đã đọc 1 | `PATCH /notifications/:id/read` |
| Đánh dấu đã đọc tất cả | `PATCH /notifications/read-all` |

### 5.11 Admin (ADMIN-only)
| Chức năng | Method + Endpoint |
|---|---|
| Tạo user | `POST /users` |
| Sửa user | `PUT /users/:id` |
| Xóa user | `DELETE /users/:id` |
| Chi tiết user | `GET /users/:id` |
| Hàng đợi KYC | `GET /admin/kyc/queue` |
| Chi tiết submission | `GET /kyc/submissions/:id` |
| Duyệt KYC | `POST /admin/kyc/submissions/:id/approve` |
| Từ chối KYC | `POST /admin/kyc/submissions/:id/reject` |
| Hàng đợi duyệt bank | `GET /admin/bank-accounts` |
| Duyệt bank | `POST /admin/users/:userId/bank/approve` |
| Từ chối bank | `POST /admin/users/:userId/bank/reject` |
| RBAC — xem quyền SALE | `GET /permissions/:userId` |
| RBAC — set quyền SALE | `PUT /permissions/:userId` |
| Moderation — disputes | `GET /admin/disputes` |
| Moderation — audit log | `GET /admin/audit-log` |

### 5.12 Devices (đăng ký FCM token)
| Chức năng | Method + Endpoint | Body |
|---|---|---|
| Đăng ký token | `POST /devices` | `{ fcmToken, platform, deviceId? }` |
| Hủy đăng ký | `DELETE /devices/:token` | — |

### 5.13 App version (force/soft update)
- `GET /app/version` → `{ latestVersion, minSupportedVersion, releaseNotes, storeUrl{ ios } }`

### 5.14 Partner API (tích hợp đối tác — header `X-Partner-Key`)
> Header `X-Partner-Key` truyền qua repository, không hardcode.

| Chức năng | Method + Endpoint |
|---|---|
| List property đối tác | `GET /partner/properties` |
| Chi tiết | `GET /partner/properties/:id` |
| Availability | `GET /partner/properties/:id/availability` |
| Tạo booking | `POST /partner/bookings` |
| Hủy booking | `POST /partner/bookings/:id/cancel` |

---

## 6. Chat realtime (Socket.IO + REST)

REST (lịch sử + fallback) và Socket.IO (`/chat` namespace, host = base URL) cho
OWNER/SALE ↔ khách (hội thoại `type=booking`) + support + nội bộ staff.

### 6.1 REST
| Chức năng | Method + Endpoint |
|---|---|
| List hội thoại (inbox) | `GET /conversations?...` |
| Đếm chưa đọc (badge) | `GET /conversations/unread-count` |
| Tạo / lấy hội thoại (idempotent, by-booking) | `POST /conversations` |
| Chi tiết hội thoại | `GET /conversations/:id` |
| Lịch sử tin nhắn | `GET /conversations/:id/messages` |
| Gửi tin (fallback khi socket rớt) | `POST /conversations/:id/messages` |
| Đánh dấu đã đọc | `PATCH /conversations/:id/read` |
| Sửa tin | `PATCH /conversations/messages/:messageId` `{ content }` |
| Xóa tin | `DELETE /conversations/messages/:messageId` |

### 6.2 Socket.IO — namespace `/chat`
App **eager-connect ngay khi login** (không chờ mở màn chat), tự hủy khi logout.
Reconnect có refresh token.

- **App lắng nghe (server → client):** `connect`, `disconnect`, `error`,
  `message:new`, `message:ack`, `message:edit`, `message:delete`, `read:update`,
  `typing`, `presence`
- **App phát (client → server):** `message:send`, `read` `{ conversationId }`,
  `typing:start` `{ conversationId }`, `typing:stop` `{ conversationId }`

---

## 7. Push Notification (FCM) — contract app đang xử lý

App đọc `pushType` từ `data.type` (fallback `data.pushType`). Handler:

| `pushType` | App làm gì khi nhận |
|---|---|
| `chat_message` | Bump badge chat (`/conversations/unread-count`); nếu đang mở đúng conversation + socket sống → **suppress banner** (WS đã render). Tap → deeplink `/conversations/:id` (lấy từ `data.targetId` hoặc `data.deepLink`). |
| `subscription_*` (vd `subscription_paid`) | Refresh `GET /auth/profile` (cập nhật banner + gate) ngay cả khi foreground |
| `bank_approved` / `bank_rejected` | (OWNER) refresh profile + reload trạng thái bank |
| `bank_submitted` | (ADMIN) reload hàng đợi duyệt bank |
| `booking_deposit_proof` / `booking_checkin_reminder` / `booking_completed` **(v1.31)** | (OWNER) tap → mở `/bookings/:id`. `booking_checkin_reminder` (15h ngày nhận phòng) → nhắc owner xác nhận check-in + thu nốt; `booking_deposit_proof` → khách vừa gửi ảnh bill cọc. |
| các type khác (booking/property/calendar/kyc...) | Bump badge chuông (`/notifications/unread-count`); tap → `resolveNotificationRoute(data)` dịch `deepLink` web → route app, fallback `/notifications` |

> BE nên gửi kèm `data.type`, `data.targetId` (hoặc `data.deepLink`). Với chat,
> `targetId` = conversationId để app deeplink + chống trùng banner.

---

## 8. Điểm cần BE lưu ý (hiện trạng & yêu cầu)

1. **iOS freemium (App Store reject lần 2):** trên iOS app **ẩn toàn bộ UI mua
   gói / subscription** (`AppConfig.hidePaidUpgradeUI`). KYC vẫn là cổng bắt buộc
   để tạo phòng. BE cần hỗ trợ: **duyệt KYC không cần payment**, **tạo phòng
   không cần subscription active**, và **1 demo account KYC-approved** cho
   reviewer. Face data: Cloudinary / no face-recognition / xóa khi xóa account
   (privacy policy v1.3 §2.5).
2. **Thanh toán chỉ `bank_transfer` (VietQR)**, admin đối soát thủ công → bắn FCM
   `subscription_paid`. Không auto-charge.
3. **Bank payout qua duyệt:** `GET/PUT /users/me/bank` + admin
   approve/reject; `PUT /users/:id` không nhận `bank`. Tạo phòng có thể yêu cầu
   `hasApprovedBank`.
4. **Auth không trả user** — bắt buộc `GET /auth/profile` sau login (§4).
5. **Session slot theo `X-Client-Type: mobile`** — refresh trả 403 = phiên bị đá.
6. **`standardChildren` (v1.27)** app đã gửi ở tạo/sửa property; filter
   adults/children hiện lọc client-side (chưa đẩy query param API).

---

## 9. Phụ lục — Endpoint đã định nghĩa nhưng app **chưa** wire

Có trong `api_constants.dart` nhưng chưa được repository gọi (để BE biết app có
thể dùng sau, đừng coi là đang chạy):
- `GET /properties/public` (`propertiesPublic`) — hiện màn list dùng
  `GET /properties`.
- `GET /admin/disputes/:id`, `GET /admin/disputes/count-active` — moderation mới
  gọi list + audit-log.
- `GET /users/:id` dạng `userDetail` cho vài chỗ; `bookingCalendar` constant
  không dùng (app gọi chuỗi `'/bookings/calendar/:id'` trực tiếp).

---

*Nguồn: source mobile `lib/` — `api_constants.dart`, các `*_repository.dart`,
`api_client.dart`, `chat_socket_service.dart`, `main.dart`. Field-level shape xem
`docs/API_SPEC_FULL.md`.*
