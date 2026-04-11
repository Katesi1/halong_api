# API Reference — Halong24h Backend

> Tài liệu tổng hợp response của từng endpoint để app mobile parse data.
>
> **Base URL:** `http://103.183.118.148:3000`
>
> **Swagger UI:** `http://103.183.118.148:3000/index.html`

---

## Quy ước chung

### Response thành công

```json
{
  "success": true,
  "message": "...",
  "data": { ... }
}
```

### Response lỗi

```json
{
  "success": false,
  "statusCode": 400,
  "message": "...",
  "errors": null,
  "path": "/endpoint",
  "timestamp": "2026-04-11T00:00:00.000Z"
}
```

### Headers

| Header            | Giá trị             | Mô tả                         |
|-------------------|----------------------|--------------------------------|
| `Authorization`   | `Bearer <token>`     | Bắt buộc cho endpoint cần auth |
| `Accept-Language` | `en` hoặc `vi`       | Ngôn ngữ response (mặc định: `en`) |
| `Content-Type`    | `application/json`   | Cho POST/PUT/PATCH             |

### Enum values (integer)

| Enum               | Giá trị                                          |
|--------------------|--------------------------------------------------|
| **Role**           | `0`=ADMIN, `1`=OWNER, `2`=SALE, `3`=CUSTOMER     |
| **Property Type**  | `0`=VILLA, `1`=HOMESTAY, `2`=HOTEL               |
| **Booking Status** | `0`=HOLD, `1`=CONFIRMED, `2`=CANCELLED, `3`=COMPLETED |
| **Cancellation**   | `0`=FLEXIBLE, `1`=MODERATE, `2`=STRICT            |
| **Gender**         | `0`=MALE, `1`=FEMALE, `2`=OTHER                   |
| **Calendar Lock**  | `0`=LOCKED, `1`=BOOKED                            |
| **Notification Type** | Trả về **string**: `"booking"`, `"payment"`, `"system"` |
| **Calendar Day Status** | **string**: `"available"`, `"hold"`, `"booked"`, `"locked"` |

---

## 1. AUTH (`/auth`)

### POST `/auth/register` — Đăng ký

> Public — không cần token

**Body:**

```json
{
  "phone": "0912345678",
  "password": "123456",
  "name": "Nguyễn Văn A",
  "role": 1
}
```

**Response `data`:**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "user": {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "phone": "0912345678",
    "email": null,
    "role": 1,
    "isActive": true
  }
}
```

---

### POST `/auth/login` — Đăng nhập

> Public

**Body:**

```json
{
  "phone": "0912345678",
  "password": "123456"
}
```

**Response `data`:** _Giống register_

---

### POST `/auth/google` — Đăng nhập Google

> Public

**Body:**

```json
{
  "idToken": "google-id-token...",
  "role": 1
}
```

**Response `data`:** _Giống register_

---

### POST `/auth/refresh` — Refresh token

> Public

**Body:**

```json
{
  "refreshToken": "eyJhbGci..."
}
```

**Response `data`:**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

---

### POST `/auth/forgot-password` — Quên mật khẩu

> Public

**Body:**

```json
{
  "phone": "0912345678"
}
```

**Response `data`:** `null`

---

### POST `/auth/reset-password` — Đặt lại mật khẩu

> Public

**Body:**

```json
{
  "token": "reset-token",
  "newPassword": "newpass123"
}
```

**Response `data`:** `null`

---

### POST `/auth/logout` — Đăng xuất

> Auth required

**Response `data`:** `null`

---

### GET `/auth/profile` — Thông tin user đăng nhập

> Auth required

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": "user@email.com",
  "role": 1,
  "isActive": true,
  "gender": 0,
  "dateOfBirth": "1990-01-01T00:00:00.000Z",
  "createdAt": "2026-04-01T00:00:00.000Z"
}
```

---

### POST `/auth/change-password` — Đổi mật khẩu

> Auth required

**Body:**

```json
{
  "currentPassword": "oldpass",
  "newPassword": "newpass123"
}
```

**Response `data`:** `null`

---

## 2. USERS (`/users`) — ADMIN only

### GET `/users` — Danh sách user

> Role: ADMIN

**Query params:** `role` (optional, integer)

**Response `data`:** _Array_

```json
[
  {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "phone": "0912345678",
    "email": "user@email.com",
    "role": 1,
    "isActive": true,
    "gender": 0,
    "dateOfBirth": "1990-01-01T00:00:00.000Z",
    "createdAt": "2026-04-01T00:00:00.000Z"
  }
]
```

---

