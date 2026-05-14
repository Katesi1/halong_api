# Yêu cầu BE — Setup Demo Accounts cho Apple Review

> **Gửi**: BE team
> **Mục đích**: Tạo 3 demo account để Apple App Review test app trước khi
> approve lên App Store. Apple reviewer SẼ login và test full flow.
> **Deadline**: 1-2 ngày sau khi nhận request
> **Môi trường**: Production database (`api.halong24h.com`)

---

## ⚠️ QUAN TRỌNG

Apple reviewer login bằng credentials này → **toàn bộ flow phải hoạt động end-to-end**.
Nếu fail (login error, KYC không approved, không có data hiển thị, hoặc
property/booking trống) → Apple **reject app** → mất 7-14 ngày để fix + resubmit.

---

## 1. 3 demo accounts cần tạo

### 1.1 CUSTOMER (Khách đặt phòng)

```yaml
email:    apple-review-customer@halong24h.com
password: Halong24h@2026
role:     3 (CUSTOMER)
name:     Apple Reviewer Customer
phone:    0327000001
isActive: true
emailVerified: true
```

**Pre-condition**:
- Account active, có thể login + search property
- Không có booking pending (tab "My Bookings" trống ban đầu OK — reviewer sẽ tự book)

### 1.2 OWNER (Chủ homestay) — **QUAN TRỌNG NHẤT**

```yaml
email:    apple-review-owner@halong24h.com
password: Halong24h@2026
role:     1 (OWNER)
name:     Apple Reviewer Owner
phone:    0327000002
isActive: true
emailVerified: true

# KYC PRE-APPROVED (skip qua flow upload CCCD)
kycStatus: 'approved'
kycBypass: true   # hoặc kycStatus='approved' với fake submission đã approve

# SUBSCRIPTION TRIAL ACTIVE
subscriptionStatus: 'trial'
subscriptionPlanId: <ID của plan starter trong billing_plans>
subscriptionCycle: 'monthly'
trialEndsAt: <now + 30 ngày>   # cố ý kéo dài để reviewer có thời gian test
nextChargeAt: <now + 30 ngày>
```

**Pre-condition**:
- KYC đã approved → reviewer KHÔNG cần làm KYC
- Trial active → reviewer có thể tạo property + booking ngay
- 3 demo properties có sẵn (xem section 2)
- 5 demo bookings có sẵn (xem section 3)

### 1.3 SALE (Nhân viên của OWNER)

```yaml
email:    apple-review-sale@halong24h.com
password: Halong24h@2026
role:     2 (SALE)
name:     Apple Reviewer Sale
phone:    0327000003
ownerId:  <id của apple-review-owner@halong24h.com>
isActive: true
emailVerified: true
saleMembershipStatus: 'active'
```

**Pre-condition**:
- Linked với OWNER demo trên qua `ownerId`
- Membership status `active` → có thể quản lý booking/calendar
- Khi login, dashboard scope theo OWNER trên (thấy 3 properties + 5 bookings)

---

## 2. 3 demo properties (gắn với OWNER demo)

OWNER demo phải có sẵn 3 properties để reviewer test list/detail flow. Tạo
trong `properties` table với `owner_id = apple-review-owner.id`.

### Property 1: "Villa Hạ Long View Biển"

```yaml
name:           Villa Hạ Long View Biển
type:           0 (VILLA)
view:           sea
address:        Bãi Cháy, Hạ Long, Quảng Ninh
latitude:       20.9406
longitude:      107.0524
bedrooms:       3
bathrooms:      2
standardGuests: 6
maxGuests:      8
weekdayPrice:   3500000   # 3.5tr VND
weekendPrice:   4500000
holidayPrice:   5500000
adultSurcharge: 200000
childSurcharge: 100000
amenities:      ['wifi', 'pool', 'parking', 'kitchen', 'tv', 'aircon']
cancellationPolicy: 1 (MODERATE)
checkInTime:    "14:00"
checkOutTime:   "12:00"
description:    "Villa cao cấp với view biển 180°, hồ bơi riêng, phù hợp gia đình 6-8 người."
isActive:       true

images: 3-5 ảnh demo từ Unsplash (Cloudinary upload)
```

