# Homestay API Documentation

> Base URL: `http://<server>:3000/api/v1`
> Swagger UI: `http://<server>:3000/index.html`
> Version: 1.0 | Cập nhật: 2026-03-17

---

## MỤC LỤC

1. [Thông tin chung](#1-thông-tin-chung)
2. [Auth — Xác thực](#2-auth--xác-thực)
3. [Users — Quản lý người dùng](#3-users--quản-lý-người-dùng)
4. [Homestays — Quản lý homestay](#4-homestays--quản-lý-homestay)
5. [Rooms — Quản lý phòng](#5-rooms--quản-lý-phòng)
6. [Prices — Giá phòng](#6-prices--giá-phòng)
7. [Bookings — Đặt phòng](#7-bookings--đặt-phòng)
8. [Partner — API cho đối tác](#8-partner--api-cho-đối-tác)

---

## 1. THÔNG TIN CHUNG

### 1.1 Headers

| Header | Giá trị | Bắt buộc | Mô tả |
|--------|---------|----------|-------|
| `Authorization` | `Bearer <accessToken>` | Có (trừ login/refresh/partner) | JWT token |
| `Content-Type` | `application/json` | Có (POST/PUT/PATCH) | Kiểu dữ liệu |
| `Accept-Language` | `vi` hoặc `en` | Không | Ngôn ngữ response (mặc định: `en`) |
| `X-Partner-Key` | `<api-key>` | Chỉ Partner API | API key cho đối tác |

### 1.2 Response Format

**Thành công:**
```json
{
  "success": true,
  "message": "Mô tả kết quả",
  "data": { ... }
}
```

**Lỗi:**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Mô tả lỗi",
  "errors": null,
  "path": "/api/v1/...",
  "timestamp": "2026-03-17T00:00:00.000Z"
}
```

### 1.3 Phân quyền (Roles)

| Role | Mô tả |
|------|-------|
| `ADMIN` | Full quyền, quản lý toàn hệ thống |
| `OWNER` | Quản lý homestay/phòng/giá của mình, xác nhận booking |
| `SALE` | Xem phòng, giữ phòng 30 phút, quản lý booking của mình |

### 1.4 HTTP Status Codes

| Code | Ý nghĩa |
|------|---------|
| `200` | Thành công |
| `201` | Tạo mới thành công |
| `400` | Dữ liệu không hợp lệ |
| `401` | Chưa đăng nhập / token hết hạn |
| `403` | Không có quyền |
| `404` | Không tìm thấy |
| `409` | Dữ liệu trùng lặp |
| `429` | Quá nhiều request (rate limit: 100 req/phút) |

---

## 2. AUTH — XÁC THỰC

### 2.1 Đăng nhập

```
POST /auth/login        [Public]
```

**Request body:**
```json
{
  "phone": "0900000001",     // Bắt buộc, string
  "password": "Abcd@1234"   // Bắt buộc, tối thiểu 6 ký tự
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "user": {
      "id": "uuid",
      "name": "Super Admin",
      "phone": "Admin",
      "role": "ADMIN"
    }
  }
}
```

**Lỗi thường gặp:**
- `401` — Sai phone/password hoặc tài khoản bị vô hiệu hóa
- `400` — Thiếu field hoặc password < 6 ký tự

> **Lưu ý:** `accessToken` hết hạn sau 15 phút, `refreshToken` sau 7 ngày.

---

### 2.2 Làm mới token

```
POST /auth/refresh      [Public]
```

**Request body:**
```json
{
  "refreshToken": "eyJhbG..."   // Bắt buộc
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbG...(mới)",
    "refreshToken": "eyJhbG...(mới)"
  }
}
```

**Lỗi:** `403` — Refresh token hết hạn hoặc không hợp lệ

> **Quan trọng:** Sau khi refresh, refreshToken cũ mất hiệu lực. App phải lưu cặp token mới.

---

### 2.3 Đăng xuất

```
POST /auth/logout       [Auth required]
```

**Response 200:**
```json
{
  "success": true,
  "message": "Logout successful",
  "data": null
}
```

---

### 2.4 Lấy thông tin user đang đăng nhập

```
GET /auth/profile       [Auth required]
```

**Response 200:**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "id": "uuid",
    "name": "Super Admin",
    "phone": "Admin",
    "email": null,
    "role": "ADMIN",
    "createdAt": "2026-03-17T10:00:00.000Z"
  }
}
```

---

## 3. USERS — QUẢN LÝ NGƯỜI DÙNG

> Tất cả endpoint trong module này yêu cầu role **ADMIN**

### 3.1 Danh sách user

```
GET /users              [ADMIN]
GET /users?role=OWNER   [ADMIN] — Lọc theo role
```

**Response 200:**
```json
{
  "success": true,
  "message": "User list retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "name": "Owner Test",
      "phone": "0900000001",
      "email": null,
      "role": "OWNER",
      "isActive": true,
      "createdAt": "2026-03-17T10:00:00.000Z"
    }
  ]
}
```

---

### 3.2 Chi tiết user

```
GET /users/:id          [ADMIN]
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Owner Test",
    "phone": "0900000001",
    "email": null,
    "role": "OWNER",
    "isActive": true,
    "createdAt": "...",
    "homestays": [
      { "id": "uuid", "name": "Homestay A", "address": "123 Beach" }
    ]
  }
}
```

---

### 3.3 Tạo user

```
POST /users             [ADMIN]
```

**Request body:**
```json
{
  "name": "Tên người dùng",           // Bắt buộc
  "phone": "0900000001",              // Bắt buộc, format: 0xxxxxxxxx hoặc +84xxxxxxxxx
  "password": "MatKhau@123",          // Bắt buộc, tối thiểu 6 ký tự
  "role": "OWNER",                    // Bắt buộc: "ADMIN" | "OWNER" | "SALE"
  "email": "email@example.com"        // Tùy chọn
}
```

**Lỗi:** `409` — Số điện thoại đã tồn tại

---

### 3.4 Cập nhật user

```
PUT /users/:id          [ADMIN]
```

**Request body:** (tất cả field đều tùy chọn)
```json
{
  "name": "Tên mới",
  "phone": "0900000009",
  "email": "new@email.com",
  "password": "NewPass@123",
  "role": "SALE",
  "isActive": false
}
```

---

### 3.5 Vô hiệu hóa user (soft delete)

```
DELETE /users/:id       [ADMIN]
```

> Không xoá thật, chỉ set `isActive = false`. Không thể xoá chính mình.

---

## 4. HOMESTAYS — QUẢN LÝ HOMESTAY

### 4.1 Danh sách homestay

```
GET /homestays          [Auth required]
```

- **ADMIN/SALE:** Thấy tất cả homestay active
- **OWNER:** Chỉ thấy homestay của mình

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "ownerId": "uuid",
      "name": "Homestay A",
      "address": "123 Beach Rd",
      "latitude": null,
      "longitude": null,
      "mapLink": null,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "...",
      "owner": { "id": "uuid", "name": "Owner", "phone": "0900000001" },
      "_count": { "rooms": 5 }
    }
  ]
}
```

---

### 4.2 Chi tiết homestay

```
GET /homestays/:id      [Auth required]
```

**Response 200:** Trả kèm danh sách phòng, ảnh, giá, số booking

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Homestay A",
    "address": "123 Beach",
    "owner": { "id": "uuid", "name": "Owner", "phone": "..." },
    "rooms": [
      {
        "id": "uuid",
        "name": "Room 101",
        "code": "HS-A-101",
        "bedrooms": 2,
        "maxGuests": 4,
        "images": [{ "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }],
        "price": { "weekdayPrice": 500000, "fridayPrice": 600000, "saturdayPrice": 800000, "holidayPrice": 1000000 },
        "_count": { "bookings": 3 }
      }
    ]
  }
}
```

---

### 4.3 Tạo homestay

```
POST /homestays         [ADMIN, OWNER]
```

**Request body:**
```json
{
  "name": "Homestay mới",        // Bắt buộc
  "address": "Địa chỉ",          // Bắt buộc
  "latitude": 10.762622,          // Tùy chọn
  "longitude": 106.660172,        // Tùy chọn
  "mapLink": "https://maps...",   // Tùy chọn
  "ownerId": "uuid"               // Tùy chọn — chỉ ADMIN dùng để gán owner
}
```

> **OWNER:** Tự động gán `ownerId = user đăng nhập`. Không cần truyền `ownerId`.

---

### 4.4 Cập nhật homestay

```
PUT /homestays/:id      [ADMIN, OWNER]
```

**Request body:** (tùy chọn)
```json
{
  "name": "Tên mới",
  "address": "Địa chỉ mới",
  "latitude": 10.0,
  "longitude": 106.0,
  "mapLink": "https://...",
  "isActive": true
}
```

> **OWNER:** Chỉ update được homestay của mình

---

### 4.5 Xoá homestay (soft delete)

```
DELETE /homestays/:id   [ADMIN, OWNER]
```

---

## 5. ROOMS — QUẢN LÝ PHÒNG

### 5.1 Danh sách phòng

```
GET /rooms                        [Auth required]
GET /rooms?homestayId=<uuid>      [Auth required] — Lọc theo homestay
```

- **OWNER:** Chỉ thấy phòng thuộc homestay mình

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "homestayId": "uuid",
      "name": "Room 101",
      "code": "HS-A-101",
      "bedrooms": 2,
      "maxGuests": 4,
      "description": "Sea view",
      "isActive": true,
      "homestay": { "id": "uuid", "name": "Homestay A", "address": "..." },
      "images": [{ "imageUrl": "https://...", "isCover": true }],
      "price": { "weekdayPrice": 500000, ... },
      "_count": { "bookings": 2 }
    }
  ]
}
```

---

### 5.2 Chi tiết phòng

```
GET /rooms/:id          [Auth required]
```

**Response 200:** Trả đầy đủ: homestay info, owner info, tất cả ảnh, giá

---

### 5.3 Tạo phòng

```
POST /rooms             [ADMIN, OWNER]
```

**Request body:**
```json
{
  "homestayId": "uuid",     // Bắt buộc
  "name": "Room 101",       // Bắt buộc
  "code": "HS-A-101",       // Bắt buộc, unique toàn hệ thống
  "bedrooms": 2,            // Tùy chọn (default: 1)
  "maxGuests": 4,           // Tùy chọn (default: 2)
  "description": "Mô tả"   // Tùy chọn
}
```

**Lỗi:** `409` — Mã phòng đã tồn tại

---

### 5.4 Cập nhật phòng

```
PUT /rooms/:id          [ADMIN, OWNER]
```

---

### 5.5 Xoá phòng (soft delete)

```
DELETE /rooms/:id       [ADMIN, OWNER]
```

---

### 5.6 Upload ảnh phòng

```
POST /rooms/:id/images  [ADMIN, OWNER]
Content-Type: multipart/form-data
```

**Form data:**
- `images`: File[] — tối đa 10 file/request, tối đa 20 ảnh/phòng
- Chỉ chấp nhận: `image/jpeg`, `image/png`, `image/webp`
- Giới hạn: 10MB/file
- Ảnh đầu tiên tự động là ảnh bìa (cover)

**Response 200:**
```json
{
  "success": true,
  "message": "3 image(s) uploaded successfully",
  "data": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "imageUrl": "https://res.cloudinary.com/...",
      "publicId": "homestay/rooms/...",
      "isCover": true,
      "order": 0
    }
  ]
}
```

---

### 5.7 Xoá ảnh phòng

```
DELETE /rooms/:id/images/:imageId   [ADMIN, OWNER]
```

> Nếu xoá ảnh cover, ảnh tiếp theo tự động thành cover

---

### 5.8 Đặt ảnh làm cover

```
PATCH /rooms/:id/images/:imageId/cover   [ADMIN, OWNER]
```

---

## 6. PRICES — GIÁ PHÒNG

### 6.1 Lấy giá phòng

```
GET /rooms/:roomId/prices   [Auth required]
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "weekdayPrice": 500000,      // Thứ 2-5
    "fridayPrice": 600000,       // Thứ 6
    "saturdayPrice": 800000,     // Thứ 7
    "holidayPrice": 1000000,     // Ngày lễ
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Lỗi:** `404` — Chưa có giá