### GET `/users/:id` — Chi tiết user

> Role: ADMIN

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": "user@email.com",
  "role": 1,
  "isActive": true,
  "gender": 0,
  "dateOfBirth": "1990-01-01T00:00:00.000Z",
  "createdAt": "2026-04-01T00:00:00.000Z",
  "properties": [
    { "id": "uuid", "name": "Villa ABC", "code": "VL001" }
  ]
}
```

---

### POST `/users` — Tạo user

> Role: ADMIN

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": null,
  "role": 1,
  "gender": null,
  "dateOfBirth": null,
  "createdAt": "2026-04-11T00:00:00.000Z"
}
```

---

### PUT `/users/:id` — Cập nhật user

> ADMIN sửa ai cũng được, user khác chỉ sửa chính mình

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": "user@email.com",
  "role": 1,
  "isActive": true,
  "gender": 0,
  "dateOfBirth": "1990-01-01T00:00:00.000Z",
  "updatedAt": "2026-04-11T00:00:00.000Z"
}
```

---

### DELETE `/users/:id` — Xóa user

> Role: ADMIN

**Response `data`:** `null`

---

## 3. PROPERTIES (`/properties`)

### GET `/properties/public` — Danh sách công khai

> Public — không cần token

**Query params:**

| Param         | Type   | Mô tả                  |
|---------------|--------|-------------------------|
| `checkinDate` | string | YYYY-MM-DD              |
| `checkoutDate`| string | YYYY-MM-DD              |
| `guests`      | number | Số khách                |
| `minPrice`    | number | Giá tối thiểu           |
| `maxPrice`    | number | Giá tối đa              |
| `type`        | number | 0=VILLA, 1=HOMESTAY, 2=HOTEL |
| `view`        | string | `"sea"` hoặc `"city"`   |

**Response `data`:** _Array_

```json
[
  {
    "id": "uuid",
    "name": "Villa Vịnh Xanh",
    "code": "VL001",
    "type": 0,
    "view": "sea",
    "address": "Bãi Cháy, Quảng Ninh",
    "description": "Mô tả...",
    "isActive": true,
    "maxGuests": 6,
    "standardGuests": 4,
    "bedrooms": 3,
    "bathrooms": 2,
    "weekdayPrice": 1500000,
    "weekendPrice": 2000000,
    "holidayPrice": 2500000,
    "adultSurcharge": 200000,
    "childSurcharge": 100000,
    "amenities": ["Wifi", "Điều hòa", "Bể bơi"],
    "cancellationPolicy": 0,
    "rules": "Không hút thuốc",
    "services": ["BBQ", "Thuê xe máy"],
    "checkInTime": "14:00",
    "checkOutTime": "12:00",
    "createdAt": "2026-04-01T00:00:00.000Z",
    "images": [
      {
        "id": "uuid",
        "imageUrl": "https://res.cloudinary.com/...",
        "isCover": true,
        "order": 0
      }
    ],
    "owner": {
      "id": "uuid",
      "name": "Chủ nhà A",
      "phone": "0911222333"
    }
  }
]
```

---

### GET `/properties` — Danh sách (quản lý)

> Role: ADMIN, OWNER, SALE — OWNER/SALE chỉ thấy property của mình

**Query params:** `includeInactive` (boolean), `view` (string)

**Response `data`:** _Giống public, thêm field:_

```json
{
  "_count": { "bookings": 5 }
}
```

---

### GET `/properties/:id` — Chi tiết property

> Role: ADMIN, OWNER, SALE

**Response `data`:** _Giống danh sách quản lý (1 object, có `_count`, `owner`, `images`)_

---

### POST `/properties` — Tạo property

> Role: ADMIN, OWNER, SALE

**Body:**

```json
{
  "name": "Villa Vịnh Xanh",
  "code": "VL001",
  "type": 0,
  "view": "sea",
  "address": "Bãi Cháy",
  "maxGuests": 6,
  "standardGuests": 4,
  "bedrooms": 3,
  "bathrooms": 2,
  "amenities": ["Wifi"],
  "services": ["BBQ"],
  "checkInTime": "14:00",
  "checkOutTime": "12:00"
}
```

**Response `data`:** _Property object (có `owner`, không có `images`, `_count`)_

---

### PATCH `/properties/:id` — Cập nhật property

> Role: ADMIN, OWNER, SALE

**Body:** _Partial — chỉ gửi field cần update_

**Response `data`:** _Property object đầy đủ (có `owner`, `images`, `_count`)_

---

### DELETE `/properties/:id` — Soft delete

> Role: ADMIN, OWNER, SALE

**Response `data`:** `null`

---

### PUT `/properties/:id/prices` — Cập nhật giá

> Role: ADMIN, OWNER, SALE

**Body:**

```json
{
  "weekdayPrice": 1500000,
  "weekendPrice": 2000000,
  "holidayPrice": 2500000,
  "adultSurcharge": 200000,
  "childSurcharge": 100000
}
```

**Response `data`:**

```json
{
  "id": "uuid",
  "name": "Villa Vịnh Xanh",
  "code": "VL001",
  "weekdayPrice": 1500000,
  "weekendPrice": 2000000,
  "holidayPrice": 2500000,
  "adultSurcharge": 200000,
  "childSurcharge": 100000
}
```

---

### POST `/properties/:id/images` — Upload ảnh

> Role: ADMIN, OWNER, SALE | `multipart/form-data` | field: `images` | Max 10 ảnh, 10MB/ảnh, JPG/PNG/WEBP

**Response `data`:** _Array ảnh vừa upload_

```json
[
  {
    "id": "uuid",
    "propertyId": "uuid",
    "imageUrl": "https://res.cloudinary.com/...",
    "publicId": "cloudinary-public-id",
    "isCover": true,
    "order": 0
  }
]
```

---

### DELETE `/properties/:id/images/:imageId` — Xóa ảnh

> Role: ADMIN, OWNER, SALE

**Response `data`:** `null`

---

### PATCH `/properties/:id/images/:imageId/cover` — Đặt ảnh bìa

> Role: ADMIN, OWNER, SALE

**Response `data`:**

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "imageUrl": "https://res.cloudinary.com/...",
  "publicId": "cloudinary-public-id",
  "isCover": true,
  "order": 0
}
```