### Property 2: "Homestay Bãi Cháy Cozy"

```yaml
name:           Homestay Bãi Cháy Cozy
type:           1 (HOMESTAY)
view:           city
address:        Bãi Cháy, Hạ Long, Quảng Ninh
bedrooms:       2
bathrooms:      1
standardGuests: 4
maxGuests:      4
weekdayPrice:   1200000
weekendPrice:   1500000
holidayPrice:   2000000
amenities:      ['wifi', 'parking', 'kitchen', 'tv']
cancellationPolicy: 0 (FLEXIBLE)
description:    "Homestay ấm cúng cho gia đình nhỏ, gần biển, nhà hàng sẵn ngay dưới phố."
isActive:       true

images: 3-5 ảnh demo
```

### Property 3: "Hạ Long Bay Hotel - Studio"

```yaml
name:           Hạ Long Bay Hotel - Studio
type:           2 (HOTEL)
view:           sea
address:        Hùng Thắng, Hạ Long, Quảng Ninh
bedrooms:       1
bathrooms:      1
standardGuests: 2
maxGuests:      3
weekdayPrice:   2000000
weekendPrice:   2500000
holidayPrice:   3000000
amenities:      ['wifi', 'tv', 'aircon', 'minibar', 'breakfast']
cancellationPolicy: 2 (STRICT)
description:    "Phòng studio sang trọng view vịnh Hạ Long, bao gồm bữa sáng."
isActive:       true

images: 3-5 ảnh demo
```

---

## 3. 5 demo bookings

Mix các status để reviewer thấy đủ trạng thái:

| # | Property | Customer | Status | Check-in | Check-out | Notes |
|---|---|---|---|---|---|---|
| 1 | Villa Hạ Long View Biển | Walk-in (no account) | **HOLD** (24h) | +5 ngày | +7 ngày | Demo HOLD chờ thanh toán. customerName="Nguyễn Văn A", phone="0901111111" |
| 2 | Villa Hạ Long View Biển | Walk-in | **CONFIRMED** | +10 ngày | +12 ngày | Demo confirmed booking. customerName="Trần Thị B", phone="0902222222", deposit=2000000 |
| 3 | Homestay Bãi Cháy Cozy | Walk-in | **CONFIRMED** | +3 ngày | +4 ngày | customerName="Lê Văn C", phone="0903333333" |
| 4 | Hạ Long Bay Hotel | Walk-in | **COMPLETED** | -10 ngày | -8 ngày | Booking đã hoàn thành tuần trước. customerName="Phạm D", phone="0904444444". Allow CUSTOMER review |
| 5 | Villa Hạ Long View Biển | Walk-in | **CANCELLED** | -5 ngày | -3 ngày | Booking bị huỷ. customerName="Hoàng E" |

→ Khi OWNER (hoặc SALE) login + vào "Booking" → thấy 5 row với 4 status khác nhau.
→ Khi vào "Lịch" → thấy 3 properties với các ngày bị block theo bookings.

---

## 4. Demo notification (optional but recommended)

Tạo 5-10 notification trong `notifications` table cho OWNER demo:

```sql
INSERT INTO notifications (user_id, type, title, body, target_type, target_id, is_read, created_at)
VALUES
  ('<owner_id>', 'booking', 'Đặt phòng mới', 'Khách Nguyễn Văn A đặt Villa Hạ Long View Biển', 'booking', '<booking_1_id>', false, NOW() - INTERVAL '2 hours'),
  ('<owner_id>', 'booking', 'Booking xác nhận', 'Booking #2 đã được xác nhận', 'booking', '<booking_2_id>', false, NOW() - INTERVAL '1 day'),
  ('<owner_id>', 'system', 'Chào mừng đến Halong24h', 'KYC đã được duyệt, trial 30 ngày bắt đầu', 'system', null, true, NOW() - INTERVAL '7 days'),
  ('<owner_id>', 'payment', 'Thanh toán thành công', 'Đã nhận 2,000,000 VND', 'booking', '<booking_2_id>', true, NOW() - INTERVAL '1 day');
```