---

### 6.2 Tạo/cập nhật giá phòng

```
PUT /rooms/:roomId/prices   [ADMIN, OWNER]
```

**Request body:** (tất cả tùy chọn, upsert)
```json
{
  "weekdayPrice": 500000,
  "fridayPrice": 600000,
  "saturdayPrice": 800000,
  "holidayPrice": 1000000
}
```

> Nếu chưa có giá → tạo mới. Nếu đã có → cập nhật field được gửi.

---

## 7. BOOKINGS — ĐẶT PHÒNG

### 7.1 Danh sách booking

```
GET /bookings                    [Auth required]
GET /bookings?roomId=<uuid>      [Auth required] — Lọc theo phòng
```

- **ADMIN:** Thấy tất cả
- **OWNER:** Thấy booking thuộc phòng trong homestay mình
- **SALE:** Chỉ thấy booking mình tạo

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "saleId": "uuid",
      "checkinDate": "2026-04-01T00:00:00.000Z",
      "checkoutDate": "2026-04-03T00:00:00.000Z",
      "status": "HOLD",
      "holdExpireAt": "2026-03-17T16:00:00.000Z",
      "customerName": "Nguyen Van A",
      "customerPhone": "0911111111",
      "depositAmount": null,
      "notes": null,
      "holdRemainingSeconds": 1500,
      "room": {
        "id": "uuid", "name": "Room 101", "code": "HS-A-101",
        "homestay": { "id": "uuid", "name": "Homestay A" }
      },
      "sale": { "id": "uuid", "name": "Sale Name", "phone": "..." }
    }
  ]
}
```

> `holdRemainingSeconds` chỉ xuất hiện khi `status = "HOLD"`

---

### 7.2 Chi tiết booking

```
GET /bookings/:id       [Auth required]
```

Response bao gồm: room detail, images, price, sale info, holdRemainingSeconds

---

### 7.3 Giữ phòng (Hold)

```
POST /bookings/hold     [ADMIN, SALE]
```

**Request body:**
```json
{
  "roomId": "uuid",                   // Bắt buộc
  "checkinDate": "2026-04-01",        // Bắt buộc, ISO date
  "checkoutDate": "2026-04-03",       // Bắt buộc, phải sau checkinDate
  "customerName": "Nguyen Van A",     // Tùy chọn
  "customerPhone": "0911111111",      // Tùy chọn
  "depositAmount": 500000,            // Tùy chọn
  "notes": "Ghi chú"                  // Tùy chọn
}
```

**Response 200:**
```json
{
  "success": true,
  "message": "Room held successfully (30 minutes)",
  "data": {
    "id": "uuid",
    "status": "HOLD",
    "holdRemainingSeconds": 1800,
    "room": { "id": "...", "name": "Room 101", "code": "HS-A-101" },
    "sale": { "id": "...", "name": "Sale Name" },
    ...
  }
}
```

**Lỗi thường gặp:**
- `400` — Checkout trước checkin
- `400` — Checkin trong quá khứ
- `400` — Phòng đang được giữ bởi người khác
- `400` — Phòng đã có booking CONFIRMED trong khoảng ngày
- `404` — Phòng không tồn tại

> **Logic hold:**
> - Mỗi phòng chỉ 1 hold tại 1 thời điểm
> - Cùng SALE hold lại → hold cũ bị huỷ, thay bằng hold mới
> - Hold tự hết hạn sau 30 phút (status → CANCELLED)
> - SALE khác hold phòng đang hold → bị chặn (chờ hết thời gian)

---

### 7.4 Xác nhận booking

```
PATCH /bookings/:id/confirm   [ADMIN, OWNER]
```

> Chỉ confirm được booking đang ở `status = "HOLD"`. OWNER chỉ confirm booking thuộc homestay mình.

**Response 200:**
```json
{
  "success": true,
  "message": "Booking confirmed successfully",
  "data": { "id": "...", "status": "CONFIRMED", ... }
}
```

---

### 7.5 Huỷ booking

```
PATCH /bookings/:id/cancel    [Auth required]
```

> - **ADMIN:** Huỷ bất kỳ
> - **OWNER:** Huỷ booking thuộc homestay mình
> - **SALE:** Chỉ huỷ booking mình tạo

---

### 7.6 Cập nhật thông tin booking

```
PUT /bookings/:id       [Auth required]
```

**Request body:** (tùy chọn)
```json
{
  "customerName": "Tên mới",
  "customerPhone": "0999999999",
  "depositAmount": 1000000,
  "notes": "Ghi chú mới"
}
```

> Không thể thay đổi `status` qua endpoint này. Dùng `/confirm` hoặc `/cancel`.

---

### 7.7 Lịch đặt phòng (Calendar)

```
GET /bookings/calendar/:roomId?year=2026&month=4   [Auth required]
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "checkinDate": "2026-04-01T00:00:00.000Z",
      "checkoutDate": "2026-04-03T00:00:00.000Z",
      "status": "CONFIRMED",
      "customerName": "Nguyen Van A",
      "sale": { "name": "Sale Test" }
    }
  ]
}
```

> Trả tất cả booking HOLD + CONFIRMED có ngày nằm trong tháng được query. Booking HOLD kèm `holdRemainingSeconds`.

---

## 8. PARTNER — API CHO ĐỐI TÁC

> Không cần JWT. Xác thực bằng header `X-Partner-Key`.

### 8.1 Danh sách phòng

```
GET /partner/rooms                         [Partner Key]
GET /partner/rooms?homestayId=<uuid>       [Partner Key] — Lọc homestay
GET /partner/rooms?page=1&limit=20         [Partner Key] — Phân trang
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Room 101",
      "code": "HS-A-101",
      "bedrooms": 2,
      "maxGuests": 4,
      "homestay": { "id": "uuid", "name": "Homestay A", "address": "..." },
      "images": [{ "imageUrl": "https://...", "isCover": true }],
      "price": { "weekdayPrice": 500000, ... }
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### 8.2 Chi tiết phòng