---

## 4. BOOKINGS (`/bookings`)

### GET `/bookings` — Danh sách booking (Staff/Admin)

> Role: ADMIN, OWNER, SALE — OWNER/SALE chỉ thấy booking của property mình

**Query params:** `propertyId` (optional), `status` (optional, integer 0-3)

**Response `data`:** _Array_

```json
[
  {
    "id": "uuid",
    "propertyId": "uuid",
    "saleId": "uuid",
    "customerId": null,
    "checkinDate": "2026-04-15T00:00:00.000Z",
    "checkoutDate": "2026-04-17T00:00:00.000Z",
    "status": 1,
    "holdExpireAt": null,
    "customerName": "Nguyễn Văn A",
    "customerPhone": "0911222333",
    "depositAmount": 500000,
    "guestCount": 2,
    "notes": "Ghi chú",
    "createdAt": "2026-04-10T00:00:00.000Z",
    "updatedAt": "2026-04-10T00:00:00.000Z",
    "holdRemainingSeconds": 0,
    "property": {
      "id": "uuid",
      "name": "Villa Vịnh Xanh",
      "code": "VL001",
      "type": 0,
      "images": [
        { "id": "uuid", "imageUrl": "https://...", "isCover": true, "order": 0 }
      ]
    },
    "sale": {
      "id": "uuid",
      "name": "Sale A",
      "phone": "0933444555"
    }
  }
]
```

---

### GET `/bookings/my-bookings` — Booking của customer

> Auth required (tất cả role)

**Query params:** `status` (optional, integer 0-3)

**Response `data`:** _Giống danh sách, nhưng không có `sale`, property có `images`_

---

### GET `/bookings/:id` — Chi tiết booking

> Role: ADMIN, OWNER, SALE

**Response `data`:** _Giống item trong danh sách, property thêm `owner: { id, name, phone }`_

---

### POST `/bookings/hold` — Giữ chỗ (Staff) — 30 phút

> Role: ADMIN, OWNER, SALE

**Body:**

```json
{
  "propertyId": "uuid",
  "checkinDate": "2026-04-20",
  "checkoutDate": "2026-04-22",
  "customerName": "Nguyễn Văn A",
  "customerPhone": "0911222333",
  "depositAmount": 500000,
  "guestCount": 2,
  "notes": "Ghi chú"
}
```