---

## 5. Verification checklist (BE tự test trước khi báo done)

Login mỗi account → kiểm tra:

### Customer demo
- [ ] Login thành công với `apple-review-customer@halong24h.com / Halong24h@2026`
- [ ] Vào `/home` thấy 3 demo properties
- [ ] Tap property → detail load OK với 3-5 ảnh
- [ ] Tap "Đặt phòng" → form load OK (thử submit fake booking, nếu được thì xoá đi)

### Owner demo
- [ ] Login thành công với `apple-review-owner@halong24h.com / Halong24h@2026`
- [ ] Dashboard load OK, KHÔNG có banner "Hoàn tất KYC" (vì đã approved)
- [ ] Banner "Trial còn X ngày" hiện (X >= 25 ngày)
- [ ] Vào "Phòng" → thấy 3 properties
- [ ] Vào "Booking" → thấy 5 bookings với status khác nhau
- [ ] Vào "Lịch" → thấy calendar với block days
- [ ] Vào "Quản lý nhân viên" → thấy 1 SALE đã accept
- [ ] Push notification: tạo 1 fake event để gửi push tới Owner device → reviewer test sau

### Sale demo
- [ ] Login thành công
- [ ] Dashboard scope theo Owner → thấy data của Owner
- [ ] Không thể truy cập `/properties/new` (FE chặn + BE 403)

---

## 6. Bonus — KYC submission record (nếu cần)

Để Owner demo hoàn chỉnh, BE có thể tạo fake `kyc_submissions` record:

```sql
INSERT INTO kyc_submissions (id, user_id, status, approved_at, approved_by_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  '<owner_demo_id>',
  'approved',
  NOW() - INTERVAL '7 days',
  '<admin_id>',  -- bất kỳ admin id nào
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '7 days'
);
```

Hoặc đơn giản hơn: set `users.kycBypass = true` cho Owner demo → skip toàn bộ KYC flow.

---

## 7. Cleanup script (sau khi app live và Apple Review xong)

Sau khi app pass review + live trên App Store, có thể xoá hoặc disable demo
accounts để tránh người dùng thật login nhầm:

```sql
-- Soft-disable (recommend)
UPDATE users SET is_active = false WHERE email LIKE 'apple-review-%@halong24h.com';

-- Hoặc hard-delete (cẩn thận, có cascade)
-- DELETE FROM users WHERE email LIKE 'apple-review-%@halong24h.com';
```

⚠️ KHÔNG xoá ngay lập tức sau submit — Apple có thể yêu cầu re-test sau khi
update. Giữ ít nhất 30 ngày sau khi app live.

---

## 8. BE confirm done

Khi xong, BE reply:

```
✅ Demo accounts created:
  - apple-review-customer@halong24h.com (CUSTOMER, active)
  - apple-review-owner@halong24h.com (OWNER, KYC approved, trial 30d, 3 properties + 5 bookings)
  - apple-review-sale@halong24h.com (SALE, linked with Owner)

Tested on https://api.halong24h.com — all login + flow working.
```

→ Bạn báo lại tôi sau khi BE confirm để qua **Bước 2: Test trên iPhone thật**.

---

## Liên hệ thắc mắc

Nếu BE có thắc mắc về spec, format data, hoặc business rule → tham khảo
[API.md](API.md) + [APP_SPEC.md](APP_SPEC.md) trong cùng repo, hoặc liên hệ
FE team.

Cảm ơn BE!
