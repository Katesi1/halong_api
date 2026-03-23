# API Documentation — Halong24h Homestay Management

> Tài liệu FULL cho Backend Developer
> App: Halong24h — Homestay Management (Flutter Mobile)
> Cập nhật: 2026-03-20

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Authentication & Token](#2-authentication--token)
3. [Role System](#3-role-system)
4. [Response Format chung](#4-response-format-chung)
5. [API Endpoints — Auth](#5-api-endpoints--auth)
6. [API Endpoints — Users](#6-api-endpoints--users)
7. [API Endpoints — Homestays](#7-api-endpoints--homestays)
8. [API Endpoints — Rooms](#8-api-endpoints--rooms)
9. [API Endpoints — Bookings (Staff)](#9-api-endpoints--bookings-staff)
10. [API Endpoints — Customer](#10-api-endpoints--customer)
11. [Data Models](#11-data-models)
12. [Migration từ hệ thống cũ](#12-migration-từ-hệ-thống-cũ)
13. [Cron Jobs](#13-cron-jobs)
14. [Tổng hợp endpoints](#14-tổng-hợp-endpoints)

---

## 1. Tổng quan hệ thống

| Thông tin | Giá trị |
|-----------|---------|
| Base URL | `http://103.183.118.148:3000` |
| Content-Type | `application/json` |
| Auth | Bearer Token (JWT) |
| Connect Timeout | 30s |
| Receive Timeout | 30s |

### App gọi API bằng gì

- HTTP client: **Dio 5** (Flutter)
- Token tự động gắn header `Authorization: Bearer <token>` qua interceptor
- Auto refresh token khi nhận 401
- Token lưu trong `FlutterSecureStorage` (encrypted)

---

## 2. Authentication & Token

### Flow xác thực

```
1. Login/Register → Backend trả { accessToken, refreshToken, user }
2. App lưu tokens vào SecureStorage
3. Mọi request → Interceptor gắn: Authorization: Bearer <accessToken>
4. Nếu 401 → Interceptor tự gọi /auth/refresh → lưu token mới → retry request gốc
5. Nếu refresh cũng fail → clear tokens → redirect /login
```

### Token refresh (tự động, app tự gọi)

```
POST /auth/refresh
```

**Request:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Response (200):**
```json
{
  "data": {
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token (optional, null nếu không rotate)"
  }
}
```

**Logic backend:**
- Verify `refreshToken` hợp lệ
- Nếu hợp lệ → generate `accessToken` mới (+ optionally `refreshToken` mới)
- Nếu không → trả 401

---

## 3. Role System

### 3 Role

| Role | Giá trị DB | Mô tả | Cách tạo |
|------|-----------|-------|----------|
| **ADMIN** | `ADMIN` | Quản trị toàn hệ thống | **Chỉ seed trong DB**, không đăng ký |
| **STAFF** | `STAFF` | Nhân viên quản lý homestay | Tự đăng ký |
| **CUSTOMER** | `CUSTOMER` | Khách hàng đặt phòng | Tự đăng ký |

### Bảng quyền chi tiết

| Chức năng | ADMIN | STAFF | CUSTOMER |
|-----------|:-----:|:-----:|:--------:|
| **Auth** | | | |
| Đăng nhập (phone/password) | ✅ | ✅ | ✅ |
| Đăng nhập Google | ✅ | ✅ | ✅ |
| Đăng ký | ❌ (seed) | ✅ | ✅ |
| **Users** | | | |
| Xem danh sách users | ✅ | ❌ | ❌ |
| Tạo / sửa / xoá user | ✅ | ❌ | ❌ |
| **Homestays** | | | |
| Xem danh sách homestays | ✅ | ✅ | ❌ |
| Tạo / sửa / xoá homestay | ✅ | ✅ (của mình) | ❌ |
| **Rooms (quản lý)** | | | |
| GET /rooms (full, nội bộ) | ✅ | ✅ | ❌ |
| Tạo / sửa / xoá phòng | ✅ | ✅ | ❌ |
| Upload / xoá ảnh phòng | ✅ | ✅ | ❌ |
| Cập nhật giá phòng | ✅ | ✅ | ❌ |
| **Rooms (public)** | | | |
| GET /rooms/public | ✅ | ✅ | ✅ |
| **Bookings (quản lý)** | | | |
| Xem tất cả bookings | ✅ | ✅ | ❌ |
| Xem lịch booking (calendar) | ✅ | ✅ | ❌ |
| Hold phòng (staff) | ✅ | ✅ | ❌ |
| Xác nhận booking | ✅ | ✅ | ❌ |
| Huỷ booking (staff) | ✅ | ✅ | ❌ |
| Sửa booking | ✅ | ✅ | ❌ |
| **Bookings (customer)** | | | |
| Đặt phòng (customer-hold) | ❌ | ❌ | ✅ |
| Xem booking của mình | ❌ | ❌ | ✅ |
| Huỷ booking của mình (HOLD) | ❌ | ❌ | ✅ |

> **Lưu ý:** ADMIN và STAFF trên app có thể toggle "Xem như khách" — khi đó app dùng các endpoint Customer. Backend cần cho phép ADMIN/STAFF gọi endpoint Customer nếu muốn.

---

## 4. Response Format chung

### Success

```json
{
  "success": true,
  "data": { ... },
  "message": "Thao tác thành công"
}
```

### Error

```json
{
  "success": false,
  "message": "Mô tả lỗi bằng tiếng Việt"
}
```

### HTTP Status Codes

| Code | Dùng khi |
|------|---------|
| 200 | Thành công (GET, PUT, PATCH) |
| 201 | Tạo mới thành công (POST) |
| 400 | Request không hợp lệ (thiếu field, validation fail) |
| 401 | Chưa đăng nhập / token hết hạn |
| 403 | Không có quyền (role không đủ) |
| 404 | Không tìm thấy resource |
| 409 | Conflict (phone trùng, phòng đã đặt) |
| 500 | Lỗi server |

### Parse lỗi từ app

App đọc lỗi theo thứ tự:
1. `response.data['message']` — **ưu tiên hiển thị cho user**
2. Nếu không có → map theo DioExceptionType (timeout, connection error)

→ Backend **NÊN** trả `message` bằng tiếng Việt, user-friendly.

---

## 5. API Endpoints — Auth

### 5.1. Đăng ký (MỚI)

```
POST /auth/register
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | ✅ | 2-100 ký tự |
| `phone` | string | ✅ | Unique, 10-11 số, bắt đầu bằng 0 |
| `password` | string | ✅ | Tối thiểu 6 ký tự |
| `role` | string | ✅ | **Chỉ chấp nhận**: `"STAFF"` hoặc `"CUSTOMER"` |
| `email` | string | ❌ | Email hợp lệ, unique nếu có |

**Validation quan trọng:**
- `role` **KHÔNG ĐƯỢC** là `"ADMIN"` → reject 400
- `phone` unique → nếu trùng trả 409
- Sau đăng ký → **trả token luôn** (auto-login, app không cần gọi login lại)

**Request:**
```json
{
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "password": "matkhau123",
  "role": "CUSTOMER",
  "email": "a@example.com"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Đăng ký thành công",
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "user": {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "phone": "0912345678",
      "email": "a@example.com",
      "role": "CUSTOMER",
      "isActive": true
    }
  }
}
```

**Errors:**
- 400: `{ "success": false, "message": "Role không hợp lệ. Chỉ chấp nhận STAFF hoặc CUSTOMER" }`
- 409: `{ "success": false, "message": "Số điện thoại đã được đăng ký" }`

---

### 5.2. Đăng nhập (phone/password)

```
POST /auth/login
```

**Request:**
```json
{
  "phone": "0912345678",
  "password": "matkhau123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "user": {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "phone": "0912345678",
      "email": "a@example.com",
      "role": "STAFF",
      "isActive": true
    }
  }
}
```

---

### 5.3. Đăng nhập Google (CẬP NHẬT — thêm field `role`)

```
POST /auth/google
```

**Request:**
```json
{
  "idToken": "eyJhbGciOi... (Google ID Token)",
  "role": "CUSTOMER"
}
```

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `idToken` | string | ✅ | Google ID Token |
| `role` | string | **Chỉ khi user mới** | `"STAFF"` hoặc `"CUSTOMER"` |

**Logic backend:**
1. Verify `idToken` với Google
2. Lấy email từ token
3. Tìm user bằng email:
   - **Đã có** → login bình thường, **bỏ qua** field `role`
   - **Chưa có** → tạo user mới với `role` từ request. Nếu thiếu `role` → trả 400
4. `role` **KHÔNG được** là `"ADMIN"`

**Response:** Giống login (accessToken + refreshToken + user)

---

### 5.4. Quên mật khẩu

```
POST /auth/forgot-password
```

**Request:**
```json
{
  "identifier": "0912345678"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Đã gửi mã xác nhận"
}
```

---

### 5.5. Đặt lại mật khẩu

```
POST /auth/reset-password
```

**Request:**
```json
{
  "token": "reset-token-string",
  "newPassword": "matkhaumoi123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Đặt lại mật khẩu thành công"
}
```

---

### 5.6. Đăng xuất

```
POST /auth/logout
```

**Headers:** `Authorization: Bearer <accessToken>`
**Request Body:** (không có)
**Response:** (bất kỳ — app bỏ qua response)

**App sẽ:**
- Gọi `GoogleSignIn.signOut()` (client-side)
- Gọi `POST /auth/logout` (server-side)
- Clear tất cả tokens + user data từ SecureStorage

---

### 5.7. Refresh Token

```
POST /auth/refresh
```

**Request:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Headers:** App gửi với `Authorization: null` (bỏ qua access token cũ)

**Response (200):**
```json
{
  "data": {
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token (hoặc null nếu không rotate)"
  }
}
```

---

## 6. API Endpoints — Users

> **Quyền:** Chỉ ADMIN

### 6.1. Danh sách users

```
GET /users?role=STAFF
```

| Query Param | Type | Mô tả |
|-------------|------|-------|
| `role` | string | Lọc theo role: `ADMIN`, `STAFF`, `CUSTOMER` |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "phone": "0912345678",
      "email": "a@test.com",
      "role": "STAFF",
      "isActive": true
    }
  ]
}
```

### 6.2. Chi tiết user

```
GET /users/:id
```

**Response:** `{ "data": UserModel }`

### 6.3. Tạo user

```
POST /users
```

**Request:**
```json
{
  "name": "string",
  "phone": "string",
  "password": "string",
  "role": "ADMIN | STAFF | CUSTOMER",
  "email": "string (optional)"
}
```

**Response (201):** `{ "data": UserModel }`

### 6.4. Sửa user

```
PUT /users/:id
```

**Request:** Partial update — chỉ gửi field cần sửa
```json
{
  "name": "Tên mới",
  "role": "STAFF",
  "isActive": false
}
```

**Response (200):** `{ "data": UserModel }`

### 6.5. Xoá user

```
DELETE /users/:id
```

**Response (200):** `{ "success": true, "message": "Đã xoá" }`

---

## 7. API Endpoints — Homestays

> **Quyền:** ADMIN + STAFF

### 7.1. Danh sách homestays

```
GET /homestays
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "ownerId": "user-uuid",
      "name": "Halong Bay Resort",
      "address": "Bãi Cháy, Hạ Long",
      "latitude": 20.9545,
      "longitude": 107.0509,
      "mapLink": "https://maps.google.com/...",
      "isActive": true,
      "owner": { "name": "Admin" },
      "_count": { "rooms": 12 }
    }
  ]
}
```

> App đọc `json['_count']['rooms']` để hiển thị số phòng.

### 7.2. Chi tiết homestay

```
GET /homestays/:id
```

### 7.3. Tạo homestay

```
POST /homestays
```

**Request:**
```json
{
  "name": "string",
  "address": "string",
  "latitude": 20.9545,
  "longitude": 107.0509,
  "mapLink": "string (optional)"
}
```

### 7.4. Sửa homestay

```
PUT /homestays/:id
```

### 7.5. Xoá homestay

```
DELETE /homestays/:id
```

---

## 8. API Endpoints — Rooms

> **Quyền:** ADMIN + STAFF (trừ `/rooms/public`)

### 8.1. Danh sách phòng (nội bộ)

```
GET /rooms?homestayId=xxx
```

| Query Param | Type | Mô tả |
|-------------|------|-------|
| `homestayId` | string | Lọc theo homestay |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "homestayId": "hs-uuid",
      "name": "Deluxe Ocean View",
      "code": "P.101",
      "bedrooms": 2,
      "maxGuests": 4,
      "description": "Phòng view biển đẹp",
      "isActive": true,
      "images": [
        {
          "id": "img-uuid",
          "roomId": "room-uuid",
          "imageUrl": "https://cloudinary.com/xxx.jpg",
          "publicId": "halong24h/rooms/xxx",
          "isCover": true,
          "order": 0
        }
      ],
      "price": {
        "id": "price-uuid",
        "roomId": "room-uuid",
        "weekdayPrice": 800000,
        "fridayPrice": 1000000,
        "saturdayPrice": 1200000,
        "holidayPrice": 1500000
      },
      "homestay": {
        "id": "hs-uuid",
        "name": "Halong Bay Resort",
        "address": "Bãi Cháy, Hạ Long",
        "latitude": 20.9545,
        "longitude": 107.0509,
        "mapLink": null
      }
    }
  ]
}
```

### 8.2. Chi tiết phòng

```
GET /rooms/:id
```

**Response:** `{ "data": RoomModel }` (cùng format như list item)

### 8.3. Tạo phòng

```
POST /rooms
```

**Request:**
```json
{
  "homestayId": "hs-uuid",
  "name": "Standard Room",
  "code": "P.201",
  "bedrooms": 1,
  "maxGuests": 2,
  "description": "Phòng tiêu chuẩn",
  "isActive": true
}
```

### 8.4. Sửa phòng

```
PUT /rooms/:id
```

### 8.5. Xoá phòng

```
DELETE /rooms/:id
```

### 8.6. Upload ảnh phòng

```
POST /rooms/:id/images
Content-Type: multipart/form-data
```

**Request:** FormData với field `images` (mảng file)

```
images: [File1, File2, File3]
```

**Response (201):**
```json
{
  "success": true,
  "data": [
    {
      "id": "img-uuid",
      "roomId": "room-uuid",
      "imageUrl": "https://cloudinary.com/xxx.jpg",
      "publicId": "halong24h/rooms/xxx",
      "isCover": false,
      "order": 1
    }
  ]
}
```

### 8.7. Xoá ảnh phòng

```
DELETE /rooms/:roomId/images/:imageId
```

### 8.8. Đặt ảnh bìa

```
PATCH /rooms/:roomId/images/:imageId/cover
```

**Response (200):** `{ "success": true }`

> Backend cần set tất cả ảnh khác của phòng `isCover = false`, chỉ ảnh này `isCover = true`.

### 8.9. Cập nhật giá phòng

```
PUT /rooms/:roomId/prices
```

**Request:**
```json
{
  "weekdayPrice": 800000,
  "fridayPrice": 1000000,
  "saturdayPrice": 1200000,
  "holidayPrice": 1500000
}
```

**Response (200):** `{ "data": RoomPriceModel }`

> **Upsert logic**: Nếu chưa có price → tạo mới. Nếu đã có → update.

---

## 9. API Endpoints — Bookings (Staff)

> **Quyền:** ADMIN + STAFF

### 9.1. Danh sách bookings

```
GET /bookings?roomId=xxx
```

| Query Param | Type | Mô tả |
|-------------|------|-------|
| `roomId` | string | Lọc theo phòng |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "booking-uuid",
      "roomId": "room-uuid",
      "saleId": "staff-uuid",
      "checkinDate": "2026-04-01T00:00:00.000Z",
      "checkoutDate": "2026-04-03T00:00:00.000Z",
      "status": "HOLD",
      "holdExpireAt": "2026-04-01T10:30:00.000Z",
      "customerName": "Khách Test",
      "customerPhone": "0912345678",
      "depositAmount": 500000,
      "notes": "Cần giường phụ",
      "holdRemainingSeconds": 1800,
      "room": {
        "name": "P.101 Deluxe",
        "homestay": { "name": "Halong Bay Resort" }
      },
      "sale": { "name": "Staff A" }
    }
  ]
}
```

> **`holdRemainingSeconds`**: Backend tính = max(0, holdExpireAt - now) tính bằng giây. App hiển thị countdown.

### 9.2. Lịch booking theo phòng

```
GET /bookings/calendar/:roomId?year=2026&month=4
```

| Query Param | Type | Mô tả |
|-------------|------|-------|
| `year` | number | Năm |
| `month` | number | Tháng (1-12) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "booking-uuid",
      "checkinDate": "2026-04-01T00:00:00.000Z",
      "checkoutDate": "2026-04-04T00:00:00.000Z",
      "status": "CONFIRMED",
      "customerName": "Khách A",
      "holdRemainingSeconds": 0
    }
  ]
}
```

> App dùng để tô màu ngày trên calendar. Ngày checkout **không tính** là ngày chiếm phòng.

### 9.3. Hold phòng (staff tạo booking)

```
POST /bookings/hold
```

**Request:**
```json
{
  "roomId": "room-uuid",
  "checkinDate": "2026-04-01",
  "checkoutDate": "2026-04-03",
  "customerName": "Nguyễn Văn A",
  "customerPhone": "0912345678",
  "depositAmount": 500000,
  "notes": "Ghi chú"
}
```

**Response (201):** `{ "data": BookingModel }`

> Backend tự set: `saleId = current user`, `status = HOLD`, `holdExpireAt = now + 30min` (hoặc config)

### 9.4. Xác nhận booking

```
PATCH /bookings/:id/confirm
```

**Request:** (không có body)
**Response (200):** `{ "data": BookingModel }` với `status = CONFIRMED`

### 9.5. Huỷ booking (staff)

```
PATCH /bookings/:id/cancel
```

**Request:** (không có body)
**Response (200):** `{ "success": true, "message": "Huỷ booking thành công" }`

### 9.6. Sửa booking

```
PUT /bookings/:id
```

**Request:** Partial update
```json
{
  "customerName": "Tên mới",
  "notes": "Ghi chú mới"
}
```

---

## 10. API Endpoints — Customer

> **Quyền:** CUSTOMER (+ ADMIN/STAFF khi ở chế độ "Xem như khách")

### 10.1. Danh sách phòng công khai (MỚI)

```
GET /rooms/public
```

| Query Param | Type | Mô tả |
|-------------|------|-------|
| `checkinDate` | string | `YYYY-MM-DD` — lọc phòng trống |
| `checkoutDate` | string | `YYYY-MM-DD` — lọc phòng trống |
| `guests` | number | Số khách — lọc `maxGuests >= guests` |
| `minPrice` | number | Giá tối thiểu |
| `maxPrice` | number | Giá tối đa |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "room-uuid",
      "homestayId": "hs-uuid",
      "name": "Deluxe Ocean View",
      "code": "P.101",
      "bedrooms": 2,
      "maxGuests": 4,
      "description": "View biển đẹp",
      "isActive": true,
      "images": [ ... ],
      "price": {
        "weekdayPrice": 800000,
        "fridayPrice": 1000000,
        "saturdayPrice": 1200000,
        "holidayPrice": 1500000
      },
      "homestay": {
        "id": "hs-uuid",
        "name": "Halong Bay Resort",
        "address": "Bãi Cháy"
      }
    }
  ]
}
```

**Khác biệt với `GET /rooms`:**
- Chỉ trả phòng có `isActive = true`
- Nếu có `checkinDate` + `checkoutDate` → chỉ trả phòng **không có booking trùng ngày**
- Nếu có `guests` → chỉ trả phòng `maxGuests >= guests`
- Nếu có `minPrice`/`maxPrice` → lọc theo `weekdayPrice` (giá thấp nhất)
- Response format **giống** `GET /rooms` (cùng model `RoomModel`)
- Không cần auth hoặc chỉ cần auth Customer

---

### 10.2. Customer đặt phòng (MỚI)

```
POST /bookings/customer-hold
```

**Auth:** Yêu cầu token, role = CUSTOMER

**Request:**
```json
{
  "roomId": "room-uuid",
  "checkinDate": "2026-04-01",
  "checkoutDate": "2026-04-03",
  "guestCount": 2,
  "customerName": "Nguyễn Văn A",
  "customerPhone": "0912345678",
  "notes": "Cần giường phụ"
}
```

**Logic backend:**
1. Kiểm tra phòng tồn tại và `isActive = true`
2. Kiểm tra phòng trống trong khoảng ngày (không trùng booking HOLD/CONFIRMED)
3. Tạo booking: `status = HOLD`, `customerId = current user id`
4. Set `holdExpireAt = now + 24h`
5. Nếu phòng đã có booking trùng → trả 409

**Response (201):**
```json
{
  "success": true,
  "message": "Đặt phòng thành công, chờ xác nhận trong 24 giờ",
  "data": {
    "id": "booking-uuid",
    "roomId": "room-uuid",
    "customerId": "user-uuid",
    "checkinDate": "2026-04-01T00:00:00.000Z",
    "checkoutDate": "2026-04-03T00:00:00.000Z",
    "status": "HOLD",
    "holdExpireAt": "2026-04-02T10:30:00.000Z",
    "customerName": "Nguyễn Văn A",
    "customerPhone": "0912345678",
    "guestCount": 2,
    "holdRemainingSeconds": 86400,
    "room": {
      "name": "Deluxe Ocean View",
      "homestay": { "name": "Halong Bay Resort" }
    }
  }
}
```

**Errors:**
- 409: `{ "success": false, "message": "Phòng đã được đặt trong khoảng thời gian này" }`

---

### 10.3. Booking của tôi (MỚI)

```
GET /bookings/my?status=HOLD
```

**Auth:** Yêu cầu token, role = CUSTOMER

| Query Param | Type | Mô tả |
|-------------|------|-------|
| `status` | string | `HOLD`, `CONFIRMED`, `CANCELLED`, `COMPLETED` |

**Logic:** Chỉ trả booking của user hiện tại (`customerId = current user`)

**Response (200):**
```json
{
  "success": true,
  "data": [BookingModel, ...]
}
```

> Response format **giống** `GET /bookings` — cùng model BookingModel.

---

### 10.4. Customer huỷ booking (MỚI)

```
PATCH /bookings/:id/customer-cancel
```

**Auth:** Yêu cầu token, role = CUSTOMER

**Validation:**
- Booking phải thuộc customer hiện tại (`customerId == current user`)
- Chỉ huỷ được `status = HOLD` (chưa confirm)
- Nếu `status = CONFIRMED` → trả 400 "Không thể huỷ booking đã xác nhận, vui lòng liên hệ nhân viên"

**Response (200):**
```json
{
  "success": true,
  "message": "Đã huỷ đặt phòng"
}
```

---

## 11. Data Models

### UserModel

```json
{
  "id": "string (UUID)",
  "name": "string",
  "phone": "string",
  "email": "string | null",
  "role": "ADMIN | STAFF | CUSTOMER",
  "isActive": "boolean (default: true)"
}
```

### HomestayModel

```json
{
  "id": "string (UUID)",
  "ownerId": "string (FK → users.id)",
  "name": "string",
  "address": "string",
  "latitude": "number | null",
  "longitude": "number | null",
  "mapLink": "string | null",
  "isActive": "boolean",
  "owner": "{ name: string } | null",
  "_count": "{ rooms: number } | null"
}
```

### RoomModel

```json
{
  "id": "string (UUID)",
  "homestayId": "string (FK → homestays.id)",
  "name": "string",
  "code": "string",
  "bedrooms": "number (default: 1)",
  "maxGuests": "number (default: 2)",
  "description": "string | null",
  "isActive": "boolean (default: true)",
  "images": "[RoomImageModel] (default: [])",
  "price": "RoomPriceModel | null",
  "homestay": "HomestaySimpleModel | null"
}
```

### RoomImageModel

```json
{
  "id": "string (UUID)",
  "roomId": "string (FK → rooms.id)",
  "imageUrl": "string (full URL)",
  "publicId": "string (Cloudinary public ID)",
  "isCover": "boolean (default: false)",
  "order": "number (default: 0)"
}
```

### RoomPriceModel

```json
{
  "id": "string (UUID)",
  "roomId": "string (FK → rooms.id)",
  "weekdayPrice": "number (VND)",
  "fridayPrice": "number (VND)",
  "saturdayPrice": "number (VND)",
  "holidayPrice": "number (VND)"
}
```

### HomestaySimpleModel (nested trong RoomModel)

```json
{
  "id": "string",
  "name": "string",
  "address": "string",
  "latitude": "number | null",
  "longitude": "number | null",
  "mapLink": "string | null"
}
```

### BookingModel

```json
{
  "id": "string (UUID)",
  "roomId": "string (FK → rooms.id)",
  "saleId": "string (FK → users.id) — staff tạo booking",
  "customerId": "string | null (FK → users.id) — customer đặt phòng (MỚI)",
  "checkinDate": "string (ISO 8601 datetime)",
  "checkoutDate": "string (ISO 8601 datetime)",
  "status": "HOLD | CONFIRMED | CANCELLED | COMPLETED",
  "holdExpireAt": "string (ISO 8601 datetime) | null",
  "customerName": "string | null",
  "customerPhone": "string | null",
  "depositAmount": "number (default: 0)",
  "guestCount": "number (MỚI)",
  "notes": "string | null",
  "holdRemainingSeconds": "number — backend tính: max(0, holdExpireAt - now)",
  "room": "{ name, homestay: { name } } | null",
  "sale": "{ name } | null"
}
```

### CalendarBooking (compact cho calendar view)

```json
{
  "id": "string",
  "checkinDate": "string (ISO 8601)",
  "checkoutDate": "string (ISO 8601)",
  "status": "HOLD | CONFIRMED | CANCELLED | COMPLETED",
  "customerName": "string | null",
  "holdRemainingSeconds": "number"
}
```

---

## 12. Migration từ hệ thống cũ

### 12.1. Gộp OWNER + SALE → STAFF

```sql
-- Gộp role cũ
UPDATE users SET role = 'STAFF' WHERE role IN ('OWNER', 'SALE');

-- Cập nhật constraint/enum cho phép: ADMIN, STAFF, CUSTOMER
```

### 12.2. Thêm field mới vào BookingModel

```sql
-- Customer ID (ai đặt phòng - nullable vì booking cũ do staff tạo)
ALTER TABLE bookings ADD COLUMN "customerId" UUID REFERENCES users(id);

-- Số khách
ALTER TABLE bookings ADD COLUMN "guestCount" INTEGER DEFAULT 2;
```

### 12.3. Logic phân biệt booking

| Trường hợp | saleId | customerId |
|------------|--------|------------|
| Staff tạo booking (`POST /bookings/hold`) | = staff ID | null |
| Customer tự đặt (`POST /bookings/customer-hold`) | null | = customer ID |

---

## 13. Cron Jobs

### Auto-cancel HOLD hết hạn

```
Chạy mỗi 5 phút:

UPDATE bookings
SET status = 'CANCELLED'
WHERE status = 'HOLD'
  AND "holdExpireAt" < NOW();
```

**Hold duration:**
- Staff hold: 30 phút (configurable)
- Customer hold: 24 giờ

---

## 14. Tổng hợp endpoints

### Endpoints ĐÃ CÓ (cần thêm role middleware)

| # | Method | Endpoint | Roles |
|---|--------|----------|-------|
| 1 | POST | `/auth/login` | Public |
| 2 | POST | `/auth/google` | Public **(sửa: thêm field `role`)** |
| 3 | POST | `/auth/refresh` | Public |
| 4 | POST | `/auth/forgot-password` | Public |
| 5 | POST | `/auth/reset-password` | Public |
| 6 | POST | `/auth/logout` | All authenticated |
| 7 | GET | `/users` | ADMIN |
| 8 | GET | `/users/:id` | ADMIN |
| 9 | POST | `/users` | ADMIN |
| 10 | PUT | `/users/:id` | ADMIN |
| 11 | DELETE | `/users/:id` | ADMIN |
| 12 | GET | `/homestays` | ADMIN, STAFF |
| 13 | GET | `/homestays/:id` | ADMIN, STAFF |
| 14 | POST | `/homestays` | ADMIN, STAFF |
| 15 | PUT | `/homestays/:id` | ADMIN, STAFF |
| 16 | DELETE | `/homestays/:id` | ADMIN, STAFF |
| 17 | GET | `/rooms` | ADMIN, STAFF |
| 18 | GET | `/rooms/:id` | ADMIN, STAFF |
| 19 | POST | `/rooms` | ADMIN, STAFF |
| 20 | PUT | `/rooms/:id` | ADMIN, STAFF |
| 21 | DELETE | `/rooms/:id` | ADMIN, STAFF |
| 22 | POST | `/rooms/:id/images` | ADMIN, STAFF |
| 23 | DELETE | `/rooms/:id/images/:imgId` | ADMIN, STAFF |
| 24 | PATCH | `/rooms/:id/images/:imgId/cover` | ADMIN, STAFF |
| 25 | PUT | `/rooms/:id/prices` | ADMIN, STAFF |
| 26 | GET | `/bookings` | ADMIN, STAFF |
| 27 | GET | `/bookings/calendar/:roomId` | ADMIN, STAFF |
| 28 | POST | `/bookings/hold` | ADMIN, STAFF |
| 29 | PATCH | `/bookings/:id/confirm` | ADMIN, STAFF |
| 30 | PATCH | `/bookings/:id/cancel` | ADMIN, STAFF |
| 31 | PUT | `/bookings/:id` | ADMIN, STAFF |

### Endpoints MỚI cần tạo

| # | Method | Endpoint | Roles | Mô tả |
|---|--------|----------|-------|-------|
| 32 | POST | `/auth/register` | Public | Đăng ký (STAFF/CUSTOMER) |
| 33 | GET | `/rooms/public` | All / CUSTOMER | Phòng công khai + filter |
| 34 | POST | `/bookings/customer-hold` | CUSTOMER | Customer đặt phòng |
| 35 | GET | `/bookings/my` | CUSTOMER | Booking của customer |
| 36 | PATCH | `/bookings/:id/customer-cancel` | CUSTOMER | Customer huỷ booking |

### Endpoints cần SỬA

| # | Endpoint | Sửa gì |
|---|----------|--------|
| 1 | `POST /auth/google` | Thêm field `role` cho user mới |
| 2 | Tất cả endpoints #7-31 | Thêm role-based middleware |
| 3 | BookingModel | Thêm `customerId`, `guestCount` |
| 4 | Users table | Migration OWNER/SALE → STAFF |