**Response `data`:**

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "saleId": "uuid",
  "status": 0,
  "holdExpireAt": "2026-04-11T13:00:00.000Z",
  "holdRemainingSeconds": 1800,
  "checkinDate": "2026-04-20T00:00:00.000Z",
  "checkoutDate": "2026-04-22T00:00:00.000Z",
  "customerName": "Nguyễn Văn A",
  "customerPhone": "0911222333",
  "depositAmount": 500000,
  "guestCount": 2,
  "property": { "id": "uuid", "name": "Villa Vịnh Xanh", "code": "VL001" },
  "sale": { "id": "uuid", "name": "Sale A" }
}
```

---

### PATCH `/bookings/:id/confirm` — Xác nhận booking

> Role: ADMIN, OWNER, SALE

**Response `data`:**

```json
{
  "id": "uuid",
  "status": 1,
  "holdExpireAt": null,
  "property": { "id": "uuid", "name": "Villa Vịnh Xanh", "code": "VL001" }
}
```

---

### PATCH `/bookings/:id/cancel` — Hủy booking (Staff)

> Role: ADMIN, OWNER, SALE

**Response `data`:** `null`

---

### PUT `/bookings/:id` — Cập nhật booking

> Role: ADMIN, OWNER, SALE

**Response `data`:** _Booking object có `property: { id, name, code }`_

---

### POST `/bookings/customer-hold` — Customer đặt chỗ — 24 giờ

> Auth required (tất cả role)

**Body:**

```json
{
  "propertyId": "uuid",
  "checkinDate": "2026-04-20",
  "checkoutDate": "2026-04-22",
  "guestCount": 2,
  "notes": "Ghi chú"
}
```

**Response `data`:**

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "customerId": "uuid",
  "status": 0,
  "holdExpireAt": "2026-04-12T12:30:00.000Z",
  "holdRemainingSeconds": 86400,
  "property": { "id": "uuid", "name": "Villa Vịnh Xanh", "code": "VL001" }
}
```

---

### PATCH `/bookings/:id/customer-cancel` — Customer hủy booking

> Auth required — chỉ hủy được booking HOLD của chính mình

**Response `data`:** `null`

---

## 5. CALENDAR (`/calendar`)

### GET `/calendar/properties` — Danh sách property cho calendar

> Role: ADMIN, OWNER, SALE

**Query params:** `type` (optional, integer 0-2), `ownerId` (optional)

**Response `data`:** _Array_

```json
[
  {
    "id": "uuid",
    "name": "Villa Vịnh Xanh",
    "type": 0,
    "code": "VL001",
    "view": "sea",
    "address": "Bãi Cháy"
  }
]
```

---

### GET `/calendar/public-grid` — Lịch công khai (Trang 1)

> Public — không cần token

**Query params:**

| Param        | Type   | Required | Mô tả                        |
|--------------|--------|----------|-------------------------------|
| `startDate`  | string | Yes      | YYYY-MM-DD                    |
| `endDate`    | string | Yes      | YYYY-MM-DD                    |
| `propertyId` | string | No       | Filter 1 property             |
| `type`       | number | No       | 0=VILLA, 1=HOMESTAY, 2=HOTEL  |

**Response `data`:**

```json
{
  "properties": [
    {
      "id": "uuid",
      "code": "VL001",
      "name": "Villa Vịnh Xanh",
      "type": 0,
      "view": "sea",
      "address": "Bãi Cháy",
      "days": [
        { "date": "2026-04-01", "price": 1500000, "status": "available" },
        { "date": "2026-04-02", "price": 1500000, "status": "booked" },
        { "date": "2026-04-03", "price": 2000000, "status": "locked" }
      ]
    }
  ]
}
```

> **Lưu ý:** `note` **không** có trong public-grid

---

### GET `/calendar/grid` — Lịch quản lý (Trang 2)

> Role: ADMIN, OWNER, SALE — OWNER/SALE chỉ thấy property của mình

**Query params:** _Giống public-grid_

**Response `data`:** _Giống public-grid, nhưng mỗi day có thêm field `note`:_

```json
{
  "date": "2026-04-02",
  "price": 1500000,
  "status": "booked",
  "note": "Nguyễn Văn A"
}
```

> `note` = tên khách hàng (từ booking `customerName`)

---

### POST `/calendar/lock` — Khóa ngày

> Role: ADMIN, OWNER, SALE

**Body:**

```json
{
  "propertyId": "uuid",
  "date": "2026-04-20",
  "status": 0
}
```

> `status`: `0`=LOCKED (chủ khóa), `1`=BOOKED (đánh dấu đã bán). Mặc định: `0`

