# API DOCUMENTATION — Halong24h Backend

> Tài liệu chi tiết toàn bộ API endpoints.
> Base URL: `http://103.183.118.148:3000`
> Tổng: **49 endpoints**

---

## Response Format chung

### Success
```json
{
  "success": true,
  "message": "Thông báo thành công",
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "message": "Mô tả lỗi",
  "data": null
}
```

### HTTP Status Codes
| Code | Ý nghĩa |
|------|---------|
| 200 | Thành công |
| 201 | Tạo mới thành công |
| 400 | Bad Request (thiếu/sai trường) |
| 401 | Unauthorized (token hết hạn) |
| 403 | Forbidden (không đủ quyền) |
| 404 | Not Found |
| 409 | Conflict (duplicate phone, phòng đã bán) |
| 500 | Server Error |

### Headers chung
| Header | Giá trị | Mô tả |
|--------|---------|-------|
| `Authorization` | `Bearer {accessToken}` | Bắt buộc cho API cần auth |
| `Accept-Language` | `vi` hoặc `en` | Ngôn ngữ response (mặc định: `en`) |
| `Content-Type` | `application/json` | Mặc định cho mọi request |

---

## Mục lục

1. [Authentication (9 endpoints)](#1-authentication--xác-thực-9-endpoints)
2. [Users (5 endpoints)](#2-users--quản-lý-người-dùng-5-endpoints)
3. [Properties (5 endpoints)](#3-properties--cơ-sở-lưu-trú-5-endpoints)
4. [Rooms (9 endpoints)](#4-rooms--quản-lý-phòng-9-endpoints)
5. [Prices (2 endpoints)](#5-prices--bảng-giá-phòng-2-endpoints)
6. [Bookings Staff/Admin (7 endpoints)](#6-bookings-staffadmin--đặt-phòng-quản-lý-7-endpoints)
7. [Bookings Customer (3 endpoints)](#7-bookings-customer--đặt-phòng-khách-hàng-3-endpoints)
8. [Calendar (5 endpoints)](#8-calendar--lịch-phòng-5-endpoints)
9. [Notifications (4 endpoints)](#9-notifications--thông-báo-4-endpoints)
10. [Dashboard & Reports (2 endpoints)](#10-dashboard--reports--thống-kê-2-endpoints)
11. [Partner API (5 endpoints)](#11-partner-api--đối-tác-5-endpoints)

---

## 1. Authentication — Xác thực (9 endpoints)

---

### 1.1. POST /auth/register — Đăng ký

> **Auth:** Không cần | **Roles:** —

**Request Body:**
| Trường | Kiểu | Bắt buộc | Validate | Mô tả |
|--------|-------|:--------:|----------|-------|
| `name` | string | ✅ | min 2, max 100 ký tự | Họ tên |
| `phone` | string | ✅ | regex `^(0\|+84)[0-9]{9}$` | Số điện thoại (unique) |
| `password` | string | ✅ | min 6 ký tự | Mật khẩu |
| `role` | string | ✅ | `STAFF` hoặc `CUSTOMER` | Role đăng ký |
| `email` | string | ❌ | email format | Email (optional) |

**Response:**
```json
{
  "success": true,
  "message": "Đăng ký thành công",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "phone": "0912345678",
      "email": "a@gmail.com",
      "role": "STAFF",
      "isActive": true
    }
  }
}
```

---

### 1.2. POST /auth/login — Đăng nhập

> **Auth:** Không cần | **Roles:** —

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `phone` | string | ✅ | SĐT hoặc email |
| `password` | string | ✅ | Mật khẩu (min 6) |

**Response:** Giống register

---

### 1.3. POST /auth/google — Đăng nhập Google

> **Auth:** Không cần | **Roles:** —

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `idToken` | string | ✅ | Google ID Token (JWT) |
| `role` | string | ❌ | `STAFF` hoặc `CUSTOMER` (bắt buộc nếu user mới) |

**Response:** Giống login

---

### 1.4. POST /auth/refresh — Làm mới token

> **Auth:** Không cần | **Roles:** —

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `refreshToken` | string | ✅ | Refresh token hiện tại |

**Response:**
```json
{
  "success": true,
  "message": "Refresh token thành công",
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi..."
  }
}
```

---

### 1.5. POST /auth/forgot-password — Quên mật khẩu

> **Auth:** Không cần | **Roles:** —

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `identifier` | string | ✅ | SĐT hoặc email |

**Response:**
```json
{
  "success": true,
  "message": "Đã gửi mã xác nhận",
  "data": null
}
```

---

### 1.6. POST /auth/reset-password — Đặt lại mật khẩu

> **Auth:** Không cần | **Roles:** —

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `token` | string | ✅ | Token từ email/SMS |
| `newPassword` | string | ✅ | Mật khẩu mới (min 6) |

**Response:**
```json
{
  "success": true,
  "message": "Đặt lại mật khẩu thành công",
  "data": null
}
```

---

### 1.7. POST /auth/logout — Đăng xuất

> **Auth:** Bearer Token | **Roles:** Tất cả

**Request:** Không có body.

**Response:**
```json
{
  "success": true,
  "message": "Đăng xuất thành công",
  "data": null
}
```

---

### 1.8. GET /auth/profile — Lấy thông tin cá nhân

> **Auth:** Bearer Token | **Roles:** Tất cả

**Request:** Không có body/query.

**Response:**
```json
{
  "success": true,
  "message": "Lấy thông tin thành công",
  "data": {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "phone": "0912345678",
    "email": "a@gmail.com",
    "role": "STAFF",
    "isActive": true,
    "gender": "male",
    "dateOfBirth": "1990-01-15T00:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### 1.9. PATCH /auth/change-password — Đổi mật khẩu

> **Auth:** Bearer Token | **Roles:** Tất cả

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `currentPassword` | string | ✅ | Mật khẩu hiện tại (min 6) |
| `newPassword` | string | ✅ | Mật khẩu mới (min 6) |

**Response:**
```json
{
  "success": true,
  "message": "Đổi mật khẩu thành công",
  "data": null
}
```

---

## 2. Users — Quản lý người dùng (5 endpoints)

> Tất cả endpoint yêu cầu **ADMIN** role.

---

### 2.1. GET /users — Danh sách users

> **Auth:** Bearer Token | **Roles:** ADMIN

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `role` | string | ❌ | Filter: `ADMIN`, `STAFF`, `CUSTOMER` |

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách người dùng thành công",
  "data": [
    {
      "id": "uuid",
      "name": "Nguyễn Văn A",
      "phone": "0912345678",
      "email": "a@gmail.com",
      "role": "STAFF",
      "isActive": true,
      "gender": "male",
      "dateOfBirth": "1990-01-15T00:00:00.000Z",
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### 2.2. GET /users/:id — Chi tiết user

> **Auth:** Bearer Token | **Roles:** ADMIN

**Response:**
```json
{
  "success": true,
  "message": "Lấy thông tin người dùng thành công",
  "data": {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "phone": "0912345678",
    "email": "a@gmail.com",
    "role": "STAFF",
    "isActive": true,
    "gender": "male",
    "dateOfBirth": "1990-01-15T00:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "properties": [
      {
        "id": "uuid",
        "name": "Sunferia Villa",
        "address": "Bãi Cháy, Hạ Long"
      }
    ]
  }
}
```

---

### 2.3. POST /users — Tạo user

> **Auth:** Bearer Token | **Roles:** ADMIN

**Request Body:**
| Trường | Kiểu | Bắt buộc | Validate | Mô tả |
|--------|-------|:--------:|----------|-------|
| `name` | string | ✅ | — | Họ tên |
| `phone` | string | ✅ | regex `^(0\|+84)[0-9]{9}$` | SĐT (unique) |
| `password` | string | ✅ | min 6 ký tự | Mật khẩu |
| `role` | string | ✅ | `ADMIN`, `STAFF`, `CUSTOMER` | Role |
| `email` | string | ❌ | email format | Email |

**Response:**
```json
{
  "success": true,
  "message": "Tạo người dùng thành công",
  "data": {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "phone": "0912345678",
    "email": "a@gmail.com",
    "role": "STAFF",
    "gender": null,
    "dateOfBirth": null,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### 2.4. PUT /users/:id — Cập nhật user

> **Auth:** Bearer Token | **Roles:** ADMIN

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `name` | string | ❌ | Họ tên |
| `phone` | string | ❌ | SĐT |
| `email` | string | ❌ | Email |
| `password` | string | ❌ | Mật khẩu mới (min 6) |
| `role` | string | ❌ | `ADMIN`, `STAFF`, `CUSTOMER` |
| `isActive` | boolean | ❌ | Kích hoạt/vô hiệu hoá |
| `gender` | string | ❌ | `male`, `female`, `other` |
| `dateOfBirth` | string | ❌ | Ngày sinh `YYYY-MM-DD` |

**Response:**
```json
{
  "success": true,
  "message": "Cập nhật người dùng thành công",
  "data": {
    "id": "uuid",
    "name": "Nguyễn Văn A",
    "phone": "0912345678",
    "email": "a@gmail.com",
    "role": "STAFF",
    "isActive": true,
    "gender": "male",
    "dateOfBirth": "1990-01-15T00:00:00.000Z",
    "updatedAt": "2026-03-29T00:00:00.000Z"
  }
}
```

---

### 2.5. DELETE /users/:id — Vô hiệu hoá user

> **Auth:** Bearer Token | **Roles:** ADMIN
> Soft delete: đặt `isActive = false`. Không thể xoá chính mình.

**Response:**
```json
{
  "success": true,
  "message": "Vô hiệu hóa người dùng thành công",
  "data": null
}
```

---

## 3. Properties — Cơ sở lưu trú (5 endpoints)

---

### 3.1. GET /properties — Danh sách properties

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> STAFF chỉ thấy property của mình (ownerId = userId).

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách cơ sở thành công",
  "data": [
    {
      "id": "uuid",
      "name": "Sunferia Villa",
      "address": "Bãi Cháy, Hạ Long",
      "latitude": 20.9555,
      "longitude": 107.0483,
      "mapLink": "https://maps.google.com/...",
      "rules": "Không hút thuốc trong phòng...",
      "services": "Dọn phòng hàng ngày...",
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "owner": {
        "id": "uuid",
        "name": "Chủ nhà A",
        "phone": "0912345678"
      },
      "_count": {
        "rooms": 12
      }
    }
  ]
}
```

---

### 3.2. GET /properties/:id — Chi tiết property

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Response:**
```json
{
  "success": true,
  "message": "Lấy thông tin cơ sở thành công",
  "data": {
    "id": "uuid",
    "name": "Sunferia Villa",
    "address": "Bãi Cháy, Hạ Long",
    "latitude": 20.9555,
    "longitude": 107.0483,
    "mapLink": "https://maps.google.com/...",
    "rules": "Không hút thuốc trong phòng...",
    "services": "Dọn phòng hàng ngày, đưa đón sân bay...",
    "isActive": true,
    "owner": {
      "id": "uuid",
      "name": "Chủ nhà A",
      "phone": "0912345678"
    },
    "rooms": [
      {
        "id": "uuid",
        "name": "Villa C3",
        "code": "C3-06",
        "type": "VILLA",
        "images": [],
        "price": { "weekdayPrice": 5000000 },
        "_count": { "bookings": 5 }
      }
    ]
  }
}
```

---

### 3.3. POST /properties — Tạo property

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `name` | string | ✅ | Tên cơ sở |
| `address` | string | ✅ | Địa chỉ |
| `ownerId` | string | ❌ | ID chủ nhà (chỉ ADMIN dùng, STAFF tự gán) |
| `latitude` | number | ❌ | Vĩ độ |
| `longitude` | number | ❌ | Kinh độ |
| `mapLink` | string | ❌ | Link Google Maps |

**Response:**
```json
{
  "success": true,
  "message": "Tạo cơ sở thành công",
  "data": {
    "id": "uuid",
    "name": "Sunferia Villa",
    "address": "Bãi Cháy, Hạ Long",
    "latitude": 20.9555,
    "longitude": 107.0483,
    "mapLink": null,
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "owner": {
      "id": "uuid",
      "name": "Chủ nhà A"
    }
  }
}
```

---

### 3.4. PUT /properties/:id — Cập nhật property

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `name` | string | ❌ | Tên cơ sở |
| `address` | string | ❌ | Địa chỉ |
| `latitude` | number | ❌ | Vĩ độ |
| `longitude` | number | ❌ | Kinh độ |
| `mapLink` | string | ❌ | Link Google Maps |
| `rules` | string | ❌ | Nội quy cơ sở |
| `services` | string | ❌ | Dịch vụ cung cấp |
| `isActive` | boolean | ❌ | Kích hoạt/vô hiệu |

**Dùng ở các màn hình con:**
- `PropertyInfoScreen` → cập nhật `name`, `address`, `isActive`
- `PropertyLocationScreen` → cập nhật `latitude`, `longitude`, `mapLink`
- `PropertyRulesScreen` → cập nhật `rules`
- `PropertyServicesScreen` → cập nhật `services`

**Response:** Property object đã cập nhật.

---

### 3.5. DELETE /properties/:id — Xoá property

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Soft delete: `isActive = false`

**Response:**
```json
{
  "success": true,
  "message": "Xoá cơ sở thành công",
  "data": null
}
```

---

## 4. Rooms — Quản lý phòng (9 endpoints)

---

### 4.1. GET /rooms/public — Danh sách phòng công khai

> **Auth:** Không cần | **Roles:** —

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `checkinDate` | string | ❌ | Ngày nhận phòng (ISO) |
| `checkoutDate` | string | ❌ | Ngày trả phòng (ISO) |
| `guests` | number | ❌ | Số khách (filter maxGuests >= guests) |
| `minPrice` | number | ❌ | Giá tối thiểu (weekdayPrice) |
| `maxPrice` | number | ❌ | Giá tối đa (weekdayPrice) |

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách phòng công khai thành công",
  "data": [
    {
      "id": "uuid",
      "propertyId": "uuid",
      "name": "Villa Sunferia C3",
      "code": "C3-06",
      "type": "VILLA",
      "bedrooms": 3,
      "bathrooms": 2,
      "standardGuests": 6,
      "maxGuests": 10,
      "description": "Villa view biển...",
      "address": "Bãi Cháy, Hạ Long",
      "mapLink": "https://maps.google.com/...",
      "amenities": ["Wifi", "Bể bơi", "BBQ"],
      "cancellationPolicy": "MODERATE",
      "adultSurcharge": 200000,
      "childSurcharge": 100000,
      "isActive": true,
      "property": {
        "id": "uuid",
        "name": "Sunferia",
        "address": "Bãi Cháy, Hạ Long",
        "latitude": 20.9555,
        "longitude": 107.0483,
        "mapLink": "https://maps.google.com/..."
      },
      "images": [
        {
          "id": "uuid",
          "imageUrl": "https://res.cloudinary.com/...",
          "publicId": "property/rooms/abc123",
          "isCover": true,
          "order": 0
        }
      ],
      "price": {
        "id": "uuid",
        "roomId": "uuid",
        "weekdayPrice": 5000000,
        "fridayPrice": 7000000,
        "saturdayPrice": 8000000,
        "holidayPrice": 12000000
      }
    }
  ]
}
```

---

### 4.2. GET /rooms — Danh sách phòng (nội bộ)

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> STAFF chỉ thấy phòng thuộc property của mình.

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `propertyId` | string | ❌ | Filter theo property |

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách phòng thành công",
  "data": [
    {
      "id": "uuid",
      "name": "Villa C3",
      "code": "C3-06",
      "type": "VILLA",
      "isActive": true,
      "property": {
        "id": "uuid",
        "name": "Sunferia",
        "address": "Bãi Cháy"
      },
      "images": [{ "id": "uuid", "imageUrl": "...", "isCover": true, "order": 0 }],
      "price": { "weekdayPrice": 5000000, "fridayPrice": 7000000, "saturdayPrice": 8000000, "holidayPrice": 12000000 },
      "_count": { "bookings": 5 }
    }
  ]
}
```

---

### 4.3. GET /rooms/:id — Chi tiết phòng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Response:**
```json
{
  "success": true,
  "message": "Lấy thông tin phòng thành công",
  "data": {
    "id": "uuid",
    "propertyId": "uuid",
    "name": "Villa Sunferia C3",
    "code": "C3-06",
    "type": "VILLA",
    "bedrooms": 3,
    "bathrooms": 2,
    "standardGuests": 6,
    "maxGuests": 10,
    "description": "Villa view biển...",
    "address": "Bãi Cháy, Hạ Long",
    "mapLink": "https://maps.google.com/...",
    "amenities": ["Wifi", "Bể bơi", "BBQ"],
    "cancellationPolicy": "MODERATE",
    "adultSurcharge": 200000,
    "childSurcharge": 100000,
    "isActive": true,
    "property": {
      "id": "uuid",
      "name": "Sunferia",
      "address": "Bãi Cháy",
      "latitude": 20.9555,
      "longitude": 107.0483,
      "mapLink": "https://maps.google.com/...",
      "owner": {
        "id": "uuid",
        "name": "Chủ nhà A",
        "phone": "0912345678"
      }
    },
    "images": [
      { "id": "uuid", "imageUrl": "...", "publicId": "...", "isCover": true, "order": 0 }
    ],
    "price": {
      "weekdayPrice": 5000000,
      "fridayPrice": 7000000,
      "saturdayPrice": 8000000,
      "holidayPrice": 12000000
    }
  }
}
```

---

### 4.4. POST /rooms — Tạo phòng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `propertyId` | string | ✅ | ID property chứa phòng |
| `name` | string | ✅ | Tên hiển thị |
| `code` | string | ✅ | Mã phòng (unique, VD: C3-06) |
| `type` | string | ❌ | `VILLA`, `HOMESTAY`, `APARTMENT`, `HOTEL` |
| `bedrooms` | int | ❌ | Số phòng ngủ (default: 1, min: 1) |
| `bathrooms` | int | ❌ | Số WC (default: 1, min: 1) |
| `standardGuests` | int | ❌ | Sức chứa tiêu chuẩn (default: 2) |
| `maxGuests` | int | ❌ | Sức chứa tối đa (default: 2) |
| `description` | string | ❌ | Mô tả |
| `address` | string | ❌ | Địa chỉ riêng |
| `mapLink` | string | ❌ | Link Google Maps |
| `amenities` | string[] | ❌ | Danh sách tiện nghi |
| `cancellationPolicy` | string | ❌ | `FLEXIBLE`, `MODERATE`, `STRICT` |
| `adultSurcharge` | number | ❌ | Phụ thu người lớn (VNĐ, min: 0) |
| `childSurcharge` | number | ❌ | Phụ thu trẻ em (VNĐ, min: 0) |
| `isActive` | boolean | ❌ | Default: true |

**Tổng: 16 trường (3 bắt buộc, 13 optional)**

**Response:**
```json
{
  "success": true,
  "message": "Tạo phòng thành công",
  "data": {
    "id": "uuid",
    "name": "Villa C3",
    "code": "C3-06",
    "type": "VILLA",
    "isActive": true,
    "property": { "id": "uuid", "name": "Sunferia" }
  }
}
```

---

### 4.5. PUT /rooms/:id — Cập nhật phòng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Request Body:** Giống POST /rooms, tất cả optional (trừ propertyId không thay đổi).

**Dùng ở:**
- `RoomDetailScreen` — edit inline
- `PropertyAmenitiesScreen` — cập nhật `amenities`
- `PropertyCancellationScreen` — cập nhật `cancellationPolicy`

**Response:** Room object đã cập nhật.

---

### 4.6. DELETE /rooms/:id — Xoá phòng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Soft delete: `isActive = false`

**Response:**
```json
{
  "success": true,
  "message": "Xoá phòng thành công",
  "data": null
}
```

---

### 4.7. POST /rooms/:id/images — Upload ảnh phòng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Content-Type: `multipart/form-data`

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `files` | File[] | ✅ | Tối đa 10 file/lần, max 10MB/file, JPG/PNG/WEBP |

> Tổng tối đa 20 ảnh/phòng. Ảnh đầu tiên tự động đặt làm cover.
> Ảnh upload lên **Cloudinary**, DB lưu URL + publicId.

**Response:**
```json
{
  "success": true,
  "message": "Upload 3 ảnh thành công",
  "data": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "imageUrl": "https://res.cloudinary.com/djllupcd9/image/upload/...",
      "publicId": "property/rooms/roomId/abc123",
      "isCover": true,
      "order": 0
    }
  ]
}
```

---

### 4.8. DELETE /rooms/:id/images/:imageId — Xoá ảnh

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Xoá ảnh trên Cloudinary + DB. Nếu xoá ảnh cover, ảnh đầu tiên còn lại tự động thành cover.

**Response:**
```json
{
  "success": true,
  "message": "Xoá ảnh thành công",
  "data": null
}
```

---

### 4.9. PATCH /rooms/:id/images/:imageId/cover — Đặt ảnh bìa

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Request:** Không có body.

**Response:**
```json
{
  "success": true,
  "message": "Đặt ảnh cover thành công",
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "imageUrl": "https://res.cloudinary.com/...",
    "publicId": "...",
    "isCover": true,
    "order": 0
  }
}
```

---

## 5. Prices — Bảng giá phòng (2 endpoints)

---

### 5.1. GET /rooms/:roomId/prices — Lấy giá phòng

> **Auth:** Bearer Token | **Roles:** Tất cả

**Response:**
```json
{
  "success": true,
  "message": "Lấy giá phòng thành công",
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "weekdayPrice": 5000000,
    "fridayPrice": 7000000,
    "saturdayPrice": 8000000,
    "holidayPrice": 12000000,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-03-29T00:00:00.000Z"
  }
}
```

---

### 5.2. PUT /rooms/:roomId/prices — Cập nhật giá phòng (Upsert)

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Upsert: tự tạo mới nếu chưa có, cập nhật nếu đã tồn tại.

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `weekdayPrice` | number | ❌ | Giá ngày thường T2-T5 (min: 0) |
| `fridayPrice` | number | ❌ | Giá thứ 6 (min: 0) |
| `saturdayPrice` | number | ❌ | Giá thứ 7 (min: 0) |
| `holidayPrice` | number | ❌ | Giá ngày lễ/cao điểm (min: 0) |

**Response:** Price object đã cập nhật.

---

## 6. Bookings Staff/Admin — Đặt phòng quản lý (7 endpoints)

---

### 6.1. GET /bookings — Danh sách bookings

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> STAFF chỉ thấy booking do mình tạo (saleId = userId).

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `roomId` | string | ❌ | Filter theo phòng |

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách booking thành công",
  "data": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "saleId": "uuid",
      "customerId": null,
      "checkinDate": "2026-04-20T14:00:00.000Z",
      "checkoutDate": "2026-04-22T12:00:00.000Z",
      "status": "CONFIRMED",
      "holdExpireAt": null,
      "customerName": "Nguyễn Văn B",
      "customerPhone": "0987654321",
      "depositAmount": 2000000,
      "guestCount": 2,
      "notes": "Cần thêm đệm",
      "createdAt": "2026-04-19T10:00:00.000Z",
      "holdRemainingSeconds": 0,
      "room": {
        "id": "uuid",
        "name": "Villa C3",
        "code": "C3-06",
        "property": { "id": "uuid", "name": "Sunferia" }
      },
      "sale": {
        "id": "uuid",
        "name": "Nhân viên A",
        "phone": "0912345678"
      }
    }
  ]
}
```

---

### 6.2. GET /bookings/:id — Chi tiết booking

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Response:** Booking object đầy đủ + room details (images, price, property).

---

### 6.3. POST /bookings/hold — Giữ phòng (Staff)

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Logic: Giữ phòng 30 phút → tự động huỷ nếu chưa confirm.

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `roomId` | string | ✅ | ID phòng |
| `checkinDate` | string | ✅ | Ngày nhận phòng (YYYY-MM-DD) |
| `checkoutDate` | string | ✅ | Ngày trả phòng (YYYY-MM-DD) |
| `customerName` | string | ❌ | Tên khách |
| `customerPhone` | string | ❌ | SĐT khách |
| `depositAmount` | number | ❌ | Tiền cọc (min: 0) |
| `notes` | string | ❌ | Ghi chú |

**Response:**
```json
{
  "success": true,
  "message": "Giữ phòng thành công (30 phút)",
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "saleId": "uuid",
    "checkinDate": "2026-04-20T00:00:00.000Z",
    "checkoutDate": "2026-04-22T00:00:00.000Z",
    "status": "HOLD",
    "holdExpireAt": "2026-04-20T14:30:00.000Z",
    "customerName": "Nguyễn Văn B",
    "customerPhone": "0987654321",
    "depositAmount": 2000000,
    "notes": null,
    "holdRemainingSeconds": 1800,
    "room": { "id": "uuid", "name": "Villa C3", "code": "C3-06" },
    "sale": { "id": "uuid", "name": "Nhân viên A" }
  }
}
```

---

### 6.4. PATCH /bookings/:id/confirm — Xác nhận booking

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Chuyển `HOLD` → `CONFIRMED`. Xoá Redis hold.

**Request:** Không có body.

**Response:**
```json
{
  "success": true,
  "message": "Xác nhận booking thành công",
  "data": {
    "id": "uuid",
    "status": "CONFIRMED",
    "holdExpireAt": null
  }
}
```

---

### 6.5. PATCH /bookings/:id/cancel — Huỷ booking

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Request:** Không có body.

**Response:**
```json
{
  "success": true,
  "message": "Huỷ booking thành công",
  "data": null
}
```

---

### 6.6. PUT /bookings/:id — Cập nhật booking

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `customerName` | string | ❌ | Tên khách |
| `customerPhone` | string | ❌ | SĐT khách |
| `depositAmount` | number | ❌ | Tiền cọc (min: 0) |
| `notes` | string | ❌ | Ghi chú |

**Response:** Booking object đã cập nhật.

---

### 6.7. GET /bookings/calendar/:roomId — Lịch booking theo phòng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `year` | int | ❌ | Năm |
| `month` | int | ❌ | Tháng |

**Response:**
```json
{
  "success": true,
  "message": "Lấy lịch phòng thành công",
  "data": [
    {
      "id": "uuid",
      "checkinDate": "2026-04-20T00:00:00.000Z",
      "checkoutDate": "2026-04-22T00:00:00.000Z",
      "status": "CONFIRMED",
      "customerName": "Nguyễn Văn B",
      "holdRemainingSeconds": 0,
      "sale": { "name": "Nhân viên A" }
    }
  ]
}
```

---

## 7. Bookings Customer — Đặt phòng khách hàng (3 endpoints)

---

### 7.1. POST /bookings/customer-hold — Khách giữ phòng

> **Auth:** Bearer Token | **Roles:** Tất cả (chủ yếu CUSTOMER)
> Logic: Giữ phòng 24 giờ → tự động huỷ nếu staff chưa confirm.

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `roomId` | string | ✅ | ID phòng |
| `checkinDate` | string | ✅ | Ngày nhận phòng (YYYY-MM-DD) |
| `checkoutDate` | string | ✅ | Ngày trả phòng (YYYY-MM-DD) |
| `guestCount` | int | ❌ | Số khách (default: 2, min: 1) |
| `customerName` | string | ❌ | Tên khách |
| `customerPhone` | string | ❌ | SĐT khách |
| `notes` | string | ❌ | Ghi chú |

**Response:**
```json
{
  "success": true,
  "message": "Đặt phòng thành công, chờ xác nhận trong 24 giờ",
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "customerId": "uuid",
    "checkinDate": "2026-04-20T00:00:00.000Z",
    "checkoutDate": "2026-04-22T00:00:00.000Z",
    "status": "HOLD",
    "holdExpireAt": "2026-04-21T14:00:00.000Z",
    "holdRemainingSeconds": 86400,
    "room": {
      "name": "Villa C3",
      "property": { "name": "Sunferia" }
    }
  }
}
```

---

### 7.2. GET /bookings/my — Booking của tôi

> **Auth:** Bearer Token | **Roles:** Tất cả

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `status` | string | ❌ | `HOLD`, `CONFIRMED`, `CANCELLED`, `COMPLETED` |

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách booking của bạn thành công",
  "data": [
    {
      "id": "uuid",
      "roomId": "uuid",
      "customerId": "uuid",
      "checkinDate": "2026-04-20T00:00:00.000Z",
      "checkoutDate": "2026-04-22T00:00:00.000Z",
      "status": "HOLD",
      "customerName": "Nguyễn Văn B",
      "customerPhone": "0987654321",
      "guestCount": 4,
      "notes": null,
      "holdRemainingSeconds": 3600,
      "room": {
        "id": "uuid",
        "name": "Villa C3",
        "code": "C3-06",
        "property": { "id": "uuid", "name": "Sunferia" }
      }
    }
  ]
}
```

---

### 7.3. PATCH /bookings/:id/customer-cancel — Khách huỷ booking

> **Auth:** Bearer Token | **Roles:** Tất cả
> Chỉ huỷ được booking `HOLD` của chính mình. Không huỷ được `CONFIRMED`.

**Request:** Không có body.

**Response:**
```json
{
  "success": true,
  "message": "Đã huỷ đặt phòng",
  "data": null
}
```

---

## 8. Calendar — Lịch phòng (5 endpoints)

---

### 8.1. GET /calendar/property-groups — Danh sách nhóm property

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `category` | string | ❌ | `VILLA`, `HOMESTAY`, `HOTEL`, `APARTMENT` |
| `ownerId` | string | ❌ | Filter theo chủ nhà |

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách nhóm property thành công",
  "data": [
    {
      "id": "uuid",
      "name": "Sunferia",
      "category": "VILLA",
      "roomCount": 12
    }
  ]
}
```

---

### 8.2. GET /calendar/grid — Dữ liệu lịch grid

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `propertyGroupId` | string | ✅ | ID nhóm property (property ID) |
| `startDate` | string | ✅ | Ngày bắt đầu (YYYY-MM-DD) |
| `endDate` | string | ✅ | Ngày kết thúc (YYYY-MM-DD) |

**Response:**
```json
{
  "success": true,
  "message": "Lấy dữ liệu lịch thành công",
  "data": {
    "propertyGroup": {
      "id": "uuid",
      "name": "Sunferia"
    },
    "rooms": [
      {
        "id": "uuid",
        "code": "C3-06",
        "name": "Villa C3",
        "days": [
          { "date": "2026-04-21", "price": 5000000, "status": "AVAILABLE" },
          { "date": "2026-04-22", "price": 5000000, "status": "BOOKED" },
          { "date": "2026-04-23", "price": 8000000, "status": "HOLD" }
        ]
      }
    ]
  }
}
```

**Giá theo ngày:**
| Ngày | Giá áp dụng |
|------|-------------|
| T2-T5 | `weekdayPrice` |
| T6 | `fridayPrice` |
| T7 | `saturdayPrice` |
| CN | `weekdayPrice` |

**Status:**
| Status | Mô tả |
|--------|-------|
| `AVAILABLE` | Phòng trống |
| `BOOKED` | Đã xác nhận (CONFIRMED) |
| `HOLD` | Đang giữ |

---

### 8.3. POST /calendar/lock — Khoá phòng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Tạo booking HOLD không có thời hạn hết (owner lock).

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `roomId` | string | ✅ | ID phòng |
| `date` | string | ✅ | Ngày cần lock (YYYY-MM-DD) |

**Response:**
```json
{
  "success": true,
  "message": "Khoá phòng thành công",
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "checkinDate": "2026-04-20T00:00:00.000Z",
    "checkoutDate": "2026-04-21T00:00:00.000Z",
    "status": "HOLD",
    "notes": "Owner lock"
  }
}
```

---

### 8.4. POST /calendar/unlock — Mở khoá phòng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF
> Chỉ unlock được ngày `HOLD`. Không unlock được `BOOKED` (CONFIRMED).

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `roomId` | string | ✅ | ID phòng |
| `date` | string | ✅ | Ngày cần unlock (YYYY-MM-DD) |

**Response:**
```json
{
  "success": true,
  "message": "Mở khoá phòng thành công",
  "data": null
}
```

---

### 8.5. GET /calendar/admin-contact — Thông tin liên hệ admin

> **Auth:** Không cần | **Roles:** —

**Response:**
```json
{
  "success": true,
  "message": "Lấy thông tin liên hệ admin thành công",
  "data": {
    "name": "Admin Halong24h",
    "phone": "0912345678",
    "zaloUrl": "https://zalo.me/0912345678"
  }
}
```

---

## 9. Notifications — Thông báo (4 endpoints)

---

### 9.1. GET /notifications — Danh sách thông báo

> **Auth:** Bearer Token | **Roles:** Tất cả
> Trả về thông báo của user đang đăng nhập, sắp xếp mới nhất trước.

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách thông báo thành công",
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "title": "Booking mới",
      "subtitle": "Phòng C3-06 được đặt bởi Nguyễn Văn B",
      "type": "BOOKING",
      "isRead": false,
      "targetId": "booking-uuid",
      "targetType": "booking",
      "createdAt": "2026-04-20T10:30:00.000Z"
    }
  ]
}
```

**Notification Type:**
| Type | Mô tả |
|------|-------|
| `BOOKING` | Thông báo về booking |
| `PAYMENT` | Thông báo thanh toán |
| `SYSTEM` | Thông báo hệ thống |

---

### 9.2. GET /notifications/unread-count — Số thông báo chưa đọc

> **Auth:** Bearer Token | **Roles:** Tất cả

**Response:**
```json
{
  "success": true,
  "message": "Lấy số thông báo chưa đọc thành công",
  "data": {
    "count": 5
  }
}
```

---

### 9.3. PATCH /notifications/:id/read — Đánh dấu đã đọc

> **Auth:** Bearer Token | **Roles:** Tất cả
> Chỉ đánh dấu notification của chính mình.

**Request:** Không có body.

**Response:**
```json
{
  "success": true,
  "message": "Đánh dấu đã đọc thành công",
  "data": null
}
```

---

### 9.4. PATCH /notifications/read-all — Đánh dấu tất cả đã đọc

> **Auth:** Bearer Token | **Roles:** Tất cả

**Request:** Không có body.

**Response:**
```json
{
  "success": true,
  "message": "Đánh dấu tất cả đã đọc thành công",
  "data": null
}
```

---

## 10. Dashboard & Reports — Thống kê (2 endpoints)

---

### 10.1. GET /dashboard/stats — KPI Dashboard

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Response:**
```json
{
  "success": true,
  "message": "Lấy thống kê dashboard thành công",
  "data": {
    "totalRooms": 24,
    "activeRooms": 22,
    "emptyRooms": 8,
    "occupiedRooms": 12,
    "checkoutToday": 4,
    "totalBookings": 156,
    "thisMonthBookings": 23,
    "monthlyRevenue": 184500000,
    "todayRevenue": 6200000
  }
}
```

**Chi tiết trường:**
| Trường | Kiểu | Mô tả |
|--------|-------|-------|
| `totalRooms` | int | Tổng số phòng |
| `activeRooms` | int | Phòng đang hoạt động (isActive = true) |
| `emptyRooms` | int | Phòng trống hôm nay |
| `occupiedRooms` | int | Phòng đang có khách hôm nay |
| `checkoutToday` | int | Số booking checkout hôm nay |
| `totalBookings` | int | Tổng booking toàn hệ thống |
| `thisMonthBookings` | int | Booking tạo trong tháng này |
| `monthlyRevenue` | number | Tổng tiền cọc tháng này (VNĐ) |
| `todayRevenue` | number | Tổng tiền cọc hôm nay (VNĐ) |

---

### 10.2. GET /reports — Báo cáo theo tháng

> **Auth:** Bearer Token | **Roles:** ADMIN, STAFF

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `month` | int | ❌ | Tháng (default: tháng hiện tại) |
| `year` | int | ❌ | Năm (default: năm hiện tại) |

**Response:**
```json
{
  "success": true,
  "message": "Lấy dữ liệu báo cáo thành công",
  "data": {
    "totalRooms": 24,
    "activeRooms": 22,
    "totalBookings": 156,
    "thisMonthBookings": 23,
    "holdCount": 5,
    "confirmedCount": 15,
    "cancelledCount": 3,
    "completedCount": 133,
    "totalDeposit": 45000000,
    "occupancyRate": 75.5,
    "roomsWithCover": 20,
    "roomsWithPrice": 22,
    "recentBookings": [
      {
        "id": "uuid",
        "roomId": "uuid",
        "checkinDate": "2026-04-20T00:00:00.000Z",
        "checkoutDate": "2026-04-22T00:00:00.000Z",
        "status": "CONFIRMED",
        "customerName": "Nguyễn Văn B",
        "room": {
          "id": "uuid",
          "name": "Villa C3",
          "code": "C3-06",
          "property": { "name": "Sunferia" }
        },
        "sale": { "id": "uuid", "name": "Nhân viên A" }
      }
    ]
  }
}
```

**Chi tiết trường:**
| Trường | Kiểu | Mô tả |
|--------|-------|-------|
| `totalRooms` | int | Tổng phòng |
| `activeRooms` | int | Phòng hoạt động |
| `totalBookings` | int | Tổng booking toàn hệ thống |
| `thisMonthBookings` | int | Booking tháng được chọn |
| `holdCount` | int | Số booking HOLD trong tháng |
| `confirmedCount` | int | Số booking CONFIRMED trong tháng |
| `cancelledCount` | int | Số booking CANCELLED trong tháng |
| `completedCount` | int | Số booking COMPLETED trong tháng |
| `totalDeposit` | number | Tổng tiền cọc tháng (VNĐ) |
| `occupancyRate` | number | Tỷ lệ lấp đầy (%) |
| `roomsWithCover` | int | Phòng có ảnh bìa |
| `roomsWithPrice` | int | Phòng đã có giá |
| `recentBookings` | array | 10 booking gần nhất |

---

## 11. Partner API — Đối tác (5 endpoints)

> Auth bằng header `X-Partner-Key` thay vì Bearer Token.

---

### 11.1. GET /partner/rooms — Danh sách phòng

> **Auth:** `X-Partner-Key: {apiKey}` | **Roles:** —

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `propertyId` | string | ❌ | Filter theo property |
| `page` | int | ❌ | Trang (default: 1) |
| `limit` | int | ❌ | Số phòng/trang (default: 20) |

**Response:**
```json
{
  "success": true,
  "message": "Lấy danh sách phòng thành công",
  "data": [{ "...room objects..." }],
  "meta": {
    "total": 24,
    "page": 1,
    "limit": 20,
    "totalPages": 2
  }
}
```

---

### 11.2. GET /partner/rooms/:id — Chi tiết phòng

> **Auth:** `X-Partner-Key: {apiKey}` | **Roles:** —

**Response:**
```json
{
  "success": true,
  "message": "Lấy chi tiết phòng thành công",
  "data": {
    "id": "uuid",
    "propertyId": "uuid",
    "name": "Villa Sunferia C3",
    "code": "C3-06",
    "type": "VILLA",
    "property": {
      "id": "uuid",
      "name": "Sunferia",
      "address": "Bãi Cháy, Hạ Long",
      "latitude": 20.9555,
      "longitude": 107.0483,
      "mapLink": "https://maps.google.com/..."
    },
    "images": [],
    "price": { "weekdayPrice": 5000000, "fridayPrice": 7000000, "saturdayPrice": 8000000, "holidayPrice": 12000000 }
  }
}
```

---

### 11.3. GET /partner/rooms/:id/availability — Tình trạng phòng

> **Auth:** `X-Partner-Key: {apiKey}` | **Roles:** —

**Query Params:**
| Param | Kiểu | Bắt buộc | Mô tả |
|-------|-------|:--------:|-------|
| `year` | int | ❌ | Năm (default: năm hiện tại) |
| `month` | int | ❌ | Tháng (default: tháng hiện tại) |

**Response:**
```json
{
  "success": true,
  "message": "Lấy tình trạng phòng thành công",
  "data": [
    {
      "checkinDate": "2026-04-20T00:00:00.000Z",
      "checkoutDate": "2026-04-22T00:00:00.000Z",
      "status": "CONFIRMED"
    }
  ]
}
```

---

### 11.4. POST /partner/bookings — Tạo booking

> **Auth:** `X-Partner-Key: {apiKey}` | **Roles:** —

**Request Body:**
| Trường | Kiểu | Bắt buộc | Mô tả |
|--------|-------|:--------:|-------|
| `roomId` | string | ✅ | ID phòng |
| `checkinDate` | string | ✅ | Ngày nhận phòng (ISO) |
| `checkoutDate` | string | ✅ | Ngày trả phòng (ISO) |
| `customerName` | string | ✅ | Tên khách |
| `customerPhone` | string | ✅ | SĐT khách |
| `notes` | string | ❌ | Ghi chú |

**Response:**
```json
{
  "success": true,
  "message": "Tạo booking qua partner thành công",
  "data": {
    "id": "uuid",
    "roomId": "uuid",
    "status": "HOLD",
    "holdExpireAt": "2026-04-20T14:30:00.000Z",
    "customerName": "Nguyễn Văn B",
    "customerPhone": "0987654321"
  }
}
```

---

### 11.5. POST /partner/bookings/:id/cancel — Huỷ booking

> **Auth:** `X-Partner-Key: {apiKey}` | **Roles:** —

**Request:** Không có body.

**Response:**
```json
{
  "success": true,
  "message": "Huỷ booking thành công",
  "data": {
    "id": "uuid",
    "status": "CANCELLED"
  }
}
```

---

## 12. Tổng kết endpoints (49 endpoints)

| # | Method | Endpoint | Mô tả |
|---|--------|----------|--------|
| 1 | POST | `/auth/register` | Đăng ký |
| 2 | POST | `/auth/login` | Đăng nhập |
| 3 | POST | `/auth/google` | Đăng nhập Google |
| 4 | POST | `/auth/refresh` | Refresh token |
| 5 | POST | `/auth/forgot-password` | Quên mật khẩu |
| 6 | POST | `/auth/reset-password` | Đặt lại mật khẩu |
| 7 | POST | `/auth/logout` | Đăng xuất |
| 8 | GET | `/auth/profile` | Thông tin cá nhân |
| 9 | PATCH | `/auth/change-password` | Đổi mật khẩu |
| 10 | GET | `/users` | Danh sách users |
| 11 | GET | `/users/:id` | Chi tiết user |
| 12 | POST | `/users` | Tạo user |
| 13 | PUT | `/users/:id` | Cập nhật user |
| 14 | DELETE | `/users/:id` | Vô hiệu hoá user |
| 15 | GET | `/properties` | Danh sách properties |
| 16 | GET | `/properties/:id` | Chi tiết property |
| 17 | POST | `/properties` | Tạo property |
| 18 | PUT | `/properties/:id` | Cập nhật property |
| 19 | DELETE | `/properties/:id` | Xoá property |
| 20 | GET | `/rooms/public` | Phòng công khai |
| 21 | GET | `/rooms` | Phòng nội bộ |
| 22 | GET | `/rooms/:id` | Chi tiết phòng |
| 23 | POST | `/rooms` | Tạo phòng |
| 24 | PUT | `/rooms/:id` | Cập nhật phòng |
| 25 | DELETE | `/rooms/:id` | Xoá phòng |
| 26 | POST | `/rooms/:id/images` | Upload ảnh |
| 27 | DELETE | `/rooms/:id/images/:imageId` | Xoá ảnh |
| 28 | PATCH | `/rooms/:id/images/:imageId/cover` | Set ảnh bìa |
| 29 | GET | `/rooms/:roomId/prices` | Lấy giá phòng |
| 30 | PUT | `/rooms/:roomId/prices` | Cập nhật giá |
| 31 | GET | `/bookings` | Danh sách bookings |
| 32 | GET | `/bookings/:id` | Chi tiết booking |
| 33 | POST | `/bookings/hold` | Giữ phòng (Staff) |
| 34 | PATCH | `/bookings/:id/confirm` | Xác nhận booking |
| 35 | PATCH | `/bookings/:id/cancel` | Huỷ booking |
| 36 | PUT | `/bookings/:id` | Cập nhật booking |
| 37 | GET | `/bookings/calendar/:roomId` | Lịch booking phòng |
| 38 | POST | `/bookings/customer-hold` | Khách giữ phòng |
| 39 | GET | `/bookings/my` | Booking của tôi |
| 40 | PATCH | `/bookings/:id/customer-cancel` | Khách huỷ booking |
| 41 | GET | `/calendar/property-groups` | Nhóm property |
| 42 | GET | `/calendar/grid` | Lịch grid |
| 43 | POST | `/calendar/lock` | Khoá phòng |
| 44 | POST | `/calendar/unlock` | Mở khoá phòng |
| 45 | GET | `/calendar/admin-contact` | Liên hệ admin |
| 46 | GET | `/notifications` | Thông báo |
| 47 | GET | `/notifications/unread-count` | Số chưa đọc |
| 48 | PATCH | `/notifications/:id/read` | Đánh dấu đã đọc |
| 49 | PATCH | `/notifications/read-all` | Đọc tất cả |
| — | | **Partner API** | |
| 50 | GET | `/partner/rooms` | Phòng (Partner) |
| 51 | GET | `/partner/rooms/:id` | Chi tiết (Partner) |
| 52 | GET | `/partner/rooms/:id/availability` | Tình trạng (Partner) |
| 53 | POST | `/partner/bookings` | Tạo booking (Partner) |
| 54 | POST | `/partner/bookings/:id/cancel` | Huỷ booking (Partner) |
