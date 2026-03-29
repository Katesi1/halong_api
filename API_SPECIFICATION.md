# API SPECIFICATION — Halong24h Property Management

> Base URL: `http://103.183.118.148:3000`
> Auth: `Authorization: Bearer {accessToken}` cho tất cả endpoint có 🔒
> Response format chung: `{ "success": true/false, "data": ..., "message": "..." }`

---

## Mục lục

1. [Authentication](#1-authentication)
2. [Users — Admin quản lý](#2-users)
3. [Properties — Quản lý cơ sở](#3-properties)
4. [Rooms — Quản lý phòng](#4-rooms)
5. [Room Images — Ảnh phòng](#5-room-images)
6. [Room Prices — Bảng giá](#6-room-prices)
7. [Bookings — Staff/Admin](#7-bookings-staffadmin)
8. [Bookings — Customer](#8-bookings-customer)
9. [Calendar Grid — Lịch phòng dạng lưới ⚠️ CẦN TẠO MỚI](#9-calendar-grid)
10. [Notifications — Thông báo ⚠️ CẦN TẠO MỚI](#10-notifications)
11. [Màn hình → Endpoint mapping](#11-màn-hình--endpoint-mapping)
12. [Tổng kết endpoints](#12-tổng-kết-endpoints)

---

## 1. Authentication

### Màn hình dùng: Login, Register, Forgot Password, Change Password, Profile

---

### 1.1 Đăng nhập
```
POST /auth/login
```
**Body:**
| Field | Type | Required |
|-------|------|----------|
| `phone` | string | ✅ |
| `password` | string | ✅ |

**Response:** `{ data: { user: UserObject, accessToken, refreshToken } }`

---

### 1.2 Đăng ký
```
POST /auth/register
```
**Body:**
| Field | Type | Required |
|-------|------|----------|
| `name` | string | ✅ |
| `phone` | string | ✅ |
| `password` | string | ✅ (min 6) |
| `role` | string | ✅ `STAFF` hoặc `CUSTOMER` |
| `email` | string | ❌ |

**Response:** `{ data: { user: UserObject, accessToken, refreshToken } }`

---

### 1.3 Đăng nhập Google
```
POST /auth/google
```
**Body:**
| Field | Type | Required |
|-------|------|----------|
| `idToken` | string | ✅ |
| `role` | string | ❌ (chỉ cần khi tạo user mới) |

---

### 1.4 Refresh Token
```
POST /auth/refresh
```
**Body:** `{ refreshToken: string }` *(không cần Authorization header)*

**Response:** `{ data: { accessToken, refreshToken } }`

**Lưu ý:** App tự động gọi khi nhận lỗi 401.

---

### 1.5 Đăng xuất
```
POST /auth/logout   🔒
```
Không có body.

---

### 1.6 Quên mật khẩu
```
POST /auth/forgot-password
```
**Body:** `{ identifier: string }` (SĐT hoặc email)

---

### 1.7 Reset mật khẩu
```
POST /auth/reset-password
```
**Body:** `{ token: string, newPassword: string }`

---

### 1.8 Đổi mật khẩu
```
POST /auth/change-password   🔒
```
**Body:** `{ currentPassword: string, newPassword: string }`

---

### User Object
```json
{
  "id": "uuid",
  "name": "Nguyễn Văn A",
  "phone": "0912345678",
  "email": "a@gmail.com",
  "role": "STAFF",
  "isActive": true,
  "gender": "male",
  "dateOfBirth": "1990-01-15",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

---

## 2. Users

### Màn hình dùng: `/admin/users` (UserListScreen), `/admin/users/new`, `/admin/users/:id/edit` (UserFormScreen), `/profile/edit` (PersonalInfoScreen)

> Chỉ ADMIN mới có quyền CRUD users.
> `PUT /users/:id` cũng được dùng bởi chính user để update profile của mình.

---

### 2.1 Danh sách users
```
GET /users   🔒
```
| Query | Type | Required | Dùng ở đâu |
|-------|------|----------|------------|
| `role` | string | ❌ | AdminScreen filter theo ADMIN/STAFF/CUSTOMER |

---

### 2.2 Chi tiết user
```
GET /users/:id   🔒
```
Dùng ở: UserFormScreen (edit mode)

---

### 2.3 Tạo user
```
POST /users   🔒
```
**Body:**
| Field | Type | Required |
|-------|------|----------|
| `name` | string | ✅ |
| `phone` | string | ✅ |
| `password` | string | ✅ |
| `role` | string | ✅ `ADMIN` / `STAFF` / `CUSTOMER` |
| `email` | string | ❌ |
| `isActive` | boolean | ❌ |

---

### 2.4 Cập nhật user
```
PUT /users/:id   🔒
```
**Body (tất cả optional):**
| Field | Type | Dùng ở đâu |
|-------|------|------------|
| `name` | string | PersonalInfoScreen, UserFormScreen |
| `phone` | string | UserFormScreen |
| `email` | string | PersonalInfoScreen, UserFormScreen |
| `password` | string | UserFormScreen |
| `role` | string | UserFormScreen |
| `isActive` | boolean | UserFormScreen |
| `gender` | string | PersonalInfoScreen |
| `dateOfBirth` | string | PersonalInfoScreen |

---

### 2.5 Xoá (vô hiệu hoá) user
```
DELETE /users/:id   🔒
```
Dùng ở: UserListScreen (swipe to delete)

---

## 3. Properties

### Màn hình dùng: `/properties` (PropertyManagementScreen), `/properties/new` (PropertyAddScreen), `/properties/:id` (PropertyManageScreen + sub-screens)

---

### 3.1 Danh sách properties
```
GET /properties   🔒
```
Dùng ở: PropertyManagementScreen (list tất cả cơ sở), DashboardScreen

---

### 3.2 Chi tiết property
```
GET /properties/:id   🔒
```
Dùng ở: PropertyInfoScreen, PropertyManageScreen

---

### 3.3 Tạo property
```
POST /properties   🔒
```
**Body:**
| Field | Type | Required | Màn hình |
|-------|------|----------|----------|
| `name` | string | ✅ | PropertyAddScreen |
| `address` | string | ✅ | PropertyAddScreen |
| `ownerId` | string | ✅ | PropertyAddScreen |
| `latitude` | double | ❌ | PropertyLocationScreen |
| `longitude` | double | ❌ | PropertyLocationScreen |
| `mapLink` | string | ❌ | PropertyLocationScreen |
| `isActive` | boolean | ❌ | PropertyInfoScreen |

---

### 3.4 Cập nhật property
```
PUT /properties/:id   🔒
```
**Dùng ở các màn hình con:**
- `PropertyInfoScreen` → cập nhật `name`, `address`, `isActive`
- `PropertyLocationScreen` → cập nhật `latitude`, `longitude`, `mapLink`
- `PropertyRulesScreen` → cập nhật `rules` *(backend cần thêm field này vào Property model)*
- `PropertyServicesScreen` → cập nhật `services` *(backend cần thêm field này vào Property model)*

> ⚠️ **Lưu ý:** `PropertyAmenitiesScreen` và `PropertyCancellationScreen` gọi `PUT /rooms/:id`, không phải endpoint này. Xem section 4.5.

---

### 3.5 Xoá property
```
DELETE /properties/:id   🔒
```
Dùng ở: PropertyManagementScreen

---

### Property Object
```json
{
  "id": "uuid",
  "ownerId": "uuid",
  "name": "Sunferia Villa",
  "address": "Bãi Cháy, Hạ Long",
  "latitude": 20.9555,
  "longitude": 107.0483,
  "mapLink": "https://maps.google.com/...",
  "isActive": true,
  "rules": "Không hút thuốc trong phòng...",
  "services": "Dọn phòng hàng ngày, đưa đón sân bay...",
  "owner": { "id": "uuid", "name": "Chủ nhà A" },
  "_count": { "rooms": 12 }
}
```

---

## 4. Rooms

### Màn hình dùng: `/rooms` (RoomListScreen), `/rooms/:id` (RoomDetailScreen), `/properties/:id` (PropertyManageScreen — list phòng theo property)

---

### 4.1 Danh sách phòng (Staff/Admin)
```
GET /rooms   🔒
```
> ⚠️ **Backend lưu ý:** Query param hiện tại là `homestayId` — yêu cầu đổi thành `propertyId`.

| Query | Type | Required | Dùng ở đâu |
|-------|------|----------|------------|
| `propertyId` | string | ❌ | PropertyManageScreen (lọc theo cơ sở) |

Dùng ở: RoomListScreen (toàn bộ), DashboardScreen (tính KPI), ReportScreen (tính báo cáo)

---

### 4.2 Danh sách phòng công khai (Customer)
```
GET /rooms/public
```
| Query | Type | Required | Dùng ở đâu |
|-------|------|----------|------------|
| `checkinDate` | string (YYYY-MM-DD) | ❌ | SearchRoomScreen |
| `checkoutDate` | string (YYYY-MM-DD) | ❌ | SearchRoomScreen |
| `guests` | int | ❌ | SearchRoomScreen |
| `minPrice` | double | ❌ | SearchRoomScreen |
| `maxPrice` | double | ❌ | SearchRoomScreen |

Dùng ở: CustomerHomeScreen (load danh sách nổi bật), SearchRoomScreen (có filter)

---

### 4.3 Chi tiết phòng
```
GET /rooms/:id   🔒
```
Dùng ở: RoomDetailScreen, HoldRoomScreen (Staff)

---

### 4.4 Tạo phòng
```
POST /rooms   🔒
```
> ⚠️ **Backend lưu ý:** Field hiện tại là `homestayId` — yêu cầu đổi thành `propertyId` để đồng nhất.

**Body:**
| Field | Type | Required |
|-------|------|----------|
| `propertyId` | string | ✅ |
| `name` | string | ✅ |
| `code` | string | ✅ |
| `type` | string | ❌ `VILLA` / `HOMESTAY` / `APARTMENT` / `HOTEL` |
| `bedrooms` | int | ❌ |
| `bathrooms` | int | ❌ |
| `standardGuests` | int | ❌ |
| `maxGuests` | int | ❌ |
| `description` | string | ❌ |
| `address` | string | ❌ |
| `mapLink` | string | ❌ |
| `amenities` | string[] | ❌ |
| `cancellationPolicy` | string | ❌ `FLEXIBLE` / `MODERATE` / `STRICT` |
| `adultSurcharge` | double | ❌ |
| `childSurcharge` | double | ❌ |
| `isActive` | boolean | ❌ |

Dùng ở: PropertyManageScreen (nút thêm phòng mới)

---

### 4.5 Cập nhật phòng
```
PUT /rooms/:id   🔒
```
Body giống tạo, tất cả optional.
Dùng ở: RoomDetailScreen (edit inline), PropertyAmenitiesScreen, PropertyCancellationScreen

---

### 4.6 Xoá phòng
```
DELETE /rooms/:id   🔒
```
Dùng ở: RoomListScreen, PropertyManageScreen

---

### Room Object
```json
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
  "images": [RoomImageObject],
  "price": RoomPriceObject,
  "property": { "id": "uuid", "name": "Sunferia", "address": "Bãi Cháy" }
}
```

---

## 5. Room Images

### Màn hình dùng: `/properties/:id/images` (PropertyImagesScreen)

---

### 5.1 Upload ảnh
```
POST /rooms/:roomId/images   🔒
Content-Type: multipart/form-data
```
**Body:** `images` (File[], tối đa 20 ảnh)

**Response:** `{ data: [RoomImageObject] }`

---

### 5.2 Xoá ảnh
```
DELETE /rooms/:roomId/images/:imageId   🔒
```

---

### 5.3 Set ảnh bìa
```
PATCH /rooms/:roomId/images/:imageId/cover   🔒
```
Không có body.

---

### Room Image Object
```json
{
  "id": "uuid",
  "roomId": "uuid",
  "imageUrl": "https://res.cloudinary.com/...",
  "publicId": "homestay/abc123",
  "isCover": true,
  "order": 0
}
```

---

## 6. Room Prices

### Màn hình dùng: `/properties/:id/pricing` (PropertyPricingScreen)

---

### 6.1 Upsert giá phòng (tạo mới hoặc cập nhật)
```
PUT /rooms/:roomId/prices   🔒
```
**Body:**
| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `weekdayPrice` | double | ✅ | Giá T2–T5 |
| `fridayPrice` | double | ✅ | Giá thứ 6 |
| `saturdayPrice` | double | ✅ | Giá thứ 7 |
| `holidayPrice` | double | ✅ | Giá ngày lễ / cao điểm |

---

### Room Price Object
```json
{
  "id": "uuid",
  "roomId": "uuid",
  "weekdayPrice": 5000000,
  "fridayPrice": 7000000,
  "saturdayPrice": 8000000,
  "holidayPrice": 12000000
}
```

---

## 7. Bookings (Staff/Admin)

### Màn hình dùng: `/bookings` (BookingListScreen), `/rooms/:id/hold` (HoldRoomScreen), `/calendar` (BookingCalendarScreen)

---

### 7.1 Danh sách bookings
```
GET /bookings   🔒
```
| Query | Type | Required | Dùng ở đâu |
|-------|------|----------|------------|
| `roomId` | string | ❌ | Filter khi xem booking của 1 phòng |

Dùng ở: BookingListScreen (toàn bộ), DashboardScreen (tính KPI), ReportScreen

---

### 7.2 Giữ phòng (Hold)
```
POST /bookings/hold   🔒
```
**Body:**
| Field | Type | Required |
|-------|------|----------|
| `roomId` | string | ✅ |
| `checkinDate` | string (ISO) | ✅ |
| `checkoutDate` | string (ISO) | ✅ |
| `customerName` | string | ❌ |
| `customerPhone` | string | ❌ |
| `depositAmount` | double | ❌ |
| `notes` | string | ❌ |

**Logic:** Giữ phòng 30 phút, tự động huỷ nếu chưa confirm.

Dùng ở: HoldRoomScreen (Staff tạo booking mới)

---

### 7.3 Xác nhận booking
```
PATCH /bookings/:id/confirm   🔒
```
Không có body. `HOLD` → `CONFIRMED`

Dùng ở: BookingListScreen (nút Xác nhận)

---

### 7.4 Huỷ booking
```
PATCH /bookings/:id/cancel   🔒
```
Không có body. → `CANCELLED`

Dùng ở: BookingListScreen (nút Huỷ)

---

### 7.5 Cập nhật booking
```
PUT /bookings/:id   🔒
```
**Body (tất cả optional):**
| Field | Type |
|-------|------|
| `checkinDate` | string (ISO) |
| `checkoutDate` | string (ISO) |
| `customerName` | string |
| `customerPhone` | string |
| `depositAmount` | double |
| `notes` | string |
| `status` | string `HOLD`/`CONFIRMED`/`CANCELLED`/`COMPLETED` |

Dùng ở: BookingListScreen (edit inline)

---

### 7.6 Lịch booking theo phòng
```
GET /bookings/calendar/:roomId   🔒
```
| Query | Type | Required |
|-------|------|----------|
| `year` | int | ✅ |
| `month` | int | ✅ |

**Response:** `{ data: [CalendarBookingObject] }`

Dùng ở: RoomDetailScreen (xem lịch 1 phòng cụ thể)

---

### CalendarBooking Object
```json
{
  "id": "uuid",
  "checkinDate": "2026-04-20T14:00:00Z",
  "checkoutDate": "2026-04-22T12:00:00Z",
  "status": "CONFIRMED",
  "customerName": "Nguyễn Văn B",
  "holdRemainingSeconds": 0
}
```

---

### Booking Object
```json
{
  "id": "uuid",
  "roomId": "uuid",
  "saleId": "uuid",
  "checkinDate": "2026-04-20T14:00:00Z",
  "checkoutDate": "2026-04-22T12:00:00Z",
  "status": "CONFIRMED",
  "holdExpireAt": "2026-04-20T14:30:00Z",
  "customerName": "Nguyễn Văn B",
  "customerPhone": "0987654321",
  "depositAmount": 2000000,
  "notes": "Cần thêm đệm",
  "holdRemainingSeconds": 0,
  "room": {
    "id": "uuid",
    "name": "C3-06",
    "code": "C3-06",
    "property": { "name": "Sunferia" }
  },
  "sale": { "id": "uuid", "name": "Nhân viên A" }
}
```

---

## 8. Bookings (Customer)

### Màn hình dùng: `/my-bookings` (MyBookingsScreen), `/search` (SearchRoomScreen — khi customer bấm đặt phòng)

---

### 8.1 Khách giữ phòng
```
POST /bookings/customer-hold   🔒
```
**Body:**
| Field | Type | Required |
|-------|------|----------|
| `roomId` | string | ✅ |
| `checkinDate` | string (ISO) | ✅ |
| `checkoutDate` | string (ISO) | ✅ |
| `customerName` | string | ❌ |
| `customerPhone` | string | ❌ |
| `notes` | string | ❌ |

Dùng ở: SearchRoomScreen (customer chọn phòng và đặt)

---

### 8.2 Booking của tôi
```
GET /bookings/my   🔒
```
| Query | Type | Required | Dùng ở đâu |
|-------|------|----------|------------|
| `status` | string | ❌ | MyBookingsScreen (tab filter: HOLD/CONFIRMED/CANCELLED) |

Dùng ở: MyBookingsScreen

---

### 8.3 Khách huỷ booking
```
PATCH /bookings/:id/customer-cancel   🔒
```
Chỉ huỷ được booking có status `HOLD`.

Dùng ở: MyBookingsScreen (nút Huỷ)

---

## 9. Calendar Grid

> ⚠️ **CẦN TẠO MỚI — Ưu tiên CAO**
> Dùng cho 2 màn hình: `/calendar` (BookingCalendarScreen) và `/admin/owner-calendar` (OwnerCalendarScreen)
> Hiện tại cả 2 màn hình đang dùng **mock data** — cần API thật để hoạt động.

---

### 9.1 Danh sách property groups (cho tab filter)
```
GET /calendar/property-groups   🔒
```
| Query | Type | Required | Dùng ở đâu |
|-------|------|----------|------------|
| `category` | string | ❌ | `VILLA`/`HOMESTAY`/`HOTEL` — BookingCalendarScreen tab filter |
| `ownerId` | string | ❌ | OwnerCalendarScreen (chủ nhà chỉ thấy cơ sở của mình) |

**Response:**
```json
{
  "data": [
    { "id": "uuid", "name": "Sunferia", "category": "VILLA", "roomCount": 12 }
  ]
}
```

Dùng ở: BookingCalendarScreen (tabs: Tất cả / Villa / Homestay / Hotel), OwnerCalendarScreen

---

### 9.2 Calendar grid data
```
GET /calendar/grid   🔒
```
> ⚠️ **Lưu ý:** `propertyGroupId` ở đây là **ID của một property** (tức `/properties/:id`). Backend dùng tên `propertyGroupId` để nhóm các phòng thuộc cùng một cơ sở lại với nhau trong grid.

| Query | Type | Required | Mô tả |
|-------|------|----------|-------|
| `propertyGroupId` | string | ✅ | ID của property (từ `GET /properties`) |
| `startDate` | string (YYYY-MM-DD) | ✅ | Ngày bắt đầu hiển thị |
| `endDate` | string (YYYY-MM-DD) | ✅ | Ngày kết thúc hiển thị |

**Response:**
```json
{
  "data": {
    "propertyGroup": { "id": "uuid", "name": "Sunferia" },
    "rooms": [
      {
        "id": "uuid",
        "code": "C3-06",
        "name": "Villa C3",
        "days": [
          { "date": "2026-04-21", "price": 5000000, "status": "AVAILABLE" },
          { "date": "2026-04-22", "price": 5000000, "status": "BOOKED", "bookingId": "uuid", "customerName": "Nguyễn Văn B" },
          { "date": "2026-04-23", "price": 8000000, "status": "HOLD" }
        ]
      }
    ]
  }
}
```

**CalendarDay status:** `AVAILABLE` | `BOOKED` | `HOLD`

Dùng ở: BookingCalendarScreen (grid chính), OwnerCalendarScreen (grid với khả năng lock/unlock)

---

### 9.3 Lock phòng (Owner tự khoá ngày)
```
POST /calendar/lock   🔒
```
**Body:**
| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `roomId` | string | ✅ | ID phòng cần khoá |
| `date` | string (YYYY-MM-DD) | ✅ | Ngày cần khoá |

**Logic:** Chuyển status ngày đó → `HOLD` (không nhận đặt phòng)

Dùng ở: OwnerCalendarScreen (owner tap vào ô AVAILABLE → khoá)

---

### 9.4 Unlock phòng (Owner mở lại)
```
POST /calendar/unlock   🔒
```
**Body:**
| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `roomId` | string | ✅ | ID phòng |
| `date` | string (YYYY-MM-DD) | ✅ | Ngày cần mở |

**Logic:** `HOLD` → `AVAILABLE`. **Không thể unlock ngày đã `BOOKED`.**

Dùng ở: OwnerCalendarScreen (owner tap vào ô HOLD → mở)

---

### 9.5 Thông tin liên hệ admin (BookingCalendarScreen)
```
GET /calendar/admin-contact
```
Không cần auth.

**Response:**
```json
{
  "data": {
    "name": "Admin Halong24h",
    "phone": "0912345678",
    "zaloUrl": "https://zalo.me/0912345678"
  }
}
```

Dùng ở: BookingCalendarScreen — khi customer tap vào ngày BOOKED/HOLD → popup "Liên hệ Zalo để đặt"

---

## 10. Notifications

> ⚠️ **CẦN TẠO MỚI — Ưu tiên TRUNG BÌNH**
> Hiện tại `/notifications` đang dùng **mock data** trong `notification_repository.dart`

### Màn hình dùng: `/notifications` (NotificationScreen), AppScaffold (badge số chưa đọc)

---

### 10.1 Danh sách thông báo
```
GET /notifications   🔒
```
**Response:** `{ data: [NotificationObject] }`

---

### 10.2 Số thông báo chưa đọc
```
GET /notifications/unread-count   🔒
```
**Response:** `{ data: { count: 5 } }`

Dùng ở: AppScaffold (badge icon chuông)

---

### 10.3 Đánh dấu đã đọc
```
PATCH /notifications/:id/read   🔒
```
Dùng ở: NotificationScreen (tap vào thông báo)

---

### 10.4 Đánh dấu tất cả đã đọc
```
PATCH /notifications/read-all   🔒
```
Dùng ở: NotificationScreen (nút "Đọc tất cả")

---

### Notification Object
```json
{
  "id": "uuid",
  "title": "Booking mới",
  "subtitle": "Phòng C3-06 được đặt bởi Nguyễn Văn B",
  "type": "BOOKING",
  "isRead": false,
  "createdAt": "2026-04-20T10:30:00Z",
  "targetId": "booking-uuid",
  "targetType": "booking"
}
```

| type | Mô tả |
|------|-------|
| `BOOKING` | Booking mới / thay đổi trạng thái |
| `PAYMENT` | Thanh toán |
| `SYSTEM` | Hệ thống |

---

## 11. Màn hình → Endpoint Mapping

> Bảng tham chiếu nhanh: màn hình nào gọi API nào.

### 11.1 Authentication Flow

| Màn hình | Route | API Calls |
|----------|-------|-----------|
| SplashScreen | `/` | — (check local token) |
| LoginScreen | `/login` | `POST /auth/login`, `POST /auth/google` |
| RegisterScreen | `/register` | `POST /auth/register` |
| ForgotPasswordScreen | `/forgot-password` | `POST /auth/forgot-password`, `POST /auth/reset-password` |

---

### 11.2 Customer Flow

| Màn hình | Route | API Calls |
|----------|-------|-----------|
| CustomerHomeScreen | `/home` | `GET /rooms/public` (featured rooms, không filter) |
| SearchRoomScreen | `/search` | `GET /rooms/public` (với filter ngày/khách/giá), `POST /bookings/customer-hold` |
| MyBookingsScreen | `/my-bookings` | `GET /bookings/my`, `PATCH /bookings/:id/customer-cancel` |
| AccountScreen | `/account` | — (đọc local state) |

---

### 11.3 Staff/Admin Management Flow

| Màn hình | Route | API Calls |
|----------|-------|-----------|
| DashboardScreen | `/dashboard` | `GET /rooms`, `GET /bookings` (tính KPI client-side) |
| RoomListScreen | `/rooms` | `GET /rooms`, `DELETE /rooms/:id` |
| RoomDetailScreen | `/rooms/:id` | `GET /rooms/:id`, `PUT /rooms/:id`, `GET /bookings/calendar/:roomId` |
| HoldRoomScreen | `/rooms/:id/hold` | `POST /bookings/hold` |
| BookingListScreen | `/bookings` | `GET /bookings`, `PATCH /bookings/:id/confirm`, `PATCH /bookings/:id/cancel`, `PUT /bookings/:id` |
| BookingCalendarScreen | `/calendar` | `GET /calendar/property-groups`, `GET /calendar/grid`, `GET /calendar/admin-contact` |
| ReportScreen | `/reports` | `GET /rooms`, `GET /bookings` (tính báo cáo client-side) |

---

### 11.4 Property Management Flow

| Màn hình | Route | API Calls |
|----------|-------|-----------|
| PropertyManagementScreen | `/properties` | `GET /properties`, `DELETE /properties/:id` |
| PropertyAddScreen | `/properties/new` | `POST /properties` |
| PropertyManageScreen | `/properties/:id` | `GET /properties/:id`, `GET /rooms?propertyId=`, `DELETE /rooms/:id` |
| PropertyInfoScreen | `/properties/:id/info` | `PUT /properties/:id` (name, address, isActive) |
| PropertyImagesScreen | `/properties/:id/images` | `POST /rooms/:roomId/images`, `DELETE /rooms/:roomId/images/:imageId`, `PATCH /rooms/:roomId/images/:imageId/cover` |
| PropertyPricingScreen | `/properties/:id/pricing` | `PUT /rooms/:roomId/prices` |
| PropertyAmenitiesScreen | `/properties/:id/amenities` | `PUT /rooms/:id` (amenities field) |
| PropertyLocationScreen | `/properties/:id/location` | `PUT /properties/:id` (latitude, longitude, mapLink) |
| PropertyCancellationScreen | `/properties/:id/cancellation` | `PUT /rooms/:id` (cancellationPolicy) |
| PropertyRulesScreen | `/properties/:id/rules` | `PUT /properties/:id` |
| PropertyServicesScreen | `/properties/:id/services` | `PUT /properties/:id` |

---

### 11.5 Admin Flow

| Màn hình | Route | API Calls |
|----------|-------|-----------|
| AdminScreen | `/admin` | — (hub screen) |
| UserListScreen | `/admin/users` | `GET /users`, `DELETE /users/:id` |
| UserFormScreen (new) | `/admin/users/new` | `POST /users` |
| UserFormScreen (edit) | `/admin/users/:id/edit` | `GET /users/:id`, `PUT /users/:id` |
| OwnerCalendarScreen | `/admin/owner-calendar` | `GET /calendar/property-groups?ownerId=`, `GET /calendar/grid`, `POST /calendar/lock`, `POST /calendar/unlock` |

---

### 11.6 Profile & Settings Flow

| Màn hình | Route | API Calls |
|----------|-------|-----------|
| ProfileScreen | `/profile` | — (đọc local user state) |
| PersonalInfoScreen | `/profile/edit` | `PUT /users/:id` (name, email, gender, dateOfBirth) |
| ChangePasswordScreen | `/profile/change-password` | `POST /auth/change-password` |
| HelpScreen | `/profile/help` | — (static content) |
| NotificationScreen | `/notifications` | `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` |

---

## 12. Tổng kết endpoints

### ✅ Đã có (37 endpoints)

| # | Method | Endpoint | Màn hình chính |
|---|--------|----------|----------------|
| 1 | POST | `/auth/login` | LoginScreen |
| 2 | POST | `/auth/register` | RegisterScreen |
| 3 | POST | `/auth/google` | LoginScreen |
| 4 | POST | `/auth/refresh` | Auto (interceptor) |
| 5 | POST | `/auth/logout` | AccountScreen / ProfileScreen |
| 6 | POST | `/auth/forgot-password` | ForgotPasswordScreen |
| 7 | POST | `/auth/reset-password` | ForgotPasswordScreen |
| 8 | POST | `/auth/change-password` | ChangePasswordScreen |
| 9 | GET | `/users` | UserListScreen |
| 10 | GET | `/users/:id` | UserFormScreen (edit) |
| 11 | POST | `/users` | UserFormScreen (new) |
| 12 | PUT | `/users/:id` | UserFormScreen, PersonalInfoScreen |
| 13 | DELETE | `/users/:id` | UserListScreen |
| 14 | GET | `/properties` | PropertyManagementScreen |
| 15 | GET | `/properties/:id` | PropertyInfoScreen |
| 16 | POST | `/properties` | PropertyAddScreen |
| 17 | PUT | `/properties/:id` | PropertyInfo/Location/Rules/ServicesScreen |
| 18 | DELETE | `/properties/:id` | PropertyManagementScreen |
| 19 | GET | `/rooms` | RoomListScreen, DashboardScreen |
| 20 | GET | `/rooms/public` | CustomerHomeScreen, SearchRoomScreen |
| 21 | GET | `/rooms/:id` | RoomDetailScreen |
| 22 | POST | `/rooms` | PropertyManageScreen (thêm phòng) |
| 23 | PUT | `/rooms/:id` | RoomDetailScreen, PropertyAmenitiesScreen, PropertyCancellationScreen |
| 24 | DELETE | `/rooms/:id` | PropertyManageScreen, RoomListScreen |
| 25 | POST | `/rooms/:roomId/images` | PropertyImagesScreen |
| 26 | DELETE | `/rooms/:roomId/images/:imageId` | PropertyImagesScreen |
| 27 | PATCH | `/rooms/:roomId/images/:imageId/cover` | PropertyImagesScreen |
| 28 | PUT | `/rooms/:roomId/prices` | PropertyPricingScreen |
| 29 | GET | `/bookings` | BookingListScreen, DashboardScreen |
| 30 | POST | `/bookings/hold` | HoldRoomScreen |
| 31 | PATCH | `/bookings/:id/confirm` | BookingListScreen |
| 32 | PATCH | `/bookings/:id/cancel` | BookingListScreen |
| 33 | PUT | `/bookings/:id` | BookingListScreen (edit) |
| 34 | GET | `/bookings/calendar/:roomId` | RoomDetailScreen |
| 35 | POST | `/bookings/customer-hold` | SearchRoomScreen |
| 36 | GET | `/bookings/my` | MyBookingsScreen |
| 37 | PATCH | `/bookings/:id/customer-cancel` | MyBookingsScreen |

### ⚠️ Cần tạo mới (9 endpoints — App đang dùng mock data)

| # | Method | Endpoint | Màn hình | Ưu tiên |
|---|--------|----------|----------|---------|
| 38 | GET | `/calendar/property-groups` | BookingCalendarScreen, OwnerCalendarScreen | 🔴 CAO |
| 39 | GET | `/calendar/grid` | BookingCalendarScreen, OwnerCalendarScreen | 🔴 CAO |
| 40 | POST | `/calendar/lock` | OwnerCalendarScreen | 🔴 CAO |
| 41 | POST | `/calendar/unlock` | OwnerCalendarScreen | 🔴 CAO |
| 42 | GET | `/calendar/admin-contact` | BookingCalendarScreen | 🟡 TRUNG BÌNH |
| 43 | GET | `/notifications` | NotificationScreen | 🟡 TRUNG BÌNH |
| 44 | GET | `/notifications/unread-count` | AppScaffold (badge) | 🟡 TRUNG BÌNH |
| 45 | PATCH | `/notifications/:id/read` | NotificationScreen | 🟡 TRUNG BÌNH |
| 46 | PATCH | `/notifications/read-all` | NotificationScreen | 🟡 TRUNG BÌNH |

### ❌ Đã loại bỏ (so với API_SPECIFICATION cũ)

| Endpoint cũ | Lý do loại |
|-------------|------------|
| `GET /auth/profile` | App không gọi endpoint này — user data được lưu local sau login |
| `GET /dashboard/stats` | App tự tính từ `/rooms` + `/bookings` (dashboard_controller.dart) |
| `GET /reports` | App tự tính từ `/rooms` + `/bookings` (report_controller.dart) |

**Tổng: 46 endpoints (37 đã có + 9 cần tạo mới)**

---

## Auth Flow & Token

```
Login/Register → { accessToken (15min), refreshToken }
    ↓
Mỗi request → Header: Authorization: Bearer {accessToken}
    ↓
Khi 401 → POST /auth/refresh { refreshToken }
    ↓
Nhận accessToken mới → retry request tự động
    ↓
Nếu refresh cũng fail → logout, redirect /login
```

**Token Storage (FlutterSecureStorage):**
| Key | Nội dung |
|-----|----------|
| `access_token` | JWT access token |
| `refresh_token` | JWT refresh token |
| `user_data` | User JSON string |

**Timeout:** Connection 30s, Receive 30s