**Response `data`:**

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "date": "2026-04-20T00:00:00.000Z",
  "status": 0
}
```

---

### DELETE `/calendar/lock` — Mở khóa ngày

> Role: ADMIN, OWNER, SALE

**Body:**

```json
{
  "propertyId": "uuid",
  "date": "2026-04-20"
}
```

**Response `data`:** `null`

---

### PATCH `/calendar/sold` — Đánh dấu đã bán

> Role: ADMIN, OWNER, SALE

**Body:** _Giống lock_

**Response `data`:**

```json
{
  "id": "uuid",
  "propertyId": "uuid",
  "date": "2026-04-20T00:00:00.000Z",
  "status": 1
}
```

---

### GET `/calendar/admin-contact` — Thông tin liên hệ admin

> Public

**Response `data`:**

```json
{
  "name": "Admin",
  "phone": "0912345678",
  "zaloUrl": "https://zalo.me/0912345678"
}
```

---

## 6. NOTIFICATIONS (`/notifications`)

### GET `/notifications` — Danh sách thông báo

> Auth required

**Response `data`:** _Array_

```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "title": "Booking mới",
    "subtitle": "Villa Vịnh Xanh được đặt bởi Nguyễn Văn A",
    "type": "booking",
    "targetId": "booking-uuid",
    "targetType": "booking",
    "isRead": false,
    "createdAt": "2026-04-11T10:30:00.000Z"
  }
]
```

> `type` trả về **string**: `"booking"`, `"payment"`, `"system"` (không phải integer)

---

### GET `/notifications/unread-count` — Số chưa đọc

> Auth required

**Response `data`:**

```json
{
  "count": 3
}
```

---

### PATCH `/notifications/:id/read` — Đánh dấu đã đọc

> Auth required

**Response `data`:** `null`

---

### PATCH `/notifications/read-all` — Đánh dấu tất cả đã đọc

> Auth required

**Response `data`:** `null`

---

## 7. DASHBOARD & REPORTS

### GET `/dashboard/stats` — KPI hôm nay

> Role: ADMIN, OWNER, SALE — OWNER/SALE chỉ thấy property của mình

**Response `data`:**

```json
{
  "totalRooms": 5,
  "activeRooms": 4,
  "emptyRooms": 2,
  "occupiedRooms": 2,
  "checkoutToday": 1,
  "totalBookings": 15,
  "thisMonthBookings": 3,
  "monthlyRevenue": 5000000,
  "todayRevenue": 1500000
}
```

---

### GET `/reports` — Báo cáo theo tháng

> Role: ADMIN, OWNER, SALE

**Query params:** `month` (1-12, mặc định tháng hiện tại), `year` (mặc định năm hiện tại)

**Response `data`:**

```json
{
  "totalRooms": 5,
  "activeRooms": 4,
  "totalBookings": 15,
  "thisMonthBookings": 3,
  "holdCount": 1,
  "confirmedCount": 5,
  "cancelledCount": 2,
  "completedCount": 3,
  "totalDeposit": 3000000,
  "occupancyRate": 45.5,
  "roomsWithCover": 3,
  "roomsWithPrice": 4,
  "recentBookings": [
    {
      "id": "uuid",
      "propertyId": "uuid",
      "status": 1,
      "checkinDate": "2026-04-15T00:00:00.000Z",
      "checkoutDate": "2026-04-17T00:00:00.000Z",
      "customerName": "Nguyễn Văn A",
      "depositAmount": 500000,
      "property": { "id": "uuid", "name": "Villa Vịnh Xanh", "code": "VL001" },
      "sale": { "id": "uuid", "name": "Sale A" }
    }
  ]
}
```

---

## 8. PARTNER (`/partner`) — External API

> Cần header `X-Partner-Key` thay vì Bearer token

### GET `/partner/properties` — Danh sách property

**Query params:** `page`, `limit`, `type`

**Response:** _Có thêm `meta` ngoài `data`_

```json
{
  "success": true,
  "message": "...",
  "data": [ { "...property object..." } ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

### GET `/partner/properties/:id` — Chi tiết property

**Response `data`:** _Property object đầy đủ có `images`_

---

### GET `/partner/properties/:id/availability` — Tình trạng phòng

**Query params:** `year`, `month`

**Response `data`:** _Array booking trong tháng_

```json
[
  {
    "checkinDate": "2026-04-15T00:00:00.000Z",
    "checkoutDate": "2026-04-17T00:00:00.000Z",
    "status": 1
  }
]
```

---

### POST `/partner/bookings` — Tạo booking

**Body:**

```json
{
  "propertyId": "uuid",
  "checkinDate": "2026-04-20",
  "checkoutDate": "2026-04-22",
  "customerName": "Khách A",
  "customerPhone": "0911222333"
}
```

**Response `data`:** _Booking object (HOLD status)_

---

### POST `/partner/bookings/:id/cancel` — Hủy booking

**Response `data`:** _Booking object (CANCELLED status)_