```
GET /partner/rooms/:id   [Partner Key]
```

---

### 8.3 Lịch trống phòng

```
GET /partner/rooms/:id/availability?year=2026&month=4   [Partner Key]
```

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "checkinDate": "2026-04-01T00:00:00.000Z",
      "checkoutDate": "2026-04-03T00:00:00.000Z",
      "status": "CONFIRMED"
    }
  ]
}
```

> Chỉ trả booking CONFIRMED. Partner dùng data này để render lịch "đã đặt".

---

### 8.4 Tạo booking

```
POST /partner/bookings   [Partner Key]
```

**Request body:**
```json
{
  "roomId": "uuid",                    // Bắt buộc
  "checkinDate": "2026-06-01",         // Bắt buộc
  "checkoutDate": "2026-06-03",        // Bắt buộc
  "customerName": "Khách hàng",        // Bắt buộc
  "customerPhone": "0888888888",       // Bắt buộc
  "notes": "Ghi chú",                  // Tùy chọn
  "partnerRef": "PNR-12345"            // Tùy chọn — mã tham chiếu bên partner
}
```

> Booking được tạo ở trạng thái HOLD (30 phút), chờ ADMIN/OWNER xác nhận.

---

### 8.5 Huỷ booking

```
POST /partner/bookings/:id/cancel   [Partner Key]
```

---

## PHỤ LỤC

### A. Booking Status Flow

```
        ┌──────────┐
        │          │
  POST /hold  ──→  HOLD  ──→  (30 phút timeout) ──→  CANCELLED
        │          │
        │   PATCH /confirm
        │          │
        │          ▼
        │      CONFIRMED  ──→  PATCH /cancel  ──→  CANCELLED
        │          │
        │   (future: auto)
        │          │
        │          ▼
        │      COMPLETED
        └──────────┘
```

### B. JWT Token Flow (cho Mobile App)

```
1. Login  → Nhận accessToken + refreshToken
2. Mọi request → Header: Authorization: Bearer <accessToken>
3. accessToken hết hạn (15 phút) → Gọi POST /auth/refresh
4. refreshToken hết hạn (7 ngày) → Redirect về màn hình Login
5. Logout → Gọi POST /auth/logout + xoá token local
```

**Xử lý token trong app:**
```
- Lưu cả 2 token vào Secure Storage
- Khi nhận response 401 → Thử refresh token
- Nếu refresh thất bại (403) → Xoá token, về Login
- Sau refresh → Lưu cặp token mới, retry request gốc
```

### C. Enum Values

| Enum | Giá trị |
|------|---------|
| Role | `ADMIN`, `OWNER`, `SALE` |
| BookingStatus | `HOLD`, `CONFIRMED`, `CANCELLED`, `COMPLETED` |
