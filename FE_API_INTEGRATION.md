# Halong24h — API Integration Guide (Frontend)

> Tài liệu mô tả chi tiết **tất cả API endpoints** — FE cần gửi gì, nhận được gì.
> Base URL: `{SERVER}` (không có prefix `/api` — route trực tiếp từ root).

---

## Mục lục

1. [Headers chung](#1-headers-chung)
2. [Response format](#2-response-format)
3. [Enums & Constants](#3-enums--constants)
4. [Auth — Xác thực](#4-auth--xác-thực)
5. [Users — Quản lý người dùng (ADMIN)](#5-users--quản-lý-người-dùng-admin)
6. [Properties — Quản lý cơ sở](#6-properties--quản-lý-cơ-sở)
7. [Rooms — Quản lý phòng](#7-rooms--quản-lý-phòng)
8. [Prices — Giá phòng](#8-prices--giá-phòng)
9. [Bookings — Đặt phòng](#9-bookings--đặt-phòng)
10. [Calendar — Lịch phòng](#10-calendar--lịch-phòng)
11. [Dashboard & Reports](#11-dashboard--reports)
12. [Notifications — Thông báo](#12-notifications--thông-báo)
13. [Partner API — Đối tác](#13-partner-api--đối-tác)

---

## 1. Headers chung

### Tất cả request (trừ Partner)

```
Content-Type: application/json
Accept-Language: vi | en          ← ngôn ngữ response (mặc định: en)
Authorization: Bearer <accessToken>  ← bỏ qua nếu endpoint Public
```

### Partner requests

```
Content-Type: application/json
Accept-Language: vi | en
X-Partner-Key: <api_key>
```

### Upload ảnh

```
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>
```

---

## 2. Response format

### Thành công

```json
{
  "success": true,
  "message": "Thao tác thành công",
  "data": { ... }
}
```

### Lỗi

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Mô tả lỗi",
  "errors": null,
  "path": "/auth/login",
  "timestamp": "2026-03-29T10:00:00.000Z"
}
```

### Lỗi validation (400)

Khi DTO validation thất bại, `message` là các lỗi nối bằng dấu phẩy:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Số điện thoại phải 10-11 số và bắt đầu bằng 0, Mật khẩu tối thiểu 6 ký tự",
  "errors": null,
  "path": "/auth/register",
  "timestamp": "2026-03-29T10:00:00.000Z"
}
```

### HTTP Status Codes

| Code | Ý nghĩa |
|------|----------|
| 200  | Thành công |
| 201  | Tạo mới thành công |
| 400  | Dữ liệu không hợp lệ / lỗi logic |
| 401  | Chưa đăng nhập / token hết hạn |
| 403  | Không có quyền |
| 404  | Không tìm thấy |
| 409  | Trùng dữ liệu (duplicate) |
| 429  | Rate limit |
| 500  | Lỗi server |

---

## 3. Enums & Constants

```typescript
// Roles
type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';

// Booking status
type BookingStatus = 'HOLD' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

// Room type
type RoomType = 'VILLA' | 'HOMESTAY' | 'APARTMENT' | 'HOTEL';

// Cancellation policy
type CancellationPolicy = 'FLEXIBLE' | 'MODERATE' | 'STRICT';

// Notification type
type NotificationType = 'BOOKING' | 'PAYMENT' | 'SYSTEM';

// Token expiry
const ACCESS_TOKEN_TTL = 900;     // 15 phút (giây)
const REFRESH_TOKEN_TTL = 604800; // 7 ngày (giây)

// Hold durations
const STAFF_HOLD = 1800;    // 30 phút (giây)
const CUSTOMER_HOLD = 86400; // 24 giờ (giây)
```

---

## 4. Auth — Xác thực

### 4.1 `POST /auth/register` — Đăng ký *(Public)*

**Request Body:**

| Field      | Type   | Required | Validate | Mô tả |
|------------|--------|----------|----------|-------|
| `name`     | string | ✅ | 2-100 ký tự | Họ tên |
| `phone`    | string | ✅ | Regex `^0\d{9,10}$` | SĐT (10-11 số, bắt đầu 0) |
| `password` | string | ✅ | min 6 ký tự | Mật khẩu |
| `role`     | string | ✅ | `STAFF` \| `CUSTOMER` | Vai trò |
| `email`    | string | ❌ | Valid email | Email |

```json
{
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "password": "matkhau123",
  "role": "CUSTOMER",
  "email": "a@example.com"
}
```

**Response `data`:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "phone": "0912345678",
    "email": "a@example.com",
    "role": "CUSTOMER",
    "isActive": true
  }
}
```

---

### 4.2 `POST /auth/login` — Đăng nhập *(Public)*

**Request Body:**

| Field      | Type   | Required | Mô tả |
|------------|--------|----------|-------|
| `phone`    | string | ✅ | SĐT hoặc email |
| `password` | string | ✅ | min 6 ký tự |

```json
{
  "phone": "0912345678",
  "password": "matkhau123"
}
```

**Response `data`:** Giống response register (accessToken, refreshToken, user).

---

### 4.3 `POST /auth/google` — Đăng nhập Google *(Public)*

**Request Body:**

| Field     | Type   | Required | Mô tả |
|-----------|--------|----------|-------|
| `idToken` | string | ✅ | Google ID Token (JWT) |
| `role`    | string | ❌ | `STAFF` \| `CUSTOMER` — **bắt buộc** nếu user mới |

```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "role": "CUSTOMER"
}
```

**Response `data`:** Giống response login.

---

### 4.4 `POST /auth/refresh` — Refresh token *(Public)*

**Request Body:**

| Field          | Type   | Required | Mô tả |
|----------------|--------|----------|-------|
| `refreshToken` | string | ✅ | Refresh token từ login |

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response `data`:**

> ⚠️ Chỉ trả tokens, **không** trả user object.

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### 4.5 `POST /auth/forgot-password` — Quên mật khẩu *(Public)*

**Request Body:**

| Field        | Type   | Required | Mô tả |
|--------------|--------|----------|-------|
| `identifier` | string | ✅ | SĐT hoặc email |

**Response `data`:** `null`

---

### 4.6 `POST /auth/reset-password` — Đặt lại mật khẩu *(Public)*

**Request Body:**

| Field         | Type   | Required | Mô tả |
|---------------|--------|----------|-------|
| `token`       | string | ✅ | Token nhận từ forgot-password |
| `newPassword` | string | ✅ | min 6 ký tự |

**Response `data`:** `null`

---

### 4.7 `POST /auth/logout` — Đăng xuất *(Auth)*

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:** Không cần.

**Response `data`:** `null`

---

### 4.8 `GET /auth/profile` — Lấy thông tin cá nhân *(Auth)*

**Headers:** `Authorization: Bearer <accessToken>`

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": "a@example.com",
  "role": "CUSTOMER",
  "isActive": true,
  "gender": "male",
  "dateOfBirth": "1990-01-15T00:00:00.000Z",
  "createdAt": "2026-03-01T00:00:00.000Z"
}
```

---

### 4.9 `POST /auth/change-password` — Đổi mật khẩu *(Auth)*

**Request Body:**

| Field             | Type   | Required | Mô tả |
|-------------------|--------|----------|-------|
| `currentPassword` | string | ✅ | min 6 ký tự |
| `newPassword`     | string | ✅ | min 6 ký tự |

**Response `data`:** `null`

---

## 5. Users — Quản lý người dùng (ADMIN)

> Tất cả endpoint trong mục này yêu cầu: `Authorization` + role = **ADMIN**

### 5.1 `GET /users` — Danh sách user

**Query Params:**

| Param  | Type   | Required | Mô tả |
|--------|--------|----------|-------|
| `role` | string | ❌ | `ADMIN` \| `STAFF` \| `CUSTOMER` |

**Response `data`:** Mảng user

```json
[
  {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "phone": "0912345678",
    "email": "a@example.com",
    "role": "STAFF",
    "isActive": true,
    "gender": "male",
    "dateOfBirth": "1990-01-15T00:00:00.000Z",
    "createdAt": "2026-03-01T00:00:00.000Z"
  }
]
```

---

### 5.2 `GET /users/:id` — Chi tiết user

**Params:** `id` — UUID

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": "a@example.com",
  "role": "STAFF",
  "isActive": true,
  "gender": "male",
  "dateOfBirth": "1990-01-15T00:00:00.000Z",
  "createdAt": "2026-03-01T00:00:00.000Z",
  "properties": [
    {
      "id": "uuid",
      "name": "Homestay Bãi Cháy",
      "address": "123 Bãi Cháy, Hạ Long"
    }
  ]
}
```

---

### 5.3 `POST /users` — Tạo user

**Request Body:**

| Field      | Type   | Required | Mô tả |
|------------|--------|----------|-------|
| `name`     | string | ✅ | Họ tên |
| `phone`    | string | ✅ | Regex `^(0\|\+84)[0-9]{9}$` |
| `email`    | string | ❌ | Valid email |
| `password` | string | ✅ | min 6 ký tự |
| `role`     | string | ✅ | `ADMIN` \| `STAFF` \| `CUSTOMER` |

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": null,
  "role": "STAFF",
  "gender": null,
  "dateOfBirth": null,
  "createdAt": "2026-03-29T00:00:00.000Z"
}
```

---

### 5.4 `PUT /users/:id` — Cập nhật user

**Request Body:** (tất cả optional)

| Field         | Type    | Mô tả |
|---------------|---------|-------|
| `name`        | string  | Họ tên |
| `phone`       | string  | SĐT |
| `email`       | string  | Email |
| `password`    | string  | Mật khẩu mới (min 6) |
| `role`        | string  | `ADMIN` \| `STAFF` \| `CUSTOMER` |
| `isActive`    | boolean | Kích hoạt/vô hiệu |
| `gender`      | string  | `male` \| `female` \| `other` |
| `dateOfBirth` | string  | `YYYY-MM-DD` |

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": "a@example.com",
  "role": "STAFF",
  "isActive": true,
  "gender": "male",
  "dateOfBirth": "1990-01-15T00:00:00.000Z",
  "updatedAt": "2026-03-29T00:00:00.000Z"
}
```

---

### 5.5 `DELETE /users/:id` — Vô hiệu hóa user (soft delete)

**Response `data`:** `null`

> Lưu ý: Không thể xoá chính mình.

---

## 6. Properties — Quản lý cơ sở

> Yêu cầu: `Authorization` + role = **ADMIN** hoặc **STAFF**
> STAFF chỉ thấy/thao tác property do mình sở hữu.

### 6.1 `GET /properties` — Danh sách property

**Response `data`:** Mảng property

```json
[
  {
    "id": "uuid",
    "ownerId": "uuid",
    "name": "Homestay Bãi Cháy",
    "address": "123 Bãi Cháy, Hạ Long",
    "latitude": 20.9545,
    "longitude": 107.0482,
    "mapLink": "https://maps.google.com/...",
    "rules": null,
    "services": null,
    "isActive": true,
    "createdAt": "2026-03-01T00:00:00.000Z",
    "updatedAt": "2026-03-01T00:00:00.000Z",
    "owner": {
      "id": "uuid",
      "name": "Chủ nhà A",
      "phone": "0912345678"
    },
    "_count": {
      "rooms": 5
    }
  }
]
```

---

### 6.2 `GET /properties/:id` — Chi tiết property (kèm rooms)

**Response `data`:**

```json
{
  "id": "uuid",
  "ownerId": "uuid",
  "name": "Homestay Bãi Cháy",
  "address": "123 Bãi Cháy, Hạ Long",
  "latitude": 20.9545,
  "longitude": 107.0482,
  "mapLink": "https://maps.google.com/...",
  "rules": "Không hút thuốc...",
  "services": "Wifi, máy giặt...",
  "isActive": true,
  "createdAt": "2026-03-01T00:00:00.000Z",
  "updatedAt": "2026-03-01T00:00:00.000Z",
  "owner": {
    "id": "uuid",
    "name": "Chủ nhà A",
    "phone": "0912345678"
  },
  "rooms": [
    {
      "id": "uuid",
      "name": "Phòng Deluxe",
      "code": "DLX-01",
      "type": "HOMESTAY",
      "bedrooms": 2,
      "bathrooms": 1,
      "standardGuests": 2,
      "maxGuests": 4,
      "isActive": true,
      "images": [
        {
          "id": "uuid",
          "roomId": "uuid",
          "imageUrl": "https://res.cloudinary.com/...",
          "isCover": true,
          "order": 0,
          "createdAt": "2026-03-01T00:00:00.000Z"
        }
      ],
      "price": {
        "id": "uuid",
        "roomId": "uuid",
        "weekdayPrice": 500000,
        "fridayPrice": 600000,
        "saturdayPrice": 700000,
        "holidayPrice": 800000
      },
      "_count": {
        "bookings": 3
      }
    }
  ]
}
```

---

### 6.3 `POST /properties` — Tạo property

**Request Body:**

| Field       | Type   | Required | Mô tả |
|-------------|--------|----------|-------|
| `name`      | string | ✅ | Tên cơ sở |
| `address`   | string | ✅ | Địa chỉ |
| `latitude`  | number | ❌ | Vĩ độ |
| `longitude` | number | ❌ | Kinh độ |
| `mapLink`   | string | ❌ | Link Google Maps |
| `ownerId`   | string | ❌ | Chỉ ADMIN dùng — chỉ định chủ nhà. STAFF bỏ qua (tự gán) |

**Response `data`:**

```json
{
  "id": "uuid",
  "ownerId": "uuid",
  "name": "Villa Tuần Châu",
  "address": "456 Tuần Châu",
  "latitude": 20.9,
  "longitude": 107.05,
  "mapLink": null,
  "isActive": true,
  "createdAt": "2026-03-29T00:00:00.000Z",
  "updatedAt": "2026-03-29T00:00:00.000Z",
  "owner": {
    "id": "uuid",
    "name": "Chủ nhà A"
  }
}
```

---

### 6.4 `PUT /properties/:id` — Cập nhật property

**Request Body:** (tất cả optional)

| Field       | Type    | Mô tả |
|-------------|---------|-------|
| `name`      | string  | Tên cơ sở |
| `address`   | string  | Địa chỉ |
| `latitude`  | number  | Vĩ độ |
| `longitude` | number  | Kinh độ |
| `mapLink`   | string  | Link bản đồ |
| `rules`     | string  | Nội quy |
| `services`  | string  | Dịch vụ |
| `isActive`  | boolean | Kích hoạt |

**Response `data`:** Property object (raw — không kèm `owner`/`rooms`)

```json
{
  "id": "uuid",
  "ownerId": "uuid",
  "name": "Villa Tuần Châu",
  "address": "456 Tuần Châu",
  "latitude": 20.9,
  "longitude": 107.05,
  "mapLink": null,
  "rules": "Không hút thuốc",
  "services": "Wifi, BBQ",
  "isActive": true,
  "createdAt": "...",
  "updatedAt": "..."
}

---

### 6.5 `DELETE /properties/:id` — Xoá property (soft delete)

**Response `data`:** `null`

---

## 7. Rooms — Quản lý phòng

### 7.1 `GET /rooms/public` — Danh sách phòng công khai *(Public)*

> Không cần auth. Ai cũng gọi được.

**Query Params:**

| Param          | Type   | Required | Mô tả |
|----------------|--------|----------|-------|
| `checkinDate`  | string | ❌ | `YYYY-MM-DD` — lọc phòng còn trống |
| `checkoutDate` | string | ❌ | `YYYY-MM-DD` — dùng cùng checkinDate |
| `guests`       | number | ❌ | Lọc phòng có maxGuests >= giá trị |
| `minPrice`     | number | ❌ | Giá weekday tối thiểu |
| `maxPrice`     | number | ❌ | Giá weekday tối đa |

**Response `data`:** Mảng room

```json
[
  {
    "id": "uuid",
    "propertyId": "uuid",
    "name": "Phòng Deluxe",
    "code": "DLX-01",
    "type": "HOMESTAY",
    "bedrooms": 2,
    "bathrooms": 1,
    "standardGuests": 2,
    "maxGuests": 4,
    "description": "Phòng rộng...",
    "address": "Tầng 2, Khu A",
    "mapLink": null,
    "amenities": ["wifi", "máy lạnh", "tủ lạnh"],
    "cancellationPolicy": "FLEXIBLE",
    "adultSurcharge": 100000,
    "childSurcharge": 50000,
    "isActive": true,
    "createdAt": "2026-03-01T00:00:00.000Z",
    "updatedAt": "2026-03-01T00:00:00.000Z",
    "property": {
      "id": "uuid",
      "name": "Homestay Bãi Cháy",
      "address": "123 Bãi Cháy",
      "latitude": 20.95,
      "longitude": 107.04,
      "mapLink": null
    },
    "images": [
      {
        "id": "uuid",
        "roomId": "uuid",
        "imageUrl": "https://res.cloudinary.com/...",
        "publicId": "property/rooms/uuid/abc123",
        "isCover": true,
        "order": 0,
        "createdAt": "2026-03-01T00:00:00.000Z"
      }
    ],
    "price": {
      "id": "uuid",
      "roomId": "uuid",
      "weekdayPrice": 500000,
      "fridayPrice": 600000,
      "saturdayPrice": 700000,
      "holidayPrice": 800000,
      "createdAt": "2026-03-01T00:00:00.000Z",
      "updatedAt": "2026-03-01T00:00:00.000Z"
    }
  }
]
```

---

### 7.2 `GET /rooms` — Danh sách phòng nội bộ *(ADMIN/STAFF)*

**Query Params:**

| Param        | Type   | Required | Mô tả |
|--------------|--------|----------|-------|
| `propertyId` | string | ❌ | Lọc theo property |

> STAFF tự động chỉ thấy phòng thuộc property của mình.

**Response `data`:** Mảng room (mỗi room chỉ có 1 ảnh đầu tiên + _count)

```json
[
  {
    "id": "uuid",
    "propertyId": "uuid",
    "name": "Phòng Deluxe",
    "code": "DLX-01",
    "type": "HOMESTAY",
    "bedrooms": 2,
    "bathrooms": 1,
    "standardGuests": 2,
    "maxGuests": 4,
    "description": "...",
    "address": null,
    "mapLink": null,
    "amenities": ["wifi"],
    "cancellationPolicy": null,
    "adultSurcharge": null,
    "childSurcharge": null,
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "...",
    "property": {
      "id": "uuid",
      "name": "Homestay Bãi Cháy",
      "address": "123 Bãi Cháy"
    },
    "images": [
      { "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0, "createdAt": "..." }
    ],
    "price": { "weekdayPrice": 500000, "fridayPrice": 600000, "saturdayPrice": 700000, "holidayPrice": 800000 },
    "_count": { "bookings": 3 }
  }
]
```

---

### 7.3 `GET /rooms/:id` — Chi tiết phòng *(ADMIN/STAFF)*

**Response `data`:**

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "name": "Phòng Deluxe",
  "code": "DLX-01",
  "type": "HOMESTAY",
  "bedrooms": 2,
  "bathrooms": 1,
  "standardGuests": 2,
  "maxGuests": 4,
  "description": "Phòng rộng...",
  "address": null,
  "mapLink": null,
  "amenities": ["wifi", "máy lạnh"],
  "cancellationPolicy": "FLEXIBLE",
  "adultSurcharge": 100000,
  "childSurcharge": 50000,
  "isActive": true,
  "createdAt": "...",
  "updatedAt": "...",
  "property": {
    "id": "uuid",
    "name": "Homestay Bãi Cháy",
    "address": "123 Bãi Cháy",
    "latitude": 20.95,
    "longitude": 107.04,
    "mapLink": null,
    "owner": {
      "id": "uuid",
      "name": "Chủ nhà A",
      "phone": "0912345678"
    }
  },
  "images": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "imageUrl": "https://res.cloudinary.com/...",
      "publicId": "property/rooms/uuid/abc",
      "isCover": true,
      "order": 0,
      "createdAt": "..."
    }
  ],
  "price": {
    "id": "uuid",
    "roomId": "uuid",
    "weekdayPrice": 500000,
    "fridayPrice": 600000,
    "saturdayPrice": 700000,
    "holidayPrice": 800000,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

### 7.4 `POST /rooms` — Tạo phòng *(ADMIN/STAFF)*

**Request Body:**

| Field                | Type     | Required | Mô tả |
|----------------------|----------|----------|-------|
| `propertyId`         | string   | ✅ | ID property |
| `name`               | string   | ✅ | Tên phòng |
| `code`               | string   | ✅ | Mã phòng (unique) |
| `type`               | string   | ❌ | `VILLA` \| `HOMESTAY` \| `APARTMENT` \| `HOTEL` |
| `bedrooms`           | number   | ❌ | Mặc định 1 |
| `bathrooms`          | number   | ❌ | Mặc định 1 |
| `standardGuests`     | number   | ❌ | Mặc định 2 |
| `maxGuests`          | number   | ❌ | Mặc định 2 |
| `description`        | string   | ❌ | Mô tả |
| `address`            | string   | ❌ | Địa chỉ riêng |
| `mapLink`            | string   | ❌ | Link Google Maps |
| `amenities`          | string[] | ❌ | Mảng tiện nghi |
| `cancellationPolicy` | string   | ❌ | `FLEXIBLE` \| `MODERATE` \| `STRICT` |
| `adultSurcharge`     | number   | ❌ | Phụ thu người lớn (VNĐ) |
| `childSurcharge`     | number   | ❌ | Phụ thu trẻ em (VNĐ) |
| `isActive`           | boolean  | ❌ | Mặc định true |

```json
{
  "propertyId": "uuid",
  "name": "Phòng VIP",
  "code": "VIP-01",
  "type": "VILLA",
  "bedrooms": 3,
  "maxGuests": 6,
  "amenities": ["wifi", "bể bơi", "BBQ"]
}
```

**Response `data`:** Room object + `property: { id, name }`.

---

### 7.5 `PUT /rooms/:id` — Cập nhật phòng *(ADMIN/STAFF)*

**Request Body:** (tất cả optional)

| Field                | Type     | Mô tả |
|----------------------|----------|-------|
| `name`               | string   | Tên phòng |
| `code`               | string   | Mã phòng (unique) |
| `type`               | string   | `VILLA` \| `HOMESTAY` \| `APARTMENT` \| `HOTEL` |
| `bedrooms`           | number   | Số phòng ngủ |
| `bathrooms`          | number   | Số phòng tắm |
| `standardGuests`     | number   | Sức chứa tiêu chuẩn |
| `maxGuests`          | number   | Sức chứa tối đa |
| `description`        | string   | Mô tả |
| `address`            | string   | Địa chỉ riêng |
| `mapLink`            | string   | Link Google Maps |
| `amenities`          | string[] | Tiện nghi |
| `cancellationPolicy` | string   | `FLEXIBLE` \| `MODERATE` \| `STRICT` |
| `adultSurcharge`     | number   | Phụ thu người lớn |
| `childSurcharge`     | number   | Phụ thu trẻ em |
| `isActive`           | boolean  | Kích hoạt |

> Không gửi `propertyId` — không đổi được property.

**Response `data`:** Room object (raw — không kèm `property`/`images`/`price`)

---

### 7.6 `DELETE /rooms/:id` — Xoá phòng *(ADMIN/STAFF)*

**Response `data`:** `null`

---

### 7.7 `POST /rooms/:id/images` — Upload ảnh *(ADMIN/STAFF)*

**Content-Type:** `multipart/form-data`

| Field    | Type   | Required | Mô tả |
|----------|--------|----------|-------|
| `images` | File[] | ✅ | Tối đa 10 file. JPG/PNG/WEBP. Max 10MB/file. Tổng max 20 ảnh/phòng |

```
curl -X POST /rooms/{id}/images \
  -H "Authorization: Bearer ..." \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.png"
```

**Response `data`:** Mảng ảnh đã upload

```json
[
  {
    "id": "uuid",
    "roomId": "uuid",
    "imageUrl": "https://res.cloudinary.com/...",
    "publicId": "property/rooms/uuid/abc",
    "isCover": true,
    "order": 0,
    "createdAt": "..."
  }
]
```

> Ảnh đầu tiên upload tự động thành cover nếu phòng chưa có ảnh.

---

### 7.8 `DELETE /rooms/:id/images/:imageId` — Xoá ảnh *(ADMIN/STAFF)*

**Response `data`:** `null`

> Nếu xoá ảnh cover, ảnh tiếp theo sẽ tự động thành cover.

---

### 7.9 `PATCH /rooms/:id/images/:imageId/cover` — Đặt ảnh bìa *(ADMIN/STAFF)*

**Request Body:** Không cần.

**Response `data`:** Image object (đã đặt cover).

---

## 8. Prices — Giá phòng

> Route: `/rooms/:roomId/prices`

### 8.1 `GET /rooms/:roomId/prices` — Lấy giá phòng *(Auth — bất kỳ role)*

**Response `data`:**

```json
{
  "id": "uuid",
  "roomId": "uuid",
  "weekdayPrice": 500000,
  "fridayPrice": 600000,
  "saturdayPrice": 700000,
  "holidayPrice": 800000,
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

### 8.2 `PUT /rooms/:roomId/prices` — Cập nhật giá *(ADMIN/STAFF)*

**Request Body:** (tất cả optional, gửi field nào cập nhật field đó)

| Field           | Type   | Mô tả |
|-----------------|--------|-------|
| `weekdayPrice`  | number | Giá ngày thường (>= 0) |
| `fridayPrice`   | number | Giá thứ 6 |
| `saturdayPrice` | number | Giá thứ 7 |
| `holidayPrice`  | number | Giá ngày lễ |

```json
{
  "weekdayPrice": 500000,
  "fridayPrice": 600000,
  "saturdayPrice": 700000,
  "holidayPrice": 900000
}
```

**Response `data`:** Price object (đã cập nhật hoặc tạo mới).

---

## 9. Bookings — Đặt phòng

### Staff/Admin Endpoints

> Yêu cầu: `Authorization` + role = **ADMIN** hoặc **STAFF**

#### 9.1 `GET /bookings` — Danh sách booking

**Query Params:**

| Param    | Type   | Required | Mô tả |
|----------|--------|----------|-------|
| `roomId` | string | ❌ | Lọc theo phòng |

> STAFF chỉ thấy booking mình tạo (saleId = mình).

**Response `data`:** Mảng booking

```json
[
  {
    "id": "uuid",
    "roomId": "uuid",
    "saleId": "uuid",
    "customerId": null,
    "checkinDate": "2026-04-01T00:00:00.000Z",
    "checkoutDate": "2026-04-03T00:00:00.000Z",
    "status": "HOLD",
    "holdExpireAt": "2026-03-29T10:30:00.000Z",
    "customerName": "Nguyễn Văn B",
    "customerPhone": "0987654321",
    "depositAmount": 500000,
    "guestCount": 2,
    "notes": "Cần giường phụ",
    "createdAt": "2026-03-29T10:00:00.000Z",
    "updatedAt": "2026-03-29T10:00:00.000Z",
    "holdRemainingSeconds": 1500,
    "room": {
      "id": "uuid",
      "name": "Phòng Deluxe",
      "code": "DLX-01",
      "property": {
        "id": "uuid",
        "name": "Homestay Bãi Cháy"
      }
    },
    "sale": {
      "id": "uuid",
      "name": "Nhân viên A",
      "phone": "0912345678"
    }
  }
]
```

> `holdRemainingSeconds`: Số giây còn lại trước khi hold hết hạn. = 0 nếu không phải HOLD.

---

#### 9.2 `GET /bookings/:id` — Chi tiết booking

**Response `data`:** Booking + room (kèm **full property**, tối đa **5 ảnh**, price) + sale.

```json
{
  "id": "uuid",
  "roomId": "uuid",
  "saleId": "uuid",
  "customerId": null,
  "checkinDate": "2026-04-01T00:00:00.000Z",
  "checkoutDate": "2026-04-03T00:00:00.000Z",
  "status": "CONFIRMED",
  "holdExpireAt": null,
  "customerName": "Nguyễn Văn B",
  "customerPhone": "0987654321",
  "depositAmount": 500000,
  "guestCount": 2,
  "notes": null,
  "createdAt": "...",
  "updatedAt": "...",
  "holdRemainingSeconds": 0,
  "room": {
    "id": "uuid",
    "propertyId": "uuid",
    "name": "Phòng Deluxe",
    "code": "DLX-01",
    "type": "HOMESTAY",
    "bedrooms": 2,
    "bathrooms": 1,
    "standardGuests": 2,
    "maxGuests": 4,
    "description": "...",
    "amenities": ["wifi"],
    "isActive": true,
    "property": {
      "id": "uuid",
      "ownerId": "uuid",
      "name": "Homestay Bãi Cháy",
      "address": "123 Bãi Cháy",
      "latitude": 20.95,
      "longitude": 107.04,
      "mapLink": null,
      "rules": null,
      "services": null,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    },
    "images": [
      { "id": "uuid", "roomId": "uuid", "imageUrl": "https://...", "publicId": "...", "isCover": true, "order": 0, "createdAt": "..." }
    ],
    "price": {
      "id": "uuid",
      "roomId": "uuid",
      "weekdayPrice": 500000,
      "fridayPrice": 600000,
      "saturdayPrice": 700000,
      "holidayPrice": 800000
    }
  },
  "sale": {
    "id": "uuid",
    "name": "Nhân viên A",
    "phone": "0912345678"
  }
}
```

> `room.property` trả **tất cả fields** (include full). `room.images` tối đa **5 ảnh**.

---

#### 9.3 `POST /bookings/hold` — Giữ phòng (Staff) — hold 30 phút

**Request Body:**

| Field           | Type   | Required | Mô tả |
|-----------------|--------|----------|-------|
| `roomId`        | string | ✅ | ID phòng |
| `checkinDate`   | string | ✅ | `YYYY-MM-DD` |
| `checkoutDate`  | string | ✅ | `YYYY-MM-DD` (phải sau checkinDate) |
| `customerName`  | string | ❌ | Tên khách |
| `customerPhone` | string | ❌ | SĐT khách |
| `depositAmount` | number | ❌ | Tiền đặt cọc (>= 0) |
| `notes`         | string | ❌ | Ghi chú |

```json
{
  "roomId": "uuid",
  "checkinDate": "2026-04-01",
  "checkoutDate": "2026-04-03",
  "customerName": "Nguyễn Văn B",
  "customerPhone": "0987654321",
  "depositAmount": 500000
}
```

**Response `data`:**

```json
{
  "id": "uuid",
  "roomId": "uuid",
  "saleId": "uuid",
  "checkinDate": "2026-04-01T00:00:00.000Z",
  "checkoutDate": "2026-04-03T00:00:00.000Z",
  "status": "HOLD",
  "holdExpireAt": "2026-03-29T10:30:00.000Z",
  "customerName": "Nguyễn Văn B",
  "customerPhone": "0987654321",
  "depositAmount": 500000,
  "guestCount": 2,
  "notes": null,
  "createdAt": "...",
  "updatedAt": "...",
  "holdRemainingSeconds": 1800,
  "room": {
    "id": "uuid",
    "name": "Phòng Deluxe",
    "code": "DLX-01"
  },
  "sale": {
    "id": "uuid",
    "name": "Nhân viên A"
  }
}
```

> `sale` chỉ có `{ id, name }` (không có phone). `room` chỉ có `{ id, name, code }`.

**Lỗi có thể gặp:**
- 400 — Phòng đang được giữ bởi người khác
- 400 — Phòng đã có booking CONFIRMED trùng ngày
- 400 — checkinDate trong quá khứ
- 400 — checkoutDate trước checkinDate

---

#### 9.4 `PATCH /bookings/:id/confirm` — Xác nhận booking

> Chỉ booking đang `HOLD` mới confirm được.

**Request Body:** Không cần.

**Response `data`:** Booking object raw (không kèm room/sale).

```json
{
  "id": "uuid",
  "roomId": "uuid",
  "saleId": "uuid",
  "customerId": null,
  "checkinDate": "2026-04-01T00:00:00.000Z",
  "checkoutDate": "2026-04-03T00:00:00.000Z",
  "status": "CONFIRMED",
  "holdExpireAt": null,
  "customerName": "Nguyễn Văn B",
  "customerPhone": "0987654321",
  "depositAmount": 500000,
  "guestCount": 2,
  "notes": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

#### 9.5 `PATCH /bookings/:id/cancel` — Huỷ booking (Staff)

**Request Body:** Không cần.

**Response `data`:** `null`

---

#### 9.6 `PUT /bookings/:id` — Cập nhật booking

**Request Body:** (tất cả optional)

| Field           | Type   | Mô tả |
|-----------------|--------|-------|
| `checkinDate`   | string | `YYYY-MM-DD` |
| `checkoutDate`  | string | `YYYY-MM-DD` |
| `customerName`  | string | Tên khách |
| `customerPhone` | string | SĐT khách |
| `depositAmount` | number | Tiền đặt cọc |
| `notes`         | string | Ghi chú |
| `status`        | string | `HOLD` \| `CONFIRMED` \| `CANCELLED` \| `COMPLETED` |

**Response `data`:** Booking object raw (không kèm room/sale).

```json
{
  "id": "uuid",
  "roomId": "uuid",
  "saleId": "uuid",
  "customerId": null,
  "checkinDate": "2026-04-01T00:00:00.000Z",
  "checkoutDate": "2026-04-03T00:00:00.000Z",
  "status": "CONFIRMED",
  "holdExpireAt": null,
  "customerName": "Nguyễn Văn B",
  "customerPhone": "0987654321",
  "depositAmount": 500000,
  "guestCount": 2,
  "notes": "Cần giường phụ",
  "createdAt": "...",
  "updatedAt": "..."
}
```

> Nếu `status` chuyển sang CONFIRMED hoặc CANCELLED → `holdExpireAt` tự động set `null`.

---

#### 9.7 `GET /bookings/calendar/:roomId` — Lịch phòng theo tháng

**Query Params:**

| Param   | Type   | Required | Mô tả |
|---------|--------|----------|-------|
| `year`  | number | ❌ | Mặc định năm hiện tại |
| `month` | number | ❌ | Mặc định tháng hiện tại (1-12) |

**Response `data`:** Mảng booking trong tháng (chỉ HOLD + CONFIRMED)

```json
[
  {
    "id": "uuid",
    "checkinDate": "2026-04-01T00:00:00.000Z",
    "checkoutDate": "2026-04-03T00:00:00.000Z",
    "status": "CONFIRMED",
    "customerName": "Nguyễn Văn B",
    "holdRemainingSeconds": 0,
    "sale": { "name": "Nhân viên A" }
  },
  {
    "id": "uuid",
    "checkinDate": "2026-04-10T00:00:00.000Z",
    "checkoutDate": "2026-04-12T00:00:00.000Z",
    "status": "HOLD",
    "customerName": "Trần Văn C",
    "holdRemainingSeconds": 1200,
    "sale": { "name": "Nhân viên B" }
  }
]
```

> Mỗi item chỉ có: `id`, `checkinDate`, `checkoutDate`, `status`, `customerName`, `holdRemainingSeconds`, `sale.name`.
> `holdRemainingSeconds` = 0 nếu không phải HOLD.

---

### Customer Endpoints

> Yêu cầu: `Authorization` (bất kỳ role nào đã đăng nhập)

#### 9.8 `POST /bookings/customer-hold` — Customer đặt phòng (hold 24h)

**Request Body:**

| Field           | Type   | Required | Mô tả |
|-----------------|--------|----------|-------|
| `roomId`        | string | ✅ | ID phòng |
| `checkinDate`   | string | ✅ | `YYYY-MM-DD` |
| `checkoutDate`  | string | ✅ | `YYYY-MM-DD` |
| `guestCount`    | number | ❌ | Mặc định 2 |
| `customerName`  | string | ❌ | Tên khách |
| `customerPhone` | string | ❌ | SĐT khách |
| `notes`         | string | ❌ | Ghi chú |

```json
{
  "roomId": "uuid",
  "checkinDate": "2026-04-01",
  "checkoutDate": "2026-04-03",
  "guestCount": 3,
  "customerName": "Nguyễn Văn C",
  "customerPhone": "0909090909"
}
```

**Response `data`:** Booking object + `holdRemainingSeconds: 86400`.

```json
{
  "id": "uuid",
  "roomId": "uuid",
  "customerId": "uuid",
  "checkinDate": "2026-04-01T00:00:00.000Z",
  "checkoutDate": "2026-04-03T00:00:00.000Z",
  "status": "HOLD",
  "holdExpireAt": "2026-04-02T10:00:00.000Z",
  "customerName": "Nguyễn Văn C",
  "customerPhone": "0909090909",
  "guestCount": 3,
  "notes": null,
  "holdRemainingSeconds": 86400,
  "room": {
    "name": "Phòng Deluxe",
    "property": { "name": "Homestay Bãi Cháy" }
  }
}
```

**Lỗi có thể gặp:**
- 409 — Phòng đã được đặt (trùng ngày, kể cả HOLD)

---

#### 9.9 `GET /bookings/my` — Booking của tôi

**Query Params:**

| Param    | Type   | Required | Mô tả |
|----------|--------|----------|-------|
| `status` | string | ❌ | `HOLD` \| `CONFIRMED` \| `CANCELLED` \| `COMPLETED` |

**Response `data`:** Mảng booking

```json
[
  {
    "id": "uuid",
    "roomId": "uuid",
    "customerId": "uuid",
    "checkinDate": "2026-04-01T00:00:00.000Z",
    "checkoutDate": "2026-04-03T00:00:00.000Z",
    "status": "HOLD",
    "holdExpireAt": "2026-04-02T10:00:00.000Z",
    "customerName": "Nguyễn Văn C",
    "customerPhone": "0909090909",
    "depositAmount": null,
    "guestCount": 3,
    "notes": null,
    "createdAt": "...",
    "updatedAt": "...",
    "holdRemainingSeconds": 85000,
    "room": {
      "id": "uuid",
      "name": "Phòng Deluxe",
      "code": "DLX-01",
      "property": {
        "id": "uuid",
        "name": "Homestay Bãi Cháy"
      }
    }
  }
]
```

---

#### 9.10 `PATCH /bookings/:id/customer-cancel` — Customer huỷ booking

> Chỉ huỷ được booking **HOLD** của chính mình. Booking đã CONFIRMED không huỷ được (cần liên hệ staff).

**Request Body:** Không cần.

**Response `data`:** `null`

---

## 10. Calendar — Lịch phòng

### 10.1 `GET /calendar/property-groups` — Nhóm property *(ADMIN/STAFF)*

**Query Params:**

| Param      | Type   | Required | Mô tả |
|------------|--------|----------|-------|
| `category` | string | ❌ | `VILLA` \| `HOMESTAY` \| `HOTEL` \| `APARTMENT` |
| `ownerId`  | string | ❌ | Chỉ ADMIN dùng — lọc theo chủ nhà |

> STAFF tự động chỉ thấy property của mình.

**Response `data`:**

```json
[
  {
    "id": "uuid",
    "name": "Homestay Bãi Cháy",
    "category": "HOMESTAY",
    "roomCount": 5
  },
  {
    "id": "uuid",
    "name": "Villa Tuần Châu",
    "category": "VILLA",
    "roomCount": 3
  }
]
```

---

### 10.2 `GET /calendar/grid` — Lịch grid (rooms × dates) *(ADMIN/STAFF)*

**Query Params:**

| Param             | Type   | Required | Mô tả |
|-------------------|--------|----------|-------|
| `propertyGroupId` | string | ✅ | ID property (từ property-groups) |
| `startDate`       | string | ✅ | `YYYY-MM-DD` |
| `endDate`         | string | ✅ | `YYYY-MM-DD` |

**Response `data`:**

```json
{
  "propertyGroup": {
    "id": "uuid",
    "name": "Homestay Bãi Cháy"
  },
  "rooms": [
    {
      "id": "uuid",
      "code": "DLX-01",
      "name": "Phòng Deluxe",
      "days": [
        {
          "date": "2026-04-01",
          "price": 500000,
          "status": "AVAILABLE"
        },
        {
          "date": "2026-04-02",
          "price": 600000,
          "status": "BOOKED"
        },
        {
          "date": "2026-04-03",
          "price": 700000,
          "status": "HOLD"
        }
      ]
    }
  ]
}
```

**Day status values:**
| Status      | Ý nghĩa |
|-------------|----------|
| `AVAILABLE` | Phòng trống |
| `HOLD`      | Đang giữ |
| `BOOKED`    | Đã xác nhận |

**Giá theo ngày:**
| Ngày trong tuần | Giá |
|-----------------|-----|
| Thứ 2 → Thứ 5  | weekdayPrice |
| Thứ 6           | fridayPrice |
| Thứ 7           | saturdayPrice |

---

### 10.3 `POST /calendar/lock` — Khoá phòng theo ngày *(ADMIN/STAFF)*

**Request Body:**

| Field    | Type   | Required | Mô tả |
|----------|--------|----------|-------|
| `roomId` | string | ✅ | ID phòng |
| `date`   | string | ✅ | `YYYY-MM-DD` |

```json
{
  "roomId": "uuid",
  "date": "2026-04-15"
}
```

**Response `data`:** Booking object (status = HOLD, notes = "Owner lock")

```json
{
  "id": "uuid",
  "roomId": "uuid",
  "saleId": "uuid",
  "customerId": null,
  "checkinDate": "2026-04-15T00:00:00.000Z",
  "checkoutDate": "2026-04-16T00:00:00.000Z",
  "status": "HOLD",
  "holdExpireAt": null,
  "customerName": null,
  "customerPhone": null,
  "depositAmount": null,
  "guestCount": 2,
  "notes": "Owner lock",
  "createdAt": "...",
  "updatedAt": "..."
}
```

> Lock tạo booking HOLD **không có holdExpireAt** (không tự hết hạn). Cần unlock thủ công.

---

### 10.4 `POST /calendar/unlock` — Mở khoá phòng *(ADMIN/STAFF)*

**Request Body:** Giống lock.

> Chỉ mở khoá được ngày đang HOLD. Ngày CONFIRMED (đã xác nhận) không mở khoá được.

**Response `data`:** `null`

---

### 10.5 `GET /calendar/admin-contact` — Thông tin liên hệ admin *(Public)*

**Response `data`:**

```json
{
  "name": "Admin Halong24h",
  "phone": "0912345678",
  "zaloUrl": "https://zalo.me/0912345678"
}
```

---

## 11. Dashboard & Reports

> Yêu cầu: `Authorization` + role = **ADMIN** hoặc **STAFF**
> STAFF chỉ thấy dữ liệu thuộc property của mình.

### 11.1 `GET /dashboard/stats` — Thống kê KPI

**Response `data`:**

```json
{
  "totalRooms": 20,
  "activeRooms": 18,
  "emptyRooms": 12,
  "occupiedRooms": 6,
  "checkoutToday": 2,
  "totalBookings": 150,
  "thisMonthBookings": 25,
  "monthlyRevenue": 15000000,
  "todayRevenue": 2000000
}
```

| Field              | Mô tả |
|--------------------|-------|
| `totalRooms`       | Tổng số phòng |
| `activeRooms`      | Phòng đang hoạt động |
| `emptyRooms`       | Phòng trống hiện tại |
| `occupiedRooms`    | Phòng đang có khách |
| `checkoutToday`    | Số booking checkout hôm nay |
| `totalBookings`    | Tổng booking toàn hệ thống |
| `thisMonthBookings`| Booking tháng này |
| `monthlyRevenue`   | Doanh thu tháng (VNĐ) — tổng depositAmount |
| `todayRevenue`     | Doanh thu hôm nay (VNĐ) |

---

### 11.2 `GET /reports` — Báo cáo theo tháng

**Query Params:**

| Param   | Type   | Required | Mô tả |
|---------|--------|----------|-------|
| `month` | number | ❌ | 1-12, mặc định tháng hiện tại |
| `year`  | number | ❌ | Mặc định năm hiện tại |

**Response `data`:**

```json
{
  "totalRooms": 20,
  "activeRooms": 18,
  "totalBookings": 150,
  "thisMonthBookings": 25,
  "holdCount": 3,
  "confirmedCount": 15,
  "cancelledCount": 5,
  "completedCount": 2,
  "totalDeposit": 15000000,
  "occupancyRate": 45.5,
  "roomsWithCover": 15,
  "roomsWithPrice": 16,
  "recentBookings": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "saleId": "uuid",
      "customerId": null,
      "checkinDate": "2026-04-01T00:00:00.000Z",
      "checkoutDate": "2026-04-03T00:00:00.000Z",
      "status": "CONFIRMED",
      "customerName": "Nguyễn Văn B",
      "depositAmount": 500000,
      "createdAt": "...",
      "room": {
        "id": "uuid",
        "name": "Phòng Deluxe",
        "code": "DLX-01",
        "property": { "name": "Homestay Bãi Cháy" }
      },
      "sale": {
        "id": "uuid",
        "name": "Nhân viên A"
      }
    }
  ]
}
```

| Field              | Mô tả |
|--------------------|-------|
| `holdCount`        | Booking đang giữ trong tháng |
| `confirmedCount`   | Booking đã xác nhận trong tháng |
| `cancelledCount`   | Booking đã huỷ trong tháng |
| `completedCount`   | Booking hoàn thành trong tháng |
| `totalDeposit`     | Tổng tiền cọc tháng (CONFIRMED + COMPLETED) |
| `occupancyRate`    | Tỷ lệ lấp đầy (%) = occupiedDays / totalRoomDays × 100 |
| `roomsWithCover`   | Số phòng có ảnh bìa |
| `roomsWithPrice`   | Số phòng có giá |
| `recentBookings`   | 10 booking gần nhất |

---

## 12. Notifications — Thông báo

> Yêu cầu: `Authorization` (bất kỳ role)

### 12.1 `GET /notifications` — Danh sách thông báo

**Response `data`:**

```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "title": "Booking mới",
    "subtitle": "Phòng Deluxe đã được đặt",
    "type": "BOOKING",
    "isRead": false,
    "targetId": "uuid",
    "targetType": "booking",
    "createdAt": "2026-03-29T10:00:00.000Z"
  }
]
```

---

### 12.2 `GET /notifications/unread-count` — Số thông báo chưa đọc

**Response `data`:**

```json
{
  "count": 5
}
```

---

### 12.3 `PATCH /notifications/:id/read` — Đánh dấu đã đọc

**Response `data`:** `null`

---

### 12.4 `PATCH /notifications/read-all` — Đánh dấu tất cả đã đọc

**Response `data`:** `null`

---

## 13. Partner API — Đối tác

> Xác thực bằng header `X-Partner-Key` (không dùng JWT).

### 13.1 `GET /partner/rooms` — Danh sách phòng

**Query Params:**

| Param        | Type   | Required | Mô tả |
|--------------|--------|----------|-------|
| `propertyId` | string | ❌ | Lọc theo property |
| `page`       | number | ❌ | Mặc định 1 |
| `limit`      | number | ❌ | Mặc định 20 |

**Response:**

```json
{
  "success": true,
  "message": "...",
  "data": [
    {
      "id": "uuid",
      "propertyId": "uuid",
      "name": "Phòng Deluxe",
      "code": "DLX-01",
      "type": "HOMESTAY",
      "bedrooms": 2,
      "bathrooms": 1,
      "standardGuests": 2,
      "maxGuests": 4,
      "isActive": true,
      "property": {
        "id": "uuid",
        "name": "Homestay Bãi Cháy",
        "address": "123 Bãi Cháy"
      },
      "images": [
        { "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }
      ],
      "price": {
        "weekdayPrice": 500000,
        "fridayPrice": 600000,
        "saturdayPrice": 700000,
        "holidayPrice": 800000
      }
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

### 13.2 `GET /partner/rooms/:id` — Chi tiết phòng

**Response `data`:** Room object đầy đủ

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "name": "Phòng Deluxe",
  "code": "DLX-01",
  "type": "HOMESTAY",
  "bedrooms": 2,
  "bathrooms": 1,
  "standardGuests": 2,
  "maxGuests": 4,
  "description": "...",
  "amenities": ["wifi"],
  "isActive": true,
  "property": {
    "id": "uuid",
    "name": "Homestay Bãi Cháy",
    "address": "123 Bãi Cháy",
    "latitude": 20.95,
    "longitude": 107.04,
    "mapLink": null
  },
  "images": [
    { "id": "uuid", "roomId": "uuid", "imageUrl": "https://...", "publicId": "...", "isCover": true, "order": 0, "createdAt": "..." }
  ],
  "price": {
    "id": "uuid",
    "roomId": "uuid",
    "weekdayPrice": 500000,
    "fridayPrice": 600000,
    "saturdayPrice": 700000,
    "holidayPrice": 800000
  }
}
```

> Property kèm `latitude`, `longitude`, `mapLink`. Images trả **tất cả ảnh** (sắp theo order).

---

### 13.3 `GET /partner/rooms/:id/availability` — Lịch trống

**Query Params:**

| Param   | Type   | Required | Mô tả |
|---------|--------|----------|-------|
| `year`  | number | ❌ | Mặc định năm hiện tại |
| `month` | number | ❌ | Mặc định tháng hiện tại (1-12) |

**Response `data`:** Mảng booking đang chiếm phòng trong tháng

```json
[
  {
    "checkinDate": "2026-04-01T00:00:00.000Z",
    "checkoutDate": "2026-04-03T00:00:00.000Z",
    "status": "CONFIRMED"
  },
  {
    "checkinDate": "2026-04-10T00:00:00.000Z",
    "checkoutDate": "2026-04-12T00:00:00.000Z",
    "status": "HOLD"
  }
]
```

> Ngày không nằm trong bất kỳ booking nào = phòng trống.

---

### 13.4 `POST /partner/bookings` — Tạo booking

**Request Body:**

| Field           | Type   | Required | Mô tả |
|-----------------|--------|----------|-------|
| `roomId`        | string | ✅ | ID phòng |
| `checkinDate`   | string | ✅ | `YYYY-MM-DD` |
| `checkoutDate`  | string | ✅ | `YYYY-MM-DD` |
| `customerName`  | string | ✅ | Tên khách |
| `customerPhone` | string | ✅ | SĐT khách |
| `notes`         | string | ❌ | Ghi chú |
| `partnerRef`    | string | ❌ | Mã tham chiếu phía partner (chỉ nhận, chưa lưu DB) |

```json
{
  "roomId": "uuid",
  "checkinDate": "2026-04-15",
  "checkoutDate": "2026-04-17",
  "customerName": "John Doe",
  "customerPhone": "0909090909",
  "partnerRef": "PARTNER-12345"
}
```

**Response `data`:** Booking object (status = HOLD, holdExpireAt = +30 phút).

---

### 13.5 `POST /partner/bookings/:id/cancel` — Huỷ booking

**Response `data`:** Booking object (status = CANCELLED).

---

## Tổng hợp quyền truy cập

| Endpoint Pattern | ADMIN | STAFF | CUSTOMER | Public |
|------------------|:-----:|:-----:|:--------:|:------:|
| `POST /auth/*` (login/register/...) | - | - | - | ✅ |
| `GET /auth/profile`, `POST /auth/logout` | ✅ | ✅ | ✅ | - |
| `POST /auth/change-password` | ✅ | ✅ | ✅ | - |
| `GET/POST/PUT/DELETE /users/*` | ✅ | - | - | - |
| `GET/POST/PUT/DELETE /properties/*` | ✅ | ✅* | - | - |
| `GET /rooms/public` | - | - | - | ✅ |
| `GET/POST/PUT/DELETE /rooms/*` | ✅ | ✅* | - | - |
| `POST/DELETE/PATCH /rooms/:id/images/*` | ✅ | ✅* | - | - |
| `GET /rooms/:roomId/prices` | ✅ | ✅ | ✅ | - |
| `PUT /rooms/:roomId/prices` | ✅ | ✅* | - | - |
| `GET/POST/PUT/PATCH /bookings/*` (staff) | ✅ | ✅* | - | - |
| `POST /bookings/customer-hold` | ✅ | ✅ | ✅ | - |
| `GET /bookings/my` | ✅ | ✅ | ✅ | - |
| `PATCH /bookings/:id/customer-cancel` | ✅ | ✅ | ✅ | - |
| `GET /calendar/property-groups` | ✅ | ✅* | - | - |
| `GET /calendar/grid` | ✅ | ✅* | - | - |
| `POST /calendar/lock\|unlock` | ✅ | ✅* | - | - |
| `GET /calendar/admin-contact` | - | - | - | ✅ |
| `GET /dashboard/stats` | ✅ | ✅* | - | - |
| `GET /reports` | ✅ | ✅* | - | - |
| `GET/PATCH /notifications/*` | ✅ | ✅ | ✅ | - |
| `GET/POST /partner/*` | - | - | - | 🔑 |

> `✅*` = STAFF chỉ thao tác dữ liệu thuộc property của mình.
> `🔑` = Xác thực bằng `X-Partner-Key` header.
