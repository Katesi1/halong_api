# Halong24h — Đặc tả sản phẩm cho Product Manager

> Tài liệu mô tả toàn bộ sản phẩm Halong24h từ góc nhìn Product Manager.
> Bao gồm: mô hình kinh doanh, vai trò người dùng, quyền hạn, vòng đời nghiệp vụ,
> điều kiện sử dụng, các flow chính, ràng buộc business, KPI, và lộ trình mở rộng.
>
> **Phiên bản**: 1.2 — 2026-06-05 · **Đối tượng đọc**: PM, BA, Founder, Sales lead, CS Manager
>
> **v1.1 changelog**: loại bỏ VNPay, Apple IAP, Housekeeping, §2.4 doanh thu phụ
> **v1.2 changelog**: thêm module Uploads cho chat attachment (xem §26.5)

---

## Mục lục

**Phần I — Tổng quan**
1. [Giới thiệu sản phẩm](#1-giới-thiệu-sản-phẩm)
2. [Mô hình kinh doanh & doanh thu](#2-mô-hình-kinh-doanh--doanh-thu)
3. [Vai trò người dùng & ma trận quyền](#3-vai-trò-người-dùng--ma-trận-quyền)
4. [Vòng đời tài khoản & trạng thái](#4-vòng-đời-tài-khoản--trạng-thái)
5. [Kiến trúc hệ thống & UI](#5-kiến-trúc-hệ-thống--ui)

**Phần II — Module chi tiết**
6. [Module Auth — Đăng nhập & xác thực](#6-module-auth--đăng-nhập--xác-thực)
7. [Module Users — Quản lý tài khoản](#7-module-users--quản-lý-tài-khoản)
8. [Module KYC — Định danh chủ homestay](#8-module-kyc--định-danh-chủ-homestay)
9. [Module Properties — Quản lý cơ sở cho thuê](#9-module-properties--quản-lý-cơ-sở-cho-thuê)
10. [Module Calendar — Lịch trống & khoá ngày](#10-module-calendar--lịch-trống--khoá-ngày)
11. [Module Bookings — Đặt phòng & vòng đời](#11-module-bookings--đặt-phòng--vòng-đời)
12. [Module Payment — Thanh toán subscription](#12-module-payment--thanh-toán-subscription)
13. [Module Subscription — Gói dịch vụ chủ homestay](#13-module-subscription--gói-dịch-vụ-chủ-homestay)
14. [Module Staff Invite — Mời nhân viên SALE](#14-module-staff-invite--mời-nhân-viên-sale)
15. [Module Permissions — Phân quyền chi tiết](#15-module-permissions--phân-quyền-chi-tiết)
16. [Module Reviews — Đánh giá & moderation](#16-module-reviews--đánh-giá--moderation)
17. [Module Disputes — Khiếu nại](#17-module-disputes--khiếu-nại)
18. [Module Notifications — Thông báo](#18-module-notifications--thông-báo)
19. [Module Chat — Nhắn tin real-time](#19-module-chat--nhắn-tin-real-time)
20. [Module Leads — Khách hàng tiềm năng](#20-module-leads--khách-hàng-tiềm-năng)
21. [Module Audit Log — Nhật ký kiểm toán](#21-module-audit-log--nhật-ký-kiểm-toán)
22. [Module Dashboard — Báo cáo & KPI](#22-module-dashboard--báo-cáo--kpi)
23. [Module Partner API — Tích hợp đối tác](#23-module-partner-api--tích-hợp-đối-tác)
24. [Module App Version — Force update mobile](#24-module-app-version--force-update-mobile)
25. [Module Email & Admin Emails — Gửi email](#25-module-email--admin-emails--gửi-email)
26. [Module Devices — FCM push notification](#26-module-devices--fcm-push-notification)

**Phần III — Workflow end-to-end**
27. [Hành trình OWNER — Từ đăng ký đến vận hành](#27-hành-trình-owner--từ-đăng-ký-đến-vận-hành)
28. [Hành trình CUSTOMER — Tìm phòng đến review](#28-hành-trình-customer--tìm-phòng-đến-review)
29. [Hành trình SALE — Nhân viên hỗ trợ OWNER](#29-hành-trình-sale--nhân-viên-hỗ-trợ-owner)
30. [Hành trình ADMIN — Vận hành nền tảng hàng ngày](#30-hành-trình-admin--vận-hành-nền-tảng-hàng-ngày)

**Phần IV — Đo lường & phát triển**
31. [KPI & metrics đo lường](#31-kpi--metrics-đo-lường)
32. [Tích hợp bên ngoài](#32-tích-hợp-bên-ngoài)
33. [Lộ trình mở rộng (Roadmap)](#33-lộ-trình-mở-rộng-roadmap)
34. [Rủi ro & ràng buộc kỹ thuật](#34-rủi-ro--ràng-buộc-kỹ-thuật)

---

# PHẦN I — TỔNG QUAN

## 1. Giới thiệu sản phẩm

### 1.1 Tên & định vị

**Halong24h** là nền tảng SaaS quản lý cơ sở lưu trú cho thuê (homestay/villa/hotel) khu vực Hạ Long và mở rộng. Mô hình **B2B2C**:

- **B2B**: Chủ cơ sở (OWNER) trả phí gói hàng tháng/năm để dùng công cụ quản lý
- **B2C**: Khách hàng (CUSTOMER) tìm và đặt phòng qua website/app

### 1.2 Vấn đề sản phẩm giải quyết

| Vấn đề | Đối tượng | Halong24h giải quyết bằng |
|---|---|---|
| Chủ cơ sở quản lý booking thủ công, dễ trùng lịch | OWNER | Calendar realtime + hold 30 phút |
| Khách đặt phòng nhiều bước, không thấy lịch trống tổng | CUSTOMER | Public calendar + booking 24h hold |
| Chủ cơ sở không có công cụ kế toán/báo cáo | OWNER | Dashboard + reports doanh thu |
| Không có nơi giải quyết khiếu nại giữa chủ và khách | Cả 2 | Dispute module + admin xét xử |
| Đối tác OTA muốn tích hợp danh sách phòng | Partner | Partner API với X-Partner-Key |

### 1.3 Phạm vi sản phẩm hiện tại

**Đã có** (v1.3 hôm nay):
- ✅ Quản lý tài khoản đa vai trò (4 role)
- ✅ Định danh OWNER qua KYC (CCCD + selfie)
- ✅ CRUD cơ sở + ảnh + giá theo ngày thường/cuối tuần/lễ
- ✅ Calendar grid với lock/unlock + bulk
- ✅ Booking 4 trạng thái (HOLD → CONFIRMED → COMPLETED hoặc CANCELLED)
- ✅ Thanh toán subscription qua bank transfer (VietQR + auto reconcile)
- ✅ Admin có thể set giá custom cho từng OWNER
- ✅ Chat real-time qua WebSocket (giữa các bên trong booking)
- ✅ Review + admin moderation
- ✅ Khiếu nại với xét xử của admin
- ✅ Audit log mọi hành động quan trọng của admin
- ✅ Leads từ form public
- ✅ Mời nhân viên SALE qua email/short code
- ✅ FCM push notification + force update mobile

**Chưa có** (defer v2):
- ❌ Online chat với typing indicator multi-tab sync sender
- ❌ Tính lương SALE theo booking
- ❌ Tích hợp OTA inbound (Booking.com, Agoda) — hiện chỉ outbound qua Partner API
- ❌ Apple IAP / VNPay — loại bỏ khỏi phase hiện tại

---

## 2. Mô hình kinh doanh & doanh thu

### 2.1 Nguồn doanh thu chính

**Subscription từ OWNER** — Chủ cơ sở trả phí định kỳ để dùng platform:

| Gói | Số phòng tối đa | Đề xuất giá monthly | Đề xuất giá yearly (giảm 20%) |
|---|---|---|---|
| `rooms_1` | 1 phòng | 199K | 1.9M |
| `rooms_5` | 5 phòng | 499K | 4.8M |
| `rooms_10` | 10 phòng | 899K | 8.6M |
| `rooms_20` | 20 phòng | 1.5M | 14.4M |
| `rooms_50` | 50 phòng | 2.9M | 27.9M |
| `enterprise` | Không giới hạn | Thỏa thuận | Thỏa thuận |

> **Giá cụ thể đặt trong DB qua `BillingPlan` model**. Admin có thể chỉnh giá plan, hoặc override giá riêng cho từng OWNER (xem §13).

### 2.2 Cơ chế thu phí

- **Trial 7 ngày** sau khi ADMIN duyệt KYC → OWNER dùng thử miễn phí
- **Bank transfer (VietQR)** — duy nhất ở phase hiện tại. OWNER quét QR hoặc copy STK chuyển khoản; BE tự nhận diện giao dịch qua webhook bank (Sepay/Casso) và activate subscription
- **Manual mark-paid** — ADMIN ghi nhận thủ công khi khách chuyển tiền ngoài flow (vd: chuyển nhầm STK, hoặc deal trực tiếp)

> Các phương thức **VNPay** và **Apple IAP** đã được loại bỏ ở phase hiện tại để giảm complexity. Có thể bật lại ở phase sau khi nhu cầu thực sự xuất hiện.

### 2.3 Pricing override

ADMIN có thể **set giá custom cho từng OWNER** (vd: deal đặc biệt giảm 50% cho đối tác chiến lược, hoặc tăng 30% cho OWNER có nhiều phòng). Khi user thanh toán, BE dùng giá override thay vì giá plan.

`priceOverride = null` → quay về giá plan. `priceOverride = 0` → miễn phí. `priceOverride = 500000` → 500K/kỳ.

---

## 3. Vai trò người dùng & ma trận quyền

### 3.1 Bốn vai trò chính

| Code | Tên | Mô tả | Cách tạo |
|---|---|---|---|
| **0** | ADMIN | Quản trị viên nền tảng | Seed trong DB / chỉ định nội bộ |
| **1** | OWNER | Chủ cơ sở cho thuê | Tự đăng ký (web/app) |
| **2** | SALE | Nhân viên của OWNER | OWNER mời qua email/short code, ADMIN cũng có thể tạo |
| **3** | CUSTOMER | Khách thuê phòng | Tự đăng ký (app/web) |

### 3.2 Ma trận quyền tổng quan

✅ = được phép · ❌ = không · 🔒 = có giới hạn (xem ghi chú)

| Tính năng | ADMIN | OWNER | SALE | CUSTOMER |
|---|:---:|:---:|:---:|:---:|
| **Auth** | | | | |
| Đăng ký mới | ❌ | ✅ | ❌¹ | ✅ |
| Đăng nhập | ✅ | ✅ | ✅ | ✅ |
| Đổi mật khẩu / profile | ✅ | ✅ | ✅ | ✅ |
| Self-delete | ✅ | ✅ | ✅ | ✅ |
| **Users** | | | | |
| Xem list user toàn hệ | ✅ | ❌ | ❌ | ❌ |
| Xem nhân viên trong team | ✅ | ✅ (team mình) | ❌ | ❌ |
| Tạo user thủ công | ✅ | ❌ | ❌ | ❌ |
| Ban/unban user | ✅ | ❌ | ❌ | ❌ |
| Reset password user khác | ✅ | ❌ | ❌ | ❌ |
| Đổi role user | ✅ | ❌ | ❌ | ❌ |
| Cấp/thu hồi KYC bypass | ✅ | ❌ | ❌ | ❌ |
| **KYC** | | | | |
| Upload CCCD/selfie | ❌² | ✅ | ❌ | ❌ |
| Xem trạng thái KYC | ✅ | ✅ (của mình) | ❌ | ❌ |
| Duyệt/từ chối KYC | ✅ | ❌ | ❌ | ❌ |
| **Properties** | | | | |
| Tìm property public | ✅ | ✅ | ✅ | ✅ |
| Tạo property | ✅ | ✅³ | ✅🔒 | ❌ |
| Sửa property | ✅ | ✅ (của mình) | ✅🔒 (của team) | ❌ |
| Xoá property | ✅ | ✅ (của mình) | ❌ | ❌ |
| Duyệt/từ chối/tạm ngưng property | ✅ | ❌ | ❌ | ❌ |
| Upload ảnh | ✅ | ✅ | ✅🔒 | ❌ |
| **Calendar** | | | | |
| Xem master calendar (public) | ✅ | ✅ | ✅ | ✅ |
| Xem managed calendar (có note khách) | ✅ | ✅ | ✅ | ❌ |
| Lock/unlock ngày | ✅ | ✅ | ✅🔒 | ❌ |
| Bulk lock 100 ngày | ✅ | ✅ | ✅🔒 | ❌ |
| **Bookings** | | | | |
| Tạo HOLD 30 phút (staff) | ✅ | ✅ | ✅🔒 | ❌ |
| Tạo HOLD 24 giờ (customer) | ✅ | ✅ | ✅ | ✅ |
| Xác nhận booking | ✅ | ✅ | ✅🔒 | ❌ |
| Ghi nhận thanh toán | ✅ | ✅ | ✅🔒 | ❌ |
| Huỷ booking | ✅ | ✅ | ✅🔒 | 🔒⁴ |
| Xem booking của mình | ✅ | ✅ | ✅ | ✅ |
| **Reviews** | | | | |
| Tạo review | ❌ | ❌ | ❌ | ✅⁵ |
| Xem reviews public | ✅ | ✅ | ✅ | ✅ |
| Reply review (owner reply) | ✅ | ✅🔒 | ❌ | ❌ |
| Ẩn/khôi phục review | ✅ | ❌ | ❌ | ❌ |
| **Payment & Subscription** | | | | |
| Tạo payment session (mua gói) | ❌ | ✅ | ❌ | ❌ |
| Xem gói của mình | ✅ | ✅ | ✅ (gói của owner) | ❌ |
| Set giá custom cho OWNER | ✅ | ❌ | ❌ | ❌ |
| Mark-paid thủ công | ✅ | ❌ | ❌ | ❌ |
| Freeze/unfreeze | ✅ | ❌ | ❌ | ❌ |
| Grant/revoke trial | ✅ | ❌ | ❌ | ❌ |
| **Staff Invite** | | | | |
| Tạo invite | ✅ (thay mặt) | ✅ | ❌ | ❌ |
| Accept invite | ❌ | ❌ | (người nhận invite) | ❌ |
| Huỷ invite | ✅ | ✅ (của mình) | ❌ | ❌ |
| **Chat** | | | | |
| Tạo conversation về booking | ✅ | ✅ | ✅🔒 | ✅ |
| Gửi tin nhắn | ✅ | ✅ | ✅ | ✅ |
| Sửa tin (15 phút) | ✅ | ✅ (tin của mình) | ✅ (tin của mình) | ✅ (tin của mình) |
| Xoá tin | ✅ | ✅ (tin của mình) | ✅ (tin của mình) | ✅ (tin của mình) |
| **Disputes** | | | | |
| Mở dispute | ✅ | ✅🔒 | ✅🔒 | ✅🔒 |
| Investigate/resolve/reject | ✅ | ❌ | ❌ | ❌ |
| **Leads** | | | | |
| Submit form public | ✅ | ✅ | ✅ | ✅ |
| Xem leads | ✅ (tất cả) | ✅ (của mình) | ✅ (của team) | ❌ |
| Update lead status | ✅ | ✅ (của mình) | ✅ (của team) | ❌ |
| **Audit Log** | | | | |
| Xem audit log | ✅ | ❌ | ❌ | ❌ |
| **Admin Emails** | | | | |
| Xem template list | ✅ | ❌ | ❌ | ❌ |
| Test send email | ✅ | ❌ | ❌ | ❌ |

**Ghi chú**:
- ¹ SALE không tự đăng ký được — chỉ được tạo qua flow accept invite
- ² ADMIN không tự upload KYC vì không cần thiết
- ³ OWNER tạo property → moderation status `pending`, chưa public
- ⁴ CUSTOMER chỉ huỷ được booking đang ở trạng thái HOLD của mình
- ⁵ CUSTOMER chỉ review được booking đã COMPLETED của mình, và chưa review trước đó
- 🔒 SALE cần quyền tương ứng trong UserPermission table (xem §15)

### 3.3 Quan hệ giữa các role

```
ADMIN ──quản lý──→ tất cả user, property, booking, dispute, audit
   │
   └──duyệt KYC──→ OWNER ──tạo──→ Property ──được đặt──→ CUSTOMER
                      │
                      └──mời──→ SALE (thuộc team OWNER, có ownerId)
```

- **OWNER độc lập**: mỗi OWNER là 1 tenant. Property/Booking/SALE của OWNER A không liên quan tới OWNER B
- **SALE phụ thuộc OWNER**: SALE có `ownerId` chỉ về OWNER chủ. Khi OWNER xoá SALE → SALE không còn quyền truy cập
- **ADMIN trên tất cả**: ADMIN có thể can thiệp mọi tenant để moderate

---

## 4. Vòng đời tài khoản & trạng thái

### 4.1 Vòng đời tài khoản OWNER

```
[Đăng ký] → [Chưa KYC] → [Upload CCCD/Selfie] → [Pending duyệt KYC]
                                                       ↓
                       [Rejected] ←────── [ADMIN từ chối]
                            │
                            └─[Resubmit]→ [Pending duyệt KYC]

                       [Approved KYC] ←── [ADMIN duyệt]
                            ↓
                       [Trial 7 ngày] ──hết hạn──→ [Past Due]
                            ↓
                     [Mua gói thành công]
                            ↓
                       [Active] ←──renew──→ [Active]
                            ↓               (cron auto)
                       [Past Due]
                            ↓
                  [Admin freeze]→ [Frozen] ←admin unfreeze
                            ↓
                  [Admin ban]→ [Banned] (isActive=false)
                            ↓
                  [Admin/Self delete]→ [Deleted] (soft, có thể re-register)
```

**Trạng thái subscription** (lưu ở `User.subscriptionStatus`):

| Trạng thái | Mô tả | Có thể làm gì |
|---|---|---|
| `none` | Chưa có gói, chưa trial | Mua gói, hoặc admin grant trial |
| `trial` | Đang trial | Dùng đầy đủ, hết hạn → past_due |
| `active` | Đã trả phí, đang hoạt động | Dùng đầy đủ |
| `past_due` | Đã hết hạn, chưa renew | Bị giới hạn (block tạo property mới, mời staff) |
| `frozen` | Admin tạm khoá | Hoàn toàn block thao tác |
| `cancelled` | User huỷ tự nguyện | Như past_due |
| `expired` | Hết hạn dài, đã grace period | Như past_due |

### 4.2 Vòng đời CUSTOMER

```
[Đăng ký] → [Active] ──tự xoá / admin ban──→ [Deleted/Banned]
```

CUSTOMER không cần KYC, không có subscription. Tự xoá theo GDPR (xoá xong giải phóng email/phone unique → có thể re-register).

### 4.3 Vòng đời SALE

```
[OWNER tạo invite] → [Email gửi short code HL-XXXXXX]
                              ↓
                     [SALE click link → verify]
                              ↓
                     [Accept với Google hoặc password]
                              ↓
                     [Tạo SALE account, ownerId = OWNER]
                              ↓
                     [Active SALE, làm việc trong team]
                              ↓
                  [OWNER gỡ khỏi team]
                              ↓
                  [SALE isActive=false, refreshToken bị xoá]
                  → SALE bị buộc logout, account còn nhưng không thuộc team
```

SALE chỉ thuộc 1 OWNER tại 1 thời điểm. Nếu OWNER A gỡ SALE → SALE có thể được OWNER B mời lại (nếu accept).

### 4.4 Vòng đời Booking

```
[CUSTOMER hold 24h] hoặc [OWNER/SALE hold 30 phút]
         ↓                          ↓
       HOLD (status=0)
         ↓ (hold hết hạn → auto cancel)
         ↓ (admin/owner confirm)
    CONFIRMED (status=1)
         ↓ (admin/owner mark-paid)
    CONFIRMED + paidAt set
         ↓ (khách check-in, check-out)
    COMPLETED (status=3) ← cron set khi qua ngày checkoutDate
         ↓
   CUSTOMER có thể tạo review
```

Tại bất kỳ trạng thái nào trước COMPLETED, có thể bị **CANCELLED** (status=2) bởi customer (chỉ HOLD) hoặc admin/owner/sale.

### 4.5 Vòng đời Property

```
[OWNER tạo] → moderationStatus=pending, isActive=false
       ↓
[ADMIN duyệt]→ moderationStatus=approved, isActive=true ─→ Public
       ↓
[ADMIN reject]→ moderationStatus=rejected, isActive=false
       ↓
[OWNER edit & gửi lại]→ moderationStatus=pending (auto)
       ↓
[ADMIN duyệt]→ approved
       ↓
[Admin suspend]→ moderationStatus=suspended, isActive=false
       ↓
[Admin unfreeze hoặc owner edit]→ pending → duyệt lại

[Admin/Owner xoá]→ deletedAt set (soft delete, không hard delete)
```

**Phân biệt rejected vs suspended**:
- `rejected` — chưa từng hoạt động (lần đầu admin từ chối)
- `suspended` — đã từng hoạt động, admin tạm ngưng vì vi phạm

---

## 5. Kiến trúc hệ thống & UI

### 5.1 Backend

- **Framework**: NestJS 11 (Node.js, TypeScript)
- **Database**: PostgreSQL + Prisma ORM
- **Cache/Hold**: Redis
- **Auth**: JWT (access 15 phút, refresh 7 ngày)
- **Real-time**: Socket.IO
- **Upload**: Cloudinary
- **Push**: Firebase Cloud Messaging (FCM)
- **Email**: SMTP (nodemailer)
- **Payment**: Bank transfer (VietQR) + Sepay/Casso webhook auto-reconcile

### 5.2 Frontend (3 UI)

| UI | Stack | Người dùng | Mục đích |
|---|---|---|---|
| **Web Admin** | Next.js 15 | ADMIN | Quản trị nền tảng (duyệt KYC, property; moderation; báo cáo) |
| **Web Host** | Next.js 15 | OWNER, SALE | Quản lý cơ sở, booking, calendar, team |
| **App Mobile** | Android (Kotlin), iOS (Swift) | CUSTOMER + OWNER/SALE | Đặt phòng, xem thông báo, KYC, chat |

### 5.3 Tích hợp ngoài

| Service | Mục đích |
|---|---|
| Cloudinary | Upload ảnh property + KYC + chat attachment |
| Firebase | FCM push notification |
| Sepay/Casso | Bank webhook reconcile (auto detect chuyển khoản) |
| Google OAuth | Sign-In with Google |
| Sign In with Apple | OAuth iOS (login only — không phải IAP) |
| SMTP (Gmail/SendGrid) | Email transactional |

---

# PHẦN II — MÔ TẢ MODULE CHI TIẾT

> Mỗi module dưới đây trình bày theo cấu trúc:
> 1. **Mục đích nghiệp vụ**
> 2. **Vai trò liên quan**
> 3. **Điều kiện tiên quyết**
> 4. **Flow chính (step by step)**
> 5. **Business rule & ràng buộc**
> 6. **Trạng thái & chuyển trạng thái**
> 7. **Thông báo gửi cho ai**
> 8. **Audit & compliance**
> 9. **Edge cases**
> 10. **KPI đo lường**

---

## 6. Module Auth — Đăng nhập & xác thực

### 6.1 Mục đích nghiệp vụ

Tất cả tính năng đều cần xác thực user. Module Auth chịu trách nhiệm:
- Đăng ký tài khoản mới (chỉ OWNER/CUSTOMER tự đăng ký được)
- Đăng nhập bằng nhiều phương thức
- Bảo vệ session bằng JWT
- Tự refresh token để user không phải đăng nhập lại

### 6.2 Vai trò liên quan

- **Public** (chưa đăng nhập): register, login, forgot password
- **Tất cả role đã đăng nhập**: logout, change password, xem profile

### 6.3 Điều kiện tiên quyết

- **Đăng ký**: email/phone chưa được sử dụng, password ≥ 6 ký tự
- **Anti-spam**: 1 thiết bị (`User-Agent + IP`) không được tạo quá 3 tài khoản trong 24 giờ
- **Rate limit**: register 5/giờ/IP, login 10/15phút/IP, Google/Apple 10/giờ/IP, forgot 5/giờ/IP

### 6.4 Phương thức đăng nhập

| Phương thức | Mô tả | Web | iOS | Android |
|---|---|:---:|:---:|:---:|
| Email + password | Cổ điển | ✅ | ✅ | ✅ |
| Phone + password | SĐT 10 số bắt đầu 0 | ✅ | ✅ | ✅ |
| Google Sign-In | Login với Google account | ✅ | ✅ | ✅ |
| Apple Sign-In | Login với Apple ID (bắt buộc trên iOS theo policy Apple) | ⚠️ | ✅ | ❌ |

### 6.5 Flow chính

**Đăng ký mới**:
1. User mở app/web → "Đăng ký"
2. Nhập name, email, password, chọn role (OWNER hoặc CUSTOMER), optional phone
3. BE check email/phone unique → tạo user → trả về `{ accessToken, refreshToken, user }`
4. Auto-login luôn (không cần verify email lần đầu)
5. Nếu user chọn role=OWNER → next step là KYC

**Đăng nhập**:
1. User nhập `identifier` (email hoặc phone) + password
2. BE verify → trả tokens
3. App lưu token vào EncryptedSharedPreferences (Android) / Keychain (iOS) / httpOnly cookie (web)

**Refresh token (tự động)**:
- Khi access token hết hạn (15 phút) → API trả 401
- App interceptor tự gọi `POST /auth/refresh { refreshToken }` → nhận tokens mới
- Retry request gốc với token mới
- Nếu refresh cũng fail → đăng xuất, navigate về login

**Quên mật khẩu**:
1. User nhập email hoặc phone → BE gửi link/OTP qua SMTP/SMS
2. User click link → nhập mật khẩu mới
3. BE verify token + update password
4. User đăng nhập lại với mật khẩu mới

### 6.6 Business rules

- **Chỉ tạo được role OWNER hoặc CUSTOMER** từ register. ADMIN/SALE không tự đăng ký
- **Email/phone unique** trên toàn hệ thống (sau khi xoá tài khoản, BE rename `email = deleted-<timestamp>-<email>` để giải phóng)
- **Google sign-in user mới** bắt buộc truyền `role`. Đã có account thì bỏ qua
- **Apple sign-in** lần đầu Apple trả email/name; lần sau chỉ trả `sub`. BE phải lưu email lần đầu
- **Reset password token** dùng JWT_RESET_SECRET riêng (không trùng JWT_SECRET access token) để tránh dùng access token làm reset

### 6.7 Thông báo

- Không có notification (đây là module foundational)
- Nhưng có email gửi cho user khi `forgot-password`

### 6.8 Audit & compliance

- Không log audit hành động login/register (sẽ quá lớn)
- Có log error ở BE khi credential bị stuffing (rate limit hit)

### 6.9 Edge cases

- User Google account mà email chưa verified → reject (Google trả `email_verified: false`)
- User Apple account ẩn email (`@privaterelay.appleid.com`) → BE chấp nhận
- User đã ban → login fail với message "Tài khoản đã bị vô hiệu hoá"
- User đang trong trial mà tài khoản đã `deletedAt` → cũng fail

### 6.10 KPI đo lường

- **Tỉ lệ chuyển đổi đăng ký → KYC submit** (OWNER funnel)
- **Tỉ lệ login Google/Apple vs email** (user prefer phương thức nào)
- **Số lần refresh token thất bại** (chỉ báo session security)
- **Rate limit hit rate** (chỉ báo có bot tấn công không)

---

## 7. Module Users — Quản lý tài khoản

### 7.1 Mục đích nghiệp vụ

Sau khi user đã đăng ký, module Users cho phép:
- Self-service: sửa profile, đổi avatar, tự xoá account
- OWNER: quản lý team SALE
- ADMIN: quản trị toàn bộ user trên platform

### 7.2 Vai trò liên quan

| Hành động | ADMIN | OWNER | SALE | CUSTOMER |
|---|:---:|:---:|:---:|:---:|
| Xem profile của mình | ✅ | ✅ | ✅ | ✅ |
| Sửa profile của mình | ✅ | ✅ | ✅ | ✅ |
| Tự xoá tài khoản (GDPR) | ✅ | ✅ | ✅ | ✅ |
| Đổi mật khẩu | ✅ | ✅ | ✅ | ✅ |
| Xem list user toàn hệ | ✅ | ❌ | ❌ | ❌ |
| Xem nhân viên SALE trong team | ✅ | ✅ | ❌ | ❌ |
| Tạo user thủ công | ✅ | ❌ | ❌ | ❌ |
| Sửa user khác | ✅ | ❌ | ❌ | ❌ |
| Xoá user khác | ✅ | ❌ (chỉ gỡ team) | ❌ | ❌ |
| Ban/unban user | ✅ | ❌ | ❌ | ❌ |
| Revoke all sessions | ✅ | ❌ | ❌ | ❌ |
| Reset password user khác | ✅ | ❌ | ❌ | ❌ |
| Đổi role user | ✅ | ❌ | ❌ | ❌ |
| Bật/tắt KYC bypass | ✅ | ❌ | ❌ | ❌ |

### 7.3 Profile user

Mỗi user lưu các field cá nhân + meta:
- `name, email, phone, avatar`
- `gender (0=Nam, 1=Nữ, 2=Khác), dateOfBirth`
- `role, ownerId (cho SALE)`
- `isActive (true=hoạt động, false=ban/disabled)`
- `bannedAt, bannedReason, bannedBy` (lịch sử ban)
- `emailVerified`
- `kycStatus, kycBypass` (chi tiết §8)
- `subscriptionStatus, subscriptionPlanId, ...` (chi tiết §13)

### 7.4 Flow ADMIN actions

**Ban user**:
1. ADMIN mở user detail → click "Ban"
2. Nhập lý do (bắt buộc ≥ 5 ký tự)
3. BE set `isActive=false`, lưu `bannedAt, bannedReason, bannedBy=adminId`, xoá refreshToken
4. User bị buộc logout (access token còn 15 phút, hết hạn → 401 → refresh fail → logout)
5. **Audit log** ghi `user.ban`

**Unban user**:
1. ADMIN click "Unban"
2. BE set `isActive=true`, clear `bannedAt/Reason/By`
3. User có thể login lại
4. **Audit log** ghi `user.unban`

**Revoke all sessions**:
1. ADMIN click "Buộc logout"
2. BE xoá refreshToken + tất cả FCM device tokens
3. User bị logout trên mọi thiết bị
4. **Audit log** ghi `user.revoke_sessions`

**Reset password**:
1. ADMIN nhập password mới (optional, BE auto-generate nếu để trống)
2. BE hash + update + xoá refresh token + complexity check
3. Nếu auto-generate → BE trả `data.tempPassword` cho admin xem 1 lần
4. ADMIN gửi password tạm cho user qua kênh ngoài (Zalo, gọi điện)
5. **Audit log** ghi `user.reset_password`

**Đổi role**:
1. ADMIN chọn role mới (0/1/2/3)
2. BE update + auto clear `ownerId` nếu role không phải SALE
3. **Audit log** ghi `user.change_role` với `metadata: { oldRole, newRole }`

**KYC bypass**:
1. ADMIN bật cho OWNER đặc biệt (đối tác chiến lược không cần KYC)
2. BE set `kycBypass=true`
3. OWNER có thể tạo property mà không cần KYC approved
4. **Audit log** ghi `user.kyc_bypass_toggle`

### 7.5 Self-delete (GDPR/Apple/Google compliance)

1. User mở settings → "Xoá tài khoản"
2. Nhập lý do (optional)
3. BE:
   - Set `deletedAt = now`
   - Rename `email = deleted-<ts>-<email>` để giải phóng unique
   - Tương tự phone, googleSub, appleSub
   - Xoá refreshToken + tất cả devices
4. User có thể đăng ký lại với cùng email/phone ngay

### 7.6 Quản lý team OWNER ↔ SALE

OWNER có 2 cách thêm SALE vào team:

**Cách 1: SALE đã có account (CUSTOMER muốn chuyển sang SALE)**:
- `POST /users/my-staff { email }` → BE đổi role thành SALE + set `ownerId`

**Cách 2: SALE chưa có account (mời mới)**:
- OWNER dùng module Staff Invite (§14)

OWNER có thể gỡ SALE:
- `DELETE /users/my-staff/:id`
- BE set `isActive=false`, clear ownerId, xoá refresh token
- SALE nhận notification "Bạn đã bị gỡ khỏi đội"

### 7.7 Business rules

- Không thể tự ban/unban/đổi role/xoá chính mình (`adminId !== userId`)
- Password reset có complexity: ≥ 8 ký tự, ≥ 1 chữ + ≥ 1 số
- Self-delete soft delete, KHÔNG hard delete để giữ audit/booking history
- Đổi role CUSTOMER → OWNER không tự cấp KYC bypass; OWNER mới phải submit KYC riêng

### 7.8 KPI

- **Tổng user theo role** (admin xem dashboard)
- **Số user bị ban / tháng** (signal moderation activity)
- **Self-delete rate** (signal churn)
- **Số SALE/OWNER trung bình** (team size insight)

---

## 8. Module KYC — Định danh chủ homestay

### 8.1 Mục đích nghiệp vụ

OWNER phải định danh trước khi được tạo cơ sở để cho thuê. Lý do:
- Tuân thủ pháp luật (Nghị định lưu trú VN)
- Tránh fake OWNER scam khách
- Có dữ liệu để xử lý dispute nếu có vấn đề pháp lý

KYC = **K**now **Y**our **C**ustomer (định danh khách hàng).

### 8.2 Vai trò liên quan

- **OWNER**: upload CCCD + selfie, xem trạng thái, resubmit nếu bị reject
- **ADMIN**: duyệt/từ chối hồ sơ
- **CUSTOMER, SALE**: không cần KYC

### 8.3 Điều kiện tiên quyết

- User đã đăng ký với role=OWNER
- Có ảnh CCCD rõ nét (mặt trước + mặt sau)
- Có ảnh selfie cùng CCCD (chứng minh người trong CCCD là user)

### 8.4 4 trạng thái KYC

| Status | Mô tả | OWNER làm được gì |
|---|---|---|
| `none` | Chưa submit | Không tạo property được |
| `pending` | Đã submit, chờ admin | Không tạo property được, đợi |
| `approved` | Admin duyệt | Tạo property được, được trial 7 ngày |
| `rejected` | Admin từ chối | Resubmit ảnh bị lỗi |

### 8.5 Flow nghiệp vụ

**OWNER upload KYC**:
1. OWNER chọn ảnh CCCD mặt trước → app/web tự crop, OCR client-side (optional)
2. `POST /kyc/upload-cccd-front` multipart: image + ocrResult (JSON optional)
3. BE upload lên Cloudinary, lưu URL + OCR result vào `KycUpload` table
4. Tương tự CCCD mặt sau + selfie

**OWNER submit**:
1. Đủ 3 ảnh → click "Gửi xác minh"
2. `POST /kyc/submit` → BE set `kycStatus=pending`, tạo `KycSubmission` row
3. ADMIN nhận notification "Có hồ sơ KYC chờ duyệt"

**ADMIN duyệt**:
1. ADMIN xem queue `GET /admin/kyc/queue`
2. Mở detail → xem 3 ảnh
3. Optional: dùng dịch vụ AI face match (FPT.AI / VNPT eKYC) để verify
4. Nếu OK → `POST /admin/kyc/submissions/:id/approve { trialDays: 7 }`
   - BE set `kycStatus=approved`
   - Grant trial 7 ngày (subscription)
   - Notify OWNER "KYC đã được duyệt, bạn có 7 ngày trial"
5. Nếu reject → `POST /admin/kyc/submissions/:id/reject { reason, items: ["cccdFront"] }`
   - BE set `kycStatus=rejected`
   - Notify OWNER "KYC bị từ chối: <reason>. Vui lòng upload lại: ảnh CCCD mặt trước"

**OWNER resubmit**:
1. Mở hồ sơ rejected
2. Upload lại ảnh bị flag
3. `POST /kyc/submissions/:id/resubmit { items: ["cccdFront"] }`
4. BE chuyển status về `pending`, notify admin

### 8.6 KYC bypass

ADMIN có thể cấp KYC bypass cho OWNER đặc biệt (đối tác chiến lược, deal trực tiếp):
- Set `kycBypass=true`
- OWNER có thể tạo property mà không cần submit KYC
- Vẫn cần subscription active (hoặc trial)

### 8.7 Business rules

- KYC chỉ áp dụng OWNER (CUSTOMER không cần)
- 1 OWNER chỉ có 1 KYC submission active. Resubmit reuse cùng row
- Ảnh tối đa 5MB, định dạng JPG/PNG/WEBP/HEIC
- ADMIN khi reject phải nêu lý do và chỉ rõ ảnh nào cần upload lại
- Khi ADMIN approve → tự động grant trial (`trialEndsAt = now + 7 days`)

### 8.8 Thông báo

- `kyc_approved` → OWNER (in-app + push)
- `kyc_rejected` → OWNER + lý do
- Admin có queue badge để biết có hồ sơ chờ

### 8.9 Audit

- `kyc.approve` — ai duyệt, trial bao nhiêu ngày
- `kyc.reject` — ai reject, lý do, ảnh nào bị flag
- `user.kyc_bypass_toggle` — ai bật/tắt bypass, cho user nào

### 8.10 Edge cases

- OCR không đọc được → BE vẫn lưu, admin tự đọc thủ công
- Face match score thấp → flag để admin review kỹ
- OWNER có nhiều property và bị thu hồi KYC (admin set bypass=false sau khi reject) → property cũ vẫn hoạt động, nhưng không tạo mới được

### 8.11 KPI

- **Tỉ lệ approve / reject** (chất lượng OCR / hướng dẫn user)
- **Thời gian trung bình từ submit đến duyệt** (SLA admin)
- **Tỉ lệ resubmit** (signal hướng dẫn upload chưa rõ)

---

## 9. Module Properties — Quản lý cơ sở cho thuê

### 9.1 Mục đích nghiệp vụ

Đơn vị tài sản chính trong hệ thống. Mỗi `Property` là 1 cơ sở lưu trú (villa/homestay/hotel) mà OWNER cho thuê.

CUSTOMER tìm property → xem chi tiết → đặt phòng. OWNER quản lý: tạo, sửa, set giá, upload ảnh, theo dõi booking.

### 9.2 Loại property

| Type | Mã | Mô tả |
|---|---|---|
| `0` | VILLA | Biệt thự, thuê nguyên căn |
| `1` | HOMESTAY | Homestay, có thể nguyên căn hoặc theo phòng |
| `2` | HOTEL | Khách sạn, nhiều phòng riêng biệt |

### 9.3 Thông tin lưu trên 1 Property

**Cơ bản**:
- `name` (tên hiển thị), `code` (mã unique do OWNER tự đặt, vd: "VL001")
- `type` (villa/homestay/hotel)
- `view` ("sea" hoặc "city" hoặc null)
- `address`, `latitude/longitude`, `mapLink` (Google Maps)

**Sức chứa**:
- `bedrooms`, `bathrooms` (số phòng ngủ, phòng tắm)
- `standardGuests` (số khách tiêu chuẩn — base price)
- `maxGuests` (số khách tối đa)

**Giá**:
- `weekdayPrice` (giá ngày thường)
- `weekendPrice` (giá cuối tuần — thứ 6, 7)
- `holidayPrice` (giá lễ tết — admin set sẵn list ngày lễ)
- `adultSurcharge`, `childSurcharge` (phụ thu khách vượt standard)

**Content marketing**:
- `amenities[]` (wifi, pool, parking, BBQ, ...)
- `cancellationPolicy` (0=flexible / 1=moderate / 2=strict)
- `rules` (nội quy)
- `services[]` (dịch vụ kèm: đưa đón sân bay, ăn sáng, ...)
- `description` (mô tả dài)

**Check-in/out**:
- `checkInTime` (default "14:00")
- `checkOutTime` (default "12:00")

**Ảnh**:
- Mảng `PropertyImage[]`, mỗi ảnh có URL Cloudinary, `isCover` (bool), `order` (int)

**Moderation**:
- `isActive` (true/false — toggle nhanh, vd: tạm khoá ngày nghỉ Tết)
- `moderationStatus` (`pending`/`approved`/`rejected`/`suspended`)
- `moderationRejectedReason`, `moderationReviewedAt`, `moderationReviewedBy`

### 9.4 Flow chính

**OWNER tạo cơ sở mới**:
1. OWNER mở "Tạo cơ sở" trên web host
2. Điền form đầy đủ → submit
3. BE tạo property với `moderationStatus=pending, isActive=false`
4. BE notify ADMIN có cơ sở chờ duyệt
5. OWNER thấy cơ sở trong list của mình (web host) nhưng KHÔNG hiển thị public
6. ADMIN duyệt → cơ sở public

**ADMIN moderation**:
- **Approve**: `POST /properties/:id/approve` → `moderationStatus=approved, isActive=true`
- **Reject**: `POST /properties/:id/reject { reason }` → `moderationStatus=rejected, isActive=false`. OWNER có thể edit và auto resubmit
- **Suspend**: `POST /properties/:id/suspend { reason? }` → `moderationStatus=suspended, isActive=false`. Áp dụng cho cơ sở đã từng approved nhưng vi phạm (review xấu, dispute nhiều)

**OWNER cập nhật**:
- `PATCH /properties/:id` — sửa bất kỳ field nào
- Nếu OWNER edit cơ sở đang `rejected` hoặc `suspended` → BE tự reset `moderationStatus=pending` + notify admin "Cơ sở cần duyệt lại"

**Upload ảnh**:
- `POST /properties/:id/images` multipart, field `images[]`, tối đa 20 file × 10MB
- BE upload Cloudinary, lưu URL + isCover của ảnh đầu tiên
- `PATCH /properties/:id/images/:imageId/cover` → đặt ảnh khác làm cover

**Set giá**:
- `PUT /properties/:id/prices { weekdayPrice, weekendPrice, holidayPrice, adultSurcharge, childSurcharge }` (PATCH partial)

**Customer tìm cơ sở (public)**:
- `GET /properties/public?checkinDate=&checkoutDate=&guests=&minPrice=&maxPrice=&type=&view=`
- BE filter:
  - `isActive=true, moderationStatus=approved`
  - Loại bỏ cơ sở đã được book/hold trong khoảng `checkinDate-checkoutDate`
  - `maxGuests >= guests`
  - Giá trong khoảng

### 9.5 Business rules

- OWNER chỉ thấy/sửa được cơ sở của mình
- SALE chỉ thấy/sửa được cơ sở của OWNER mình
- ADMIN thấy tất cả
- Code property unique toàn hệ thống (OWNER tự đặt, nếu trùng → 409 conflict)
- Khi OWNER tạo: `moderationStatus=pending`. Khi ADMIN tạo (thay mặt): `moderationStatus=approved`
- KYC tiên quyết: OWNER chưa approved KYC (và không có bypass) → không tạo được property
- Subscription tiên quyết: subscription `past_due/frozen` → không tạo/sửa property được

### 9.6 Thông báo

- `property_approved` → OWNER (push + in-app)
- `property_rejected` → OWNER + lý do
- `property_suspended` → OWNER + lý do
- `property_resubmitted` → ADMIN khi OWNER edit cơ sở rejected/suspended

### 9.7 Audit

- `property.approve` — ai duyệt, cơ sở nào
- `property.reject` — ai reject, lý do
- `property.suspend` — ai suspend, lý do

### 9.8 Edge cases

- OWNER xoá cơ sở có booking đang HOLD/CONFIRMED → cần đánh dấu các booking đó status=cancelled hoặc bỏ qua (hiện tại soft delete property, booking vẫn tồn tại)
- ADMIN suspend cơ sở → khách đã book CONFIRMED có thể vẫn check-in (BE không tự huỷ)
- Cơ sở có moderationStatus=pending lâu (admin quên duyệt) → OWNER bức xúc; cần SLA admin

### 9.9 KPI

- **Số cơ sở pending** (admin SLA)
- **Tỉ lệ approve/reject lần đầu** (chất lượng hướng dẫn upload)
- **Số cơ sở suspended/tháng** (signal moderation)
- **Top OWNER có nhiều cơ sở** (segment phân loại)

---

## 10. Module Calendar — Lịch trống & khoá ngày

### 10.1 Mục đích nghiệp vụ

Hiển thị tình trạng từng ngày của mỗi cơ sở. Quan trọng nhất với:
- **CUSTOMER**: xem ngày trống để chọn check-in/check-out
- **OWNER/SALE**: lên kế hoạch, không trùng lịch, khoá ngày để cá nhân nghỉ

### 10.2 4 trạng thái ngày

| Status | Mô tả | Khi nào |
|---|---|---|
| `available` | Trống, có thể book | Mặc định, không có booking/lock |
| `hold` | Đang giữ chỗ | Có booking HOLD (sale 30p hoặc customer 24h) |
| `booked` | Đã đặt (chính thức) | Có booking CONFIRMED hoặc CalendarLock status=BOOKED |
| `locked` | Bị OWNER khoá | CalendarLock status=LOCKED (chủ nhà tự nghỉ) |

### 10.3 Loại view

| View | Path | Auth | Mô tả |
|---|---|---|---|
| Master calendar | `GET /calendar/public-grid` | Public | Tất cả cơ sở public, ai cũng xem được (không kèm tên khách) |
| Managed calendar | `GET /calendar/grid` | Auth | OWNER/SALE xem cơ sở của mình, ADMIN xem tất cả. Có `note` (tên khách) |
| Property monthly | `GET /bookings/calendar/:propertyId` | Auth | Lịch 1 cơ sở theo tháng (dạng matrix 6 tuần × 7 ngày) |

### 10.4 Flow chính

**OWNER xem lịch quản lý**:
1. `GET /calendar/grid?startDate=2026-06-01&endDate=2026-06-30&propertyIds=uuid1,uuid2`
2. BE trả:
```json
{
  "properties": [
    {
      "id": "uuid1", "name": "Villa A", "type": 0,
      "days": [
        { "date": "2026-06-01", "status": "available", "note": null, "bookingId": null },
        { "date": "2026-06-02", "status": "hold", "note": "Nguyễn Văn A", "bookingId": "..." },
        { "date": "2026-06-03", "status": "booked", "note": "Trần Thị B", "bookingId": "..." }
      ]
    }
  ]
}
```

**OWNER khoá ngày**:
- `POST /calendar/lock { propertyId, date }` → BE tạo CalendarLock row
- Ngày đó không thể book được nữa
- Nếu đã có booking HOLD/CONFIRMED → reject với lỗi "Ngày này đã có booking"

**OWNER mở khoá**:
- `DELETE /calendar/lock { propertyId, date }` → BE xoá CalendarLock row

**OWNER đánh dấu đã bán (sold)**:
- `PATCH /calendar/sold { propertyId, date }` → tạo CalendarLock status=BOOKED
- Dùng khi OWNER bán phòng ngoài hệ thống (Booking.com, walk-in không qua app)

**Bulk lock 100 ngày**:
- `POST /calendar/bulk { mode: "lock", items: [{ propertyId, date }, ...] }` — tối đa 100 items
- Hữu ích khi OWNER nghỉ Tết, nghỉ dài → click rectangular trên FE, chọn 30 ngày × 5 cơ sở
- BE trả per-item result: thành công bao nhiêu, fail bao nhiêu, fail vì sao
- Partial success: 28/30 OK, 2 ngày fail vì đã có booking

### 10.5 Business rules

- 1 ngày × 1 cơ sở chỉ có 1 trạng thái duy nhất
- Khi tạo booking HOLD → các ngày trong range tự động chuyển status=hold (qua query, không tạo CalendarLock)
- Khi booking confirm → status=booked
- Khi booking cancel → ngày tự về available
- CalendarLock chỉ áp dụng cho việc OWNER khoá thủ công (không liên quan booking)

### 10.6 Edge cases

- Bulk lock 100 ngày trong đó 30 ngày đã có booking → 70 OK, 30 fail. Trả kết quả per-item, FE hiển thị chi tiết
- Khoá ngày trong quá khứ → BE không cấm, nhưng vô nghĩa
- ADMIN có thể khoá ngày của cơ sở thuộc OWNER khác (override)

### 10.7 KPI

- **Tỉ lệ occupancy** (`booked + hold) / total nights`)
- **Số ngày locked / cơ sở / tháng** (signal nghỉ nhiều hay ít)

---

## 11. Module Bookings — Đặt phòng & vòng đời

### 11.1 Mục đích nghiệp vụ

**Module trọng tâm** — toàn bộ giao dịch giữa OWNER và CUSTOMER. Mọi tính năng khác (review, dispute, chat) đều xoay quanh booking.

### 11.2 4 trạng thái booking

| Status | Code | Mô tả | Chuyển sang được |
|---|---|---|---|
| HOLD | 0 | Giữ chỗ tạm thời | CONFIRMED, CANCELLED |
| CONFIRMED | 1 | Đã xác nhận | COMPLETED, CANCELLED |
| CANCELLED | 2 | Đã huỷ | (terminal) |
| COMPLETED | 3 | Đã hoàn tất | (terminal, có thể review) |

### 11.3 2 loại hold

| Loại | Endpoint | Thời gian | Ai dùng |
|---|---|---|---|
| **Staff hold** | `POST /bookings/hold` | 30 phút | OWNER/SALE/ADMIN — cho khách walk-in, gọi điện đặt |
| **Customer hold** | `POST /bookings/customer-hold` | 24 giờ | CUSTOMER tự đặt qua app, OWNER có thời gian xác nhận |

Sau khi hết hạn hold, cron tự chuyển booking sang CANCELLED.

### 11.4 Field chính trên Booking

- `propertyId, saleId (nullable), customerId (nullable)`
- `customerName, customerPhone` — bắt buộc (cho walk-in không cần account)
- `checkinDate, checkoutDate` (Date, UTC midnight)
- `status, holdExpireAt, holdRemainingSeconds` (computed)
- `totalAmount, paidAmount, paidAt, depositAmount` — tiền (VND int)
- `guestCount, notes`
- Mới v1.3: `propertyName, nights` (computed)

### 11.5 Flow chính

**CUSTOMER đặt phòng**:
1. CUSTOMER xem property detail → chọn check-in/check-out
2. App gọi `POST /bookings/customer-hold { propertyId, checkinDate, checkoutDate, guestCount }`
3. BE check:
   - Cơ sở có active và approved không?
   - Khoảng ngày này có conflict với booking khác (HOLD/CONFIRMED) hoặc CalendarLock không?
   - `maxGuests >= guestCount` ?
4. BE tạo booking status=HOLD, holdExpireAt = now + 24h
5. BE notify OWNER "Có khách đặt phòng, vui lòng xác nhận trong 24 giờ"
6. CUSTOMER thấy booking trong "My bookings" với countdown 24:00:00

**OWNER xác nhận**:
1. OWNER nhận push notification → mở app
2. Xem booking detail → quyết định nhận hay không
3. `PATCH /bookings/:id/confirm` → status=CONFIRMED, clear holdExpireAt
4. BE notify CUSTOMER "Phòng đã được xác nhận"

**OWNER ghi nhận thu tiền**:
1. Khách chuyển khoản, hoặc đến nhận phòng trả tiền mặt
2. `PATCH /bookings/:id/paid { amount? }` — nếu không truyền amount, dùng totalAmount/depositAmount
3. BE set `paidAmount, paidAt`, nếu booking đang HOLD thì auto confirm
4. Notify owner + customer
5. **Audit log** `booking.mark_paid`

**Tự động COMPLETED**:
- Cron mỗi 1h: scan booking status=CONFIRMED có `checkoutDate < now` → set status=COMPLETED
- CUSTOMER có thể review từ lúc này

**Huỷ booking**:
- CUSTOMER tự huỷ (chỉ HOLD): `PATCH /bookings/:id/customer-cancel`
- OWNER/SALE huỷ (HOLD/CONFIRMED): `PATCH /bookings/:id/cancel`
- ADMIN huỷ bất kỳ booking
- BE set status=CANCELLED, không xoá row (giữ history)

### 11.6 Business rules

- Khách chỉ được CHOOSE checkinDate trong tương lai (không cho phép checkin = today nếu đã quá 14:00)
- `checkoutDate > checkinDate` (ít nhất 1 đêm)
- `maxGuests` không vượt
- Conflict check: 2 booking HOLD/CONFIRMED không trùng khoảng ngày
- Khi staff hold expire (30p) → cron tự cancel
- Customer hold expire (24h) → cron tự cancel
- Khi OWNER xoá property → booking vẫn còn, status không đổi (chỉ ẩn trong UI nếu cần)

### 11.7 Thông báo

- `booking_new` → OWNER khi customer hold
- `booking_confirmed` → CUSTOMER khi owner confirm
- `booking_paid` → CUSTOMER + OWNER khi mark paid
- `booking_cancelled` → bên còn lại khi huỷ
- `booking_expired` → CUSTOMER khi hold expire

### 11.8 Audit

- `booking.mark_paid` — admin/owner ghi nhận thu tiền (audit để chống gian lận)
- Các action confirm/cancel không log riêng (đã có status change trong DB)

### 11.9 Edge cases

- Customer hold ngày này, ngày mai property bị suspend → booking vẫn CONFIRMED, owner phải tự liên hệ khách
- Owner confirm xong customer huỷ → cần endpoint customer-cancel cho CONFIRMED? Hiện tại customer chỉ huỷ HOLD. CONFIRMED phải qua dispute hoặc liên hệ owner
- 2 customer cùng hold 1 cơ sở cùng khoảng ngày trong 100ms → BE serialize via DB transaction, 1 thành công, 1 bị `propertyNotAvailable`

### 11.10 KPI

- **Tỉ lệ HOLD → CONFIRMED** (khả năng OWNER xác nhận đúng SLA)
- **Tỉ lệ HOLD → CANCELLED** (mất khách)
- **Average lead time** (từ tạo booking → checkin)
- **Tỉ lệ paid / completed** (thu tiền thành công)
- **Doanh thu / cơ sở / tháng**

---

## 12. Module Payment — Thanh toán subscription

### 12.1 Mục đích nghiệp vụ

OWNER trả phí platform để dùng dịch vụ. Module Payment **hiện chỉ hỗ trợ 1 phương thức duy nhất**: bank transfer qua VietQR + auto reconcile webhook.

> **Lưu ý**: VNPay và Apple IAP đã được loại khỏi phase hiện tại. Bookings cũng KHÔNG đi qua module này — booking là deal trực tiếp OWNER ↔ CUSTOMER, platform không trung gian thanh toán booking.

### 12.2 Vai trò liên quan

- **OWNER**: tạo payment session, xem history, chuyển khoản theo VietQR
- **ADMIN**: xem history toàn hệ, refund, mark-paid thủ công nếu webhook fail

### 12.3 Flow chính

**OWNER mua gói lần đầu**:
1. OWNER vào `/host/settings/subscription` → xem `/billing/plans` list
2. Chọn gói (vd: `rooms_5` monthly = 499K)
3. App gọi `POST /payments/initiate { planId, cycle, method: "bank_transfer", rooms, totalAmount }`
4. BE verify:
   - Plan có active không
   - rooms ≤ plan.maxRooms
   - totalAmount khớp công thức tính (tolerance 1%)
   - Nếu OWNER có priceOverride → dùng giá đó thay vì công thức
5. BE tạo PaymentSession row, generate VietQR payload, trả về:
   ```
   {
     sessionId,
     method: "bank_transfer",
     totalAmount,
     qrCode: "<EMVCo VietQR payload string>",
     bankInfo: {
       bankName: "Vietcombank",
       accountNumber: "0011004567890",
       accountName: "CONG TY HALONG24H",
       bankBin: "970436",
       content: "HALONG24H <sessionId>",  // nội dung chuyển khoản BẮT BUỘC
       vietQrPayload: "<same as qrCode>"
     },
     expiresAt  // 24 giờ sau
   }
   ```
6. App hiển thị QR (render từ vietQrPayload) + STK + nội dung chuyển khoản
7. OWNER mở app banking → quét QR (hoặc nhập tay STK + amount + nội dung) → chuyển

**Webhook bank reconcile (server-to-server)**:
- Sepay/Casso POST `/payments/bank-webhook` với header `X-Webhook-Secret` khi có giao dịch tới TK
- BE parse payload → extract `sessionId` từ field description (nội dung chuyển khoản)
- Match với PaymentSession pending → verify amount khớp (tolerance 1000 VND) → set status=paid
- Activate subscription: tạo Subscription row mới, update User.subscriptionStatus=active, extend nextChargeAt

**OWNER check status (polling hoặc realtime)**:
- App có thể polling `GET /payments/:sessionId/status` mỗi 10s sau khi user nói "đã chuyển khoản"
- Hoặc đợi push notification `payment_success` khi BE webhook nhận tiền

### 12.4 Renew

- `POST /payments/renew {}` → BE tự lấy plan + cycle hiện tại, tạo session bank_transfer mới với amount = giá plan (hoặc priceOverride)
- Cùng flow như initiate

### 12.5 Refund

- ADMIN có thể refund: `POST /payments/:sessionId/refund`
- BE chỉ ghi nhận `refunded=true, refundedAt`. **Thực tế chuyển tiền ngược là ADMIN làm thủ công qua banking** (BE không tự xử lý tiền vì không có API banking 2 chiều)

### 12.6 Manual mark-paid (admin)

Khi user chuyển khoản ngoài flow (vd: chuyển nhầm STK, hoặc deal trực tiếp ngoài app):
- ADMIN dùng `POST /admin/users/:id/subscription/mark-paid { amount, days, planId, cycle, reference, note }` (xem §13)
- BE tạo Subscription row + activate, không liên quan PaymentSession

### 12.7 Business rules

- 1 session expire sau **15 phút** — VietQR có TTL ngắn, user phải hoàn tất chuyển khoản trong 15 phút hoặc tạo lại session mới
- Tolerance 1% giữa totalAmount client gửi và amount BE compute (chống FE bug)
- Tolerance 1000 VND giữa amount trên webhook và session.totalAmount (chống user gõ sai vài ngàn)
- Khi tạo session mới → BE expire các session pending cũ trên cùng submission
- Nội dung chuyển khoản BẮT BUỘC chứa `HALONG24H <sessionId>` để webhook match được
- VAT: BE compute amount đã bao gồm VAT (default 10%)
- Yearly discount: default 20%

### 12.8 Edge cases

- **User chuyển sai nội dung** (không có sessionId): webhook không match → tiền vào TK nhưng session vẫn pending. ADMIN phải mark-paid thủ công và liên hệ Sepay/Casso để tra
- **User chuyển amount sai > 1000 VND**: webhook reject. ADMIN cũng cần can thiệp thủ công
- **Double payment** (user chuyển 2 lần): session lần 1 đã paid, lần 2 amount khác sessionId → admin tự refund
- **Webhook delay**: Sepay/Casso đôi khi 1-5 phút mới đẩy. App nên hiển thị "Đang xác nhận, vui lòng đợi..." sau khi user báo đã chuyển
- **Bank webhook fail**: nếu Sepay/Casso down → tiền vẫn vào TK nhưng BE không biết. Cron daily sẽ list session pending > 24h để ADMIN tra cứu

### 12.9 KPI

- **Conversion rate** từ initiate → paid (qua webhook tự động)
- **Tỉ lệ phải manual mark-paid** (signal user chuyển sai nội dung)
- **Average time to pay** (initiate → paid)
- **Refund rate**

---

## 13. Module Subscription — Gói dịch vụ chủ homestay

### 13.1 Mục đích nghiệp vụ

Mỗi OWNER có 1 subscription (gói) tại 1 thời điểm. Subscription quyết định OWNER được dùng tính năng gì, bao nhiêu phòng.

### 13.2 Cơ chế lưu trữ

- **User table**: `subscriptionStatus, subscriptionPlanId, subscriptionCycle, subscriptionProvider, subscriptionPriceOverride, trialEndsAt, nextChargeAt, subscriptionFrozenAt, subscriptionFrozenReason` — đại diện active sub
- **Subscription table**: history các period đã trả (mỗi mark-paid = 1 row mới)

### 13.3 7 trạng thái subscription

| Status | Mô tả | OWNER làm được gì |
|---|---|---|
| `none` | Chưa có gói | Đang đợi mua hoặc admin grant trial |
| `trial` | Dùng thử | Đầy đủ tính năng, hết hạn → past_due |
| `active` | Đã trả phí | Đầy đủ tính năng |
| `past_due` | Hết hạn, chưa renew | Bị hạn chế (không tạo property/staff mới) |
| `frozen` | Admin tạm khoá | Hoàn toàn block thao tác business |
| `cancelled` | User huỷ tự nguyện | Như past_due |
| `expired` | Quá hạn dài | Như past_due |

### 13.4 Pricing override

**Tính năng đặc biệt cho admin**: set giá custom cho từng OWNER.

| Scenario | Giá |
|---|---|
| `priceOverride = null` (default) | Dùng giá plan |
| `priceOverride = 500000` | Override = 500K/kỳ |
| `priceOverride = 0` | Miễn phí (vẫn cần qua payment flow nhưng `totalAmount = 0`) |

Áp dụng khi:
- OWNER gọi `/payments/initiate` → expectedTotal = priceOverride
- OWNER gọi `/payments/renew` → same

Use case:
- Đối tác chiến lược: giảm 50%
- Cụm OWNER thân thiết: giảm 30%
- OWNER lớn (>50 phòng): tăng custom theo enterprise deal

### 13.5 Flow ADMIN operations

**Grant trial**:
- `POST /admin/users/:id/trial { days: 14, planId?: "rooms_5", reason: "Đối tác giới thiệu" }`
- BE set `trialEndsAt = now + 14 days`, status=trial
- Có thể grant nhiều lần (gia hạn trial)
- Reject nếu user đang ACTIVE hoặc FROZEN

**Set price**:
- `PATCH /admin/users/:id/subscription/price { priceOverride: 1500000, reason: "Deal Q3" }`
- BE update User.subscriptionPriceOverride
- Notify OWNER "Giá gói được điều chỉnh"

**Mark paid manually**:
- `POST /admin/users/:id/subscription/mark-paid { amount: 1500000, days: 30, planId, cycle, reference: "Bank txn ABC123" }`
- BE:
  - Set user.subscriptionStatus = active
  - Tạo Subscription row mới với customPrice + paidAmount
  - Extend nextChargeAt thêm `days` ngày
- Use case: OWNER chuyển bank ngoài flow auto, ADMIN ghi nhận
- Idempotent: 10s window check, click 2 lần → 409

**Freeze**:
- `POST /admin/users/:id/subscription/freeze { reason: "Vi phạm chính sách" }`
- BE set status=frozen, lưu reason
- OWNER bị block hoàn toàn (không tạo booking, không sửa property)

**Unfreeze**:
- `POST /admin/users/:id/subscription/unfreeze`
- BE restore status theo logic:
  - `trialEndsAt` còn hiệu lực → `trial`
  - Subscription `endsAt > now` → `active`
  - Else → `past_due`

### 13.6 Business rules

- 1 user = 1 active subscription tại 1 thời điểm (subscription history giữ trong Subscription table)
- Trial không thể grant khi user đang ACTIVE hoặc FROZEN
- Mark-paid không thể chạy 2 lần trong 10s (idempotency)
- Frozen subscription tự hold tất cả Subscription rows liên quan (set status=frozen, lưu frozenAt)
- Price override chỉ ảnh hưởng future payments, không ảnh hưởng Subscription rows cũ

### 13.7 Notifications

- `trial_granted` → OWNER khi admin grant
- `trial_extended` → OWNER khi gia hạn
- `trial_revoked` → OWNER khi thu hồi
- `subscription_price_changed` → OWNER khi admin update price
- `subscription_paid` → OWNER khi mark paid
- `subscription_frozen` → OWNER khi bị freeze + reason
- `subscription_unfrozen` → OWNER khi mở băng

### 13.8 Audit

Tất cả admin action subscription đều audit:
- `subscription.trial_grant, trial_revoke, set_price, mark_paid, freeze, unfreeze`
- Audit metadata bao gồm: priceOverride cũ/mới, days, planId, reason

### 13.9 KPI

- **MRR (Monthly Recurring Revenue)** — `sum(active subscriptions × giá kỳ)`
- **Churn rate** — % user cancelled / month
- **Trial → Paid conversion** — bao nhiêu % user trial chuyển sang trả phí
- **Số user frozen** (signal vấn đề chính sách)
- **Sum paid theo period** — qua `/admin/subscriptions/sum-paid`

---

## 14. Module Staff Invite — Mời nhân viên SALE

### 14.1 Mục đích nghiệp vụ

OWNER không thể tự tạo SALE account thủ công (vì security). Phải qua flow mời:
1. OWNER tạo invite với email SALE
2. BE gửi email + short code
3. Người được mời accept → BE tạo SALE account + gán `ownerId`

### 14.2 Vai trò

- **OWNER**: tạo invite, list, huỷ
- **ADMIN**: tạo invite thay mặt OWNER (nhập `ownerId`), xem/huỷ tất cả invites
- **Public**: verify token + accept

### 14.3 Điều kiện tiên quyết

- OWNER phải có KYC `approved` (hoặc kycBypass)
- OWNER phải có subscription `trial` hoặc `active` (không `past_due`)
- Email mời chưa có account active trên hệ thống

### 14.4 Flow chính

**OWNER tạo invite**:
1. OWNER vào `/host/staff` → click "Mời nhân viên"
2. Nhập email → submit
3. `POST /staff/invites { email }`
4. BE:
   - Generate `token` (64 hex) + `shortCode` (HL-XXXXXX, 6 ký tự alphabet không nhầm lẫn)
   - Tạo StaffInvite row, expires sau 7 ngày
   - Build inviteLink: `https://halong24h.com/staff/accept?token=...`
   - Gửi email qua SMTP (template `staff_invite`)
5. Trả về `{ invite, inviteLink, emailSent }` — `emailSent=false` nếu SMTP down → OWNER copy link share Zalo

**SALE accept**:

**Bước 1: Verify token**:
1. SALE click link trong email → mở web landing `/staff/accept?token=...`
2. Web gọi `GET /staff/invites/verify/<token>`
3. BE trả về thông tin OWNER (`{ owner: { name, avatar, homestayName }, expiresAt, email }`)
4. Web hiển thị "Anh A mời bạn làm nhân viên homestay X"

**Bước 2: Choose method**:

*Option A — Google*:
- SALE click "Đăng nhập với Google"
- App nhận Google idToken
- `POST /staff/invites/accept { token, method: "google", idToken }`
- BE verify Google → check email khớp với invite email → tạo SALE account → return tokens

*Option B — Password*:
- SALE nhập name, password, phone (optional)
- `POST /staff/invites/accept { token, method: "password", name, password, phone }`
- BE hash password → tạo SALE account → return tokens

3. BE tự:
   - Set `status=accepted` cho StaffInvite
   - Tạo UserPermission rows mặc định cho SALE (xem §15)
   - Notify OWNER "Nhân viên đã accept"

### 14.5 Business rules

- TTL invite 7 ngày — hết hạn auto chuyển status=expired
- Cùng 1 OWNER không thể tạo 2 invite pending cho cùng email
- Nếu email đã có account → 409 conflict
- Short code dùng alphabet bỏ I,O,1,0 (dễ đọc/nói qua điện thoại)
- Rate limit verify token: 10/phút/IP (chống brute-force token)

### 14.6 Permission mặc định SALE

Khi SALE accept invite, BE tạo sẵn 4 UserPermission rows:

| Module | canCreate | canRead | canUpdate | canDelete |
|---|:---:|:---:|:---:|:---:|
| properties | ❌ | ✅ | ❌ | ❌ |
| bookings | ✅ | ✅ | ✅ | ❌ |
| calendar | ✅ | ✅ | ✅ | ✅ |
| reviews | ❌ | ✅ | ✅ | ❌ |

OWNER có thể chỉnh sau (chưa có UI, dùng `PUT /permissions/:userId`).

### 14.7 Notifications

- `staff_invite_accepted` → OWNER

### 14.8 Edge cases

- SALE accept khi invite đã expired → 410 Gone
- SALE accept với Google nhưng Google email khác invite email → 403 Forbidden
- OWNER huỷ invite (status=pending) → SALE bấm link → "Lời mời đã bị huỷ"

---

## 15. Module Permissions — Phân quyền chi tiết

### 15.1 Mục đích

SALE không phải lúc nào cũng có quyền giống OWNER. ADMIN cấu hình quyền chi tiết qua UserPermission table.

### 15.2 Cấu trúc

| Field | Mô tả |
|---|---|
| `module` | `properties` / `bookings` / `calendar` / `reviews` |
| `canCreate, canRead, canUpdate, canDelete` | Boolean CRUD |

### 15.3 Flow ADMIN cấu hình

1. ADMIN xem user detail SALE → tab "Phân quyền"
2. Click checkbox cho từng module
3. `PUT /permissions/:userId { permissions: [{ module, canCreate, canRead, canUpdate, canDelete }, ...] }`
4. BE upsert (delete old + create new)

### 15.4 Cách BE enforce

Mỗi endpoint nhạy cảm có decorator:
```
@Permission(PERMISSION_MODULE.BOOKINGS, PERMISSION_ACTION.CREATE)
```
BE PermissionGuard check user có quyền không trước khi cho qua.

### 15.5 Business rules

- ADMIN bypass mọi permission check
- OWNER bypass cho property/booking của mình
- SALE phải có row UserPermission tương ứng

---

## 16. Module Reviews — Đánh giá & moderation

### 16.1 Mục đích nghiệp vụ

CUSTOMER đánh giá cơ sở sau khi check-out để:
- Giúp khách khác chọn cơ sở tốt
- OWNER cải thiện chất lượng
- Platform giữ uy tín (admin moderation review xấu)

### 16.2 Cấu trúc Review

**6 tiêu chí chấm điểm** (1-5 mỗi tiêu chí):
- `cleanliness` (sạch sẽ)
- `location` (vị trí)
- `amenities` (tiện nghi)
- `service` (dịch vụ)
- `value` (giá trị)
- `accuracy` (đúng mô tả)

BE tự compute `avgRating = (sum 6 trên) / 6`.

**Content**:
- `comment` (tối đa 1000 ký tự)
- `photos[]` (URL Cloudinary, tối đa 10 ảnh)

**Owner reply**:
- `ownerReply, ownerReplyAt`

**Moderation**:
- `isHidden` (bool), `hiddenReason`

### 16.3 Vai trò

| Hành động | ADMIN | OWNER | SALE | CUSTOMER |
|---|:---:|:---:|:---:|:---:|
| Tạo review | ❌ | ❌ | ❌ | ✅ |
| Xem reviews | ✅ | ✅ | ✅ | ✅ (public) |
| Reply review | ✅ | ✅ | ❌ | ❌ |
| Ẩn review | ✅ | ❌ | ❌ | ❌ |
| Khôi phục review | ✅ | ❌ | ❌ | ❌ |

### 16.4 Flow

**CUSTOMER tạo review**:
1. CUSTOMER vào "My bookings" → booking COMPLETED → "Đánh giá"
2. Chấm 6 tiêu chí + viết comment + upload ảnh
3. `POST /properties/:id/reviews { bookingId, cleanliness, ..., comment, photos }`
4. BE check:
   - Booking thuộc về customer
   - Booking status = COMPLETED
   - Chưa review trước đó (`bookingId` unique trên PropertyReview)
5. BE tạo review + compute avgRating

**OWNER reply**:
- `POST /properties/:id/reviews/:reviewId/reply { reply }` → BE update ownerReply, ownerReplyAt

**Public list reviews**:
- `GET /properties/:id/reviews?page&pageSize&sort=newest|oldest|highest|lowest&minRating=1-5`
- BE trả `items` + `summary { avgRating, totalReviews, ratingDistribution: { 5: 15, 4: 5, 3: 2, 2: 1, 1: 0 } }`

**ADMIN moderation**:
- List: `GET /admin/reviews?status=visible|hidden|all&rating&search&page`
- Detail (mới v1.3): `GET /admin/reviews/:reviewId` — kèm hydrate property + customer + booking
- Count flagged: `GET /admin/reviews/count-flagged` (badge sidebar)
- Ẩn: `DELETE /admin/reviews/:reviewId { reason }` (reason ≥ 5 chars)
- Khôi phục: `POST /admin/reviews/:reviewId/restore`

### 16.5 Business rules

- 1 booking = 1 review (unique constraint)
- Chỉ booking COMPLETED mới được review
- avgRating tính tự động, không cho client gửi
- isHidden=true → review không hiện trong public list (`/properties/:id/reviews`) nhưng admin vẫn xem được

### 16.6 Notifications

- `review_received` → OWNER khi có review mới (push + in-app)
- `review_replied` → CUSTOMER khi OWNER reply

### 16.7 Audit

- `review.hide` — admin ẩn review nào, lý do
- `review.restore` — admin khôi phục

### 16.8 Edge cases

- Customer review xong, OWNER báo admin review láo → admin ẩn → có thể tạo dispute giữa OWNER và customer
- Customer xoá account → review còn (giữ data, hiển thị "User đã xoá")

### 16.9 KPI

- **Avg rating per property**
- **Số review / cơ sở / tháng**
- **Tỉ lệ review có reply** (signal OWNER quan tâm khách)
- **Số review hidden** (signal moderation)

---

## 17. Module Disputes — Khiếu nại

### 17.1 Mục đích nghiệp vụ

Khi có vấn đề giữa OWNER và CUSTOMER (khách không hài lòng, owner phàn nàn khách, damage, no-show, overbooking, ...), bất kỳ bên nào cũng có thể mở dispute. ADMIN xét xử.

### 17.2 6 loại dispute

| Type | Mô tả |
|---|---|
| `refund_request` | Khách yêu cầu hoàn tiền |
| `service_quality` | Chất lượng dịch vụ không đúng mô tả |
| `damage_claim` | Owner báo khách làm hỏng tài sản |
| `no_show` | Khách không đến |
| `overbooking` | Owner book trùng (double-booking giữa app và OTA khác) |
| `other` | Khác |

### 17.3 4 trạng thái

| Status | Mô tả |
|---|---|
| `pending` | Vừa mở, chờ admin xem |
| `investigating` | Admin đang điều tra (collect info) |
| `resolved` | Đã giải quyết (kèm resolution + optional refundAmount) |
| `rejected` | Bác (kèm lý do) |

### 17.4 Vai trò

- **OWNER/SALE của property** hoặc **CUSTOMER của booking** mở dispute
- **ADMIN** xét xử

### 17.5 Flow

**Mở dispute**:
1. User vào booking detail → "Báo cáo vấn đề"
2. Nhập type, subject (≥5 chars), description (≥10 chars), optional amount, optional attachments (URL ảnh)
3. `POST /disputes { bookingId, type, subject, description, amount?, attachments? }`
4. BE check ACL: caller phải là party của booking
5. Tạo dispute status=pending
6. Notify:
   - ADMIN: "Có dispute mới"
   - Owner (nếu opener không phải owner)
   - Customer (nếu opener không phải customer)

**ADMIN investigate**:
1. `POST /admin/disputes/:id/investigate` → status=investigating
2. (Optional) admin chat với 2 bên qua module Chat
3. (Optional) xem audit log của owner/customer để hiểu hành vi

**ADMIN resolve**:
- `POST /admin/disputes/:id/resolve { resolution, refundAmount? }`
- Resolution là text giải thích phán quyết
- Nếu có refundAmount → admin tự refund tiền ngoài hệ thống
- Notify owner + customer + opener (mới v1.1 fix)

**ADMIN reject**:
- `POST /admin/disputes/:id/reject { resolution }`
- Notify opener

### 17.6 Business rules

- 1 booking có thể có nhiều dispute (vd: khách mở refund_request, sau đó owner mở damage_claim)
- Conversation liên quan dispute có `hasDispute=true` → không bị purge bởi chat retention cron
- Resolution là text, không có enum verdict cụ thể (đơn giản hoá v1)
- Attachments tối đa 10 URL (upload qua Cloudinary trước)

### 17.7 Notifications

- `dispute_opened` → ADMIN team + party còn lại
- `dispute_resolved` → owner + customer + opener
- `dispute_rejected` → opener

### 17.8 Audit

- `dispute.investigate, dispute.resolve, dispute.reject` — admin nào, dispute nào, refundAmount bao nhiêu

### 17.9 KPI

- **Số dispute mở / tháng** (signal chất lượng platform)
- **Tỉ lệ resolved vs rejected**
- **SLA xét xử** (thời gian từ pending → resolved/rejected)
- **Tổng refund / tháng**

---

## 18. Module Notifications — Thông báo

### 18.1 Mục đích nghiệp vụ

Thông báo trong app cho user về sự kiện liên quan đến họ:
- Booking mới
- Payment thành công
- KYC duyệt
- Dispute resolve
- Property approved/rejected
- Chat message (offline fallback)

### 18.2 3 loại notification

| Type | Code | Use case |
|---|---|---|
| `BOOKING` | 0 | Liên quan booking (mới, confirm, cancel, paid) |
| `PAYMENT` | 1 | Liên quan thanh toán |
| `SYSTEM` | 2 | Hệ thống (KYC, property moderation, dispute, ...) |

### 18.3 Cấu trúc Notification

- `title, subtitle` (human-readable)
- `type, isRead, createdAt`
- `targetId, targetType` — để click deep link (vd: `bookingId, "booking"`)
- `pushType` — slug để mobile route (vd: `booking_confirmed`)
- `deepLink` — URL relative để FE navigate

### 18.4 Flow

**BE tạo notification**:
- Trigger ở mọi sự kiện business → `notificationsService.notifyUser(userId, title, body, type, targetId, targetType, { pushType, deepLink })`
- BE đồng thời:
  - Lưu DB row
  - Gửi FCM push tới tất cả devices của user (nếu có)

**User đọc**:
- App mở → `GET /notifications?page&limit` list paginated
- `GET /notifications/unread-count` → badge số đỏ
- Click 1 noti → `PATCH /notifications/:id/read` + navigate theo deepLink
- "Mark all read" → `PATCH /notifications/read-all`

### 18.5 FCM payload

BE gửi data-message (không phải notification message) để app tự render:
```json
{
  "type": "booking",
  "title": "Đặt phòng được xác nhận",
  "subtitle": "Villa A — booking ABC123",
  "targetId": "<bookingId>",
  "targetType": "booking",
  "notificationId": "<uuid>",
  "pushType": "booking_confirmed",
  "deepLink": "/bookings/<bookingId>"
}
```

### 18.6 Push types

Slugs để mobile route:
- `booking_new, booking_confirmed, booking_cancelled, booking_paid, booking_expired`
- `subscription_paid, subscription_frozen, subscription_unfrozen, subscription_price_changed`
- `kyc_approved, kyc_rejected`
- `property_approved, property_rejected, property_suspended, property_resubmitted`
- `dispute_opened, dispute_resolved, dispute_rejected`
- `staff_invite_accepted, staff_removed`
- `chat_message`
- `lead_new`
- `trial_granted, trial_extended, trial_revoked`
- `review_received`

### 18.7 Business rules

- Notification không bao giờ xoá (chỉ ẩn hiển thị nếu cần qua field `archivedAt` — chưa có)
- Push FCM fire-and-forget; nếu fail không retry

---

## 19. Module Chat — Nhắn tin real-time

### 19.1 Mục đích nghiệp vụ

OWNER và CUSTOMER cần nhắn tin về booking (hỏi đường đi, xác nhận thời gian check-in, ...). Trước đây qua Zalo/SMS không trace được, giờ trong app có lịch sử + admin có thể moderate.

### 19.2 3 loại conversation

| Type | Mô tả | Members |
|---|---|---|
| `booking` | Về 1 booking cụ thể | OWNER + CUSTOMER (+ SALE nếu sale tạo) |
| `support` | User ↔ admin support | User + ADMIN |
| `staff` | OWNER ↔ SALE nội bộ | OWNER + SALE |

### 19.3 Hai luồng

**REST** — cho list, history, send fallback:
- `GET /conversations` list inbox
- `GET /conversations/:id/messages?cursor` lazy load
- `POST /conversations/:id/messages` gửi tin (fallback nếu WS không khả dụng)
- `PATCH /conversations/:id/read` mark read
- `PATCH /conversations/messages/:messageId` sửa tin (15 phút)
- `DELETE /conversations/messages/:messageId` xoá (sender hoặc admin)

**WebSocket** — `/chat` namespace:
- Client kết nối với JWT trong handshake
- Events:
  - Client → server: `message:send, read, typing:start, typing:stop`
  - Server → client: `message:new, message:ack, message:edit, message:delete, read:update, typing, presence, error`

### 19.4 Behavior

**Multi-device**: Tất cả socket của 1 user đều nhận `message:new` → đồng bộ web + mobile.

**Offline fallback**: Nếu recipient không có socket active → BE tự gửi FCM push với `pushType=chat_message` + `deepLink=/conversations/:id`.

**Retention**: Cron mỗi ngày 3AM xoá messages > 180 ngày. Conversation có `hasDispute=true` được giữ.

**Presence narrow**: Online status chỉ broadcast tới member của conversation chung, không leak.

### 19.5 Vai trò

| Hành động | ADMIN | OWNER | SALE | CUSTOMER |
|---|:---:|:---:|:---:|:---:|
| Mở conversation booking | ✅ | ✅ | ✅ | ✅ |
| Gửi tin | ✅ | ✅ | ✅ | ✅ |
| Sửa tin của mình (15p) | ✅ | ✅ | ✅ | ✅ |
| Xoá tin của mình | ✅ | ✅ | ✅ | ✅ |
| Xoá tin của user khác | ✅ | ❌ | ❌ | ❌ |
| Xem conversation của user khác | ✅ | ❌ | ❌ | ❌ |

### 19.6 Business rules

- Sender chỉ sửa tin của mình, trong 15 phút sau gửi
- System message không sửa/xoá
- ADMIN có thể join bất kỳ conversation để moderate
- Conversation type=booking idempotent với bookingId (2 user mở chat về cùng booking → cùng 1 conversation)

### 19.7 KPI

- **Số message / conversation / tuần** (engagement)
- **Tỉ lệ recipient response trong 1h** (SLA)

---

## 20. Module Leads — Khách hàng tiềm năng

### 20.1 Mục đích

Form public trên landing page để khách quan tâm (chưa book) liên hệ. OWNER/SALE có thể follow up qua điện thoại.

### 20.2 5 trạng thái

| Status | Mô tả |
|---|---|
| `new` | Vừa submit, chưa liên hệ |
| `contacted` | OWNER/SALE đã gọi |
| `rejected` | Khách không quan tâm nữa |
| `expired` | Lead cũ chưa contacted (cron auto sau X ngày — chưa implement) |
| `converted` | Đã chuyển thành booking |

### 20.3 Flow

**Khách submit form (public)**:
1. Khách điền form trên landing: name, phone, optional checkin/out, message
2. `POST /leads { propertyId?, guestName, guestPhone, ... }` (no auth)
3. Rate limit 10/phút/IP
4. Dedup theo `phone + propertyId` trong 1h → trả lead cũ thay vì tạo trùng
5. BE notify OWNER (nếu có propertyId) hoặc ADMIN (nếu không)

**OWNER follow-up**:
1. Mở `/host/leads` → list (mới v1.3 kèm `assignedToName`)
2. Gọi điện khách
3. Update: `PATCH /leads/:id { status: "contacted", notes: "Khách hẹn đến xem 3pm" }`
4. BE auto set `contactedAt, contactedById`

### 20.4 KPI

- **Lead conversion rate** (lead → booking)
- **Lead response time** (new → contacted)

---

## 21. Module Audit Log — Nhật ký kiểm toán

### 21.1 Mục đích

Compliance + forensic. Ghi mọi hành động quan trọng của ADMIN để truy vết, đối soát, bằng chứng pháp lý.

### 21.2 Cấu trúc

| Field | Mô tả |
|---|---|
| `actorId, actorRole` | Ai làm |
| `action` | Slug hành động (vd: `user.ban`) |
| `targetType, targetId, targetLabel` | Đối tượng bị tác động |
| `metadata` | JSON arbitrary (vd: `{ reason, oldPrice, newPrice }`) |
| `ipAddress, userAgent` | Auto-capture qua interceptor |
| `createdAt` | Timestamp |

### 21.3 Action đã log

**User**: ban, unban, revoke_sessions, reset_password, change_role, kyc_bypass_toggle, delete

**Property**: approve, reject, suspend

**Subscription**: trial_grant, trial_revoke, set_price, mark_paid, freeze, unfreeze

**Review**: hide, restore

**KYC**: approve, reject

**Booking**: mark_paid

**Dispute**: investigate, resolve, reject

### 21.4 Vai trò

- Chỉ **ADMIN** xem
- KHÔNG ai sửa/xoá được (immutable)
- BE tự ghi qua AsyncLocalStorage interceptor

### 21.5 Query

`GET /admin/audit-log?action&targetType&actorId&search&from&to&page&limit`

Response kèm hydrate actor info:
```json
{
  "items": [
    {
      "id": "uuid",
      "action": "subscription.freeze",
      "actor": { "id": "...", "name": "Admin A", "email": "..." },
      "targetType": "user",
      "targetId": "<userId>",
      "targetLabel": "owner@example.com",
      "metadata": { "reason": "Vi phạm chính sách" },
      "ipAddress": "1.2.3.4",
      "userAgent": "Mozilla/5.0 ...",
      "createdAt": "2026-06-05T..."
    }
  ]
}
```

### 21.6 Phân biệt với Notifications

| | Notification | Audit log |
|---|---|---|
| Ai đọc | End user | ADMIN, compliance |
| Vòng đời | Ngắn (xoá sau N ngày) | Dài (1-7 năm) |
| Format | Title + body | Structured |
| Mutability | User mark-read/delete | Immutable |

---

## 22. Module Dashboard — Báo cáo & KPI

### 22.1 Stats

`GET /dashboard/stats`:
- `totalRooms` — tổng phòng OWNER quản lý
- `activeRooms, emptyRooms, occupiedRooms` — hôm nay
- `checkoutToday` — số khách checkout hôm nay
- `totalBookings, thisMonthBookings`
- `monthlyRevenue, todayRevenue`

### 22.2 Reports

`GET /reports?period=today|week|month|year|custom&from&to`:
- Đầy đủ stats trên + extended:
- `holdCount, confirmedCount, cancelledCount, completedCount`
- `totalDeposit`
- `occupancyRate`
- `roomsWithCover, roomsWithPrice`
- `recentBookings[]`

### 22.3 Filter scope

- ADMIN: toàn hệ thống
- OWNER: của mình
- SALE: của OWNER mình

---

## 23. Module Partner API — Tích hợp đối tác

### 23.1 Mục đích

Đối tác bên ngoài (OTA, agency, hệ thống quản lý kiểu Booking.com) tích hợp với Halong24h để:
- Lấy list property
- Check availability
- Tạo booking từ hệ thống của họ

### 23.2 Auth

Header `X-Partner-Key: <partner_api_key>` (admin cấp).

### 23.3 Endpoints

- `GET /partner/properties?page&limit&type` — list properties
- `GET /partner/properties/:id` — detail
- `GET /partner/properties/:id/availability?year&month` — calendar
- `POST /partner/bookings { propertyId, checkinDate, checkoutDate, customerName, customerPhone, partnerRef }` — tạo booking
- `POST /partner/bookings/:id/cancel` — huỷ

### 23.4 Business rules

- Partner booking tự confirm (không HOLD)
- `partnerRef` lưu ID nội bộ của partner để đối soát

---

## 24. Module App Version — Force update mobile

### 24.1 Mục đích

App mobile gọi lúc launch để check phiên bản min support.

### 24.2 Flow

1. App launch → `GET /app/version?platform=android&currentVersion=1.4.2`
2. BE trả:
```json
{
  "platform": "android",
  "latestVersion": "1.5.0",
  "minSupportedVersion": "1.3.0",
  "releaseNotes": "Sửa lỗi đặt phòng...",
  "storeUrl": "https://play.google.com/store/apps/details?id=..."
}
```

3. Logic FE:
- `currentVersion < minSupportedVersion` → **force update** (chặn app, redirect Play Store)
- `currentVersion < latestVersion` → banner "Có bản mới" (không chặn)

### 24.3 Admin set version

`POST /admin/app-version { platform, latestVersion, minSupportedVersion, releaseNotes, storeUrl }`

---

## 25. Module Email & Admin Emails — Gửi email

### 25.1 EmailService

Backend internal service gửi email transactional qua SMTP (nodemailer):
- Staff invite email (khi OWNER mời SALE)
- (Future) password reset email, booking confirmation, ...

### 25.2 Admin Emails

UI cho ADMIN xem list 15 template + test send:

**Template keys**:
`welcome_owner, welcome_sale, password_reset, booking_confirmed, booking_cancelled, booking_paid, kyc_approved, kyc_rejected, staff_invite, subscription_due, subscription_overdue, subscription_paid, dispute_opened, review_received, property_approved`

- `GET /admin/emails/templates` → `{ smtpEnabled, templates: [{ key }] }`
- `POST /admin/emails/test { template, to }` → gửi mẫu để verify

### 25.3 Note

Hiện template trả về sample text/HTML đơn giản. Khi cần production renderer cho template nào, dev chỉ cần update `EMAIL_TEMPLATE_SAMPLES` trong service. FE không cần đổi.

---

## 26. Module Devices — FCM push notification

### 26.1 Mục đích

Đăng ký FCM token để BE biết gửi push tới đâu.

### 26.2 Flow

**Sau login**:
```
POST /devices {
  fcmToken: "fK3...:APA91b...",
  platform: "android" | "ios",
  deviceModel: "Pixel 8",
  osVersion: "Android 15",
  appVersion: "1.4.2",
  locale: "vi"
}
```

Idempotent: cùng token gọi lại → no-op. Token đang gắn user khác → tự transfer.

**Trước logout**:
```
DELETE /devices/:token
```

**List devices**:
```
GET /devices → mảng UserDevice (cho màn "Quản lý phiên")
```

### 26.3 Khi nào BE gửi FCM

- Notification mới (mọi noti type)
- Chat message khi recipient offline
- Admin actions ảnh hưởng user (ban, freeze, ...)

---

## 26.5 Module Uploads — Upload file generic

### 26.5.1 Mục đích nghiệp vụ

Khi user gửi tin nhắn chat kèm ảnh/PDF, hoặc trong tương lai upload evidence dispute, BE cần endpoint chung nhận file và trả URL CDN public-readable.

Trước đó BE có 2 endpoint upload nhưng bind cứng:
- `POST /properties/:id/images` — chỉ cho property
- `POST /kyc/upload-cccd-front` — chỉ cho KYC

→ Module **Uploads** mới expose `POST /uploads` generic.

### 26.5.2 Endpoints

- `POST /uploads` (multipart) — upload 1 file/request, trả `{ id, url, type, name, size }`
- `DELETE /uploads/:id` — xoá file chưa attach (owner only)

### 26.5.3 Whitelist & limits

- MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`
- Size: ≤ 10MB
- Rate limit: 30 req/phút/user
- Filename: ≤ 255 ký tự (BE tự sanitize, strip path traversal)

> **Video không được hỗ trợ ở phase này** — defer v2.

### 26.5.4 Security

- **Magic bytes check** — đọc 8-12 byte đầu file, verify thật là JPEG/PNG/PDF/... (không tin Content-Type)
- **EXIF strip** — Cloudinary tự strip metadata (GPS, ...) trước khi public
- **Filename sanitize** — strip `/`, `\`, control chars
- **Random suffix** — Cloudinary `unique_filename: true` tránh collision
- **JWT auth** — không có endpoint anonymous

### 26.5.5 Storage stack

**Cloudinary** (reuse module đã có sẵn dùng cho property + KYC). URL native `https://res.cloudinary.com/<cloud>/...`. Public-read (không signed URL ngắn hạn) để message URL xem được mãi trong 180 ngày retention.

### 26.5.6 Lifecycle

| Sự kiện | Hành động |
|---|---|
| User upload | Tạo `UploadRecord` với `attachedAt=null` |
| User gửi message kèm URL upload | ChatService tự gọi `markAttached(senderId, urls, messageId)` |
| User đổi ý, xoá file orphan | `DELETE /uploads/:id` → Cloudinary destroy + xoá DB |
| **Cron orphan** (mỗi giờ) | Quét UploadRecord chưa attach > 24h → xoá (max 200/lần) |
| **Cron retention chat** (mỗi ngày 3AM) | Message > 180 ngày bị purge → attachment cũng bị xoá đồng bộ |

### 26.5.7 KPI

- **Tổng storage Cloudinary** (cost monitor)
- **Tỉ lệ orphan** (signal UX upload thất bại nhiều)
- **Avg file size** (signal user upload ảnh chất lượng cao hay thấp)

---

# PHẦN III — WORKFLOW END-TO-END

## 27. Hành trình OWNER — Từ đăng ký đến vận hành

### 27.1 Onboarding (Ngày 1)

1. Tải app / mở web → "Đăng ký"
2. Nhập name, email, password, role=OWNER
3. → Account active, profile rỗng, kycStatus=none, subscriptionStatus=none
4. App điều hướng → "Bạn cần xác minh danh tính để bắt đầu"

### 27.2 KYC (Ngày 1-2)

5. Chụp CCCD mặt trước → upload
6. Chụp CCCD mặt sau → upload
7. Chụp selfie cùng CCCD → upload
8. Submit hồ sơ
9. → kycStatus=pending
10. ADMIN nhận noti, mở queue, duyệt trong vài giờ
11. → kycStatus=approved, trialEndsAt = +7 ngày
12. OWNER nhận push "KYC đã được duyệt, 7 ngày trial bắt đầu"

### 27.3 Tạo cơ sở đầu tiên (Ngày 2)

13. OWNER vào "Cơ sở của tôi" → "Tạo mới"
14. Điền thông tin: name, type, address, bedrooms, prices, ...
15. Upload 10 ảnh
16. Submit → property `moderationStatus=pending, isActive=false`
17. ADMIN nhận noti, duyệt
18. → property approved, isActive=true, **public**

### 27.4 Booking đầu tiên (Ngày 3)

19. CUSTOMER tìm cơ sở qua app → đặt → booking status=HOLD 24h
20. OWNER nhận push "Có khách đặt phòng"
21. OWNER xem detail → confirm
22. → status=CONFIRMED, customer nhận noti
23. Khách đến check-in → check-out
24. OWNER ghi nhận thu tiền: `PATCH /:id/paid { amount: 1500000 }`
25. → status còn CONFIRMED, paidAmount lưu
26. Cron auto chạy khi qua checkoutDate → status=COMPLETED
27. Khách review

### 27.5 Mời nhân viên SALE (Tuần 1)

28. OWNER bận, cần SALE hỗ trợ
29. `/host/staff` → "Mời nhân viên" → nhập email
30. SALE nhận email + short code
31. SALE accept (Google hoặc password) → tạo SALE account, gán ownerId=OWNER
32. SALE có 4 quyền mặc định (xem property, CRU booking, CRUD calendar, xem reviews)

### 27.6 Hết trial (Ngày 7-8)

33. Còn 2 ngày trial → noti "Trial sắp hết hạn"
34. OWNER vào `/host/settings/subscription` → chọn gói `rooms_5` monthly
35. App hiển thị VietQR + STK Vietcombank + nội dung chuyển khoản "HALONG24H <sessionId>"
36. OWNER mở app banking → quét QR → chuyển 499K
37. Sau 1-5 phút, Sepay webhook bắn về BE → match sessionId → activate subscription
38. → status=active, nextChargeAt = +30 ngày, app push "Thanh toán thành công"

> Nếu OWNER chuyển khoản nhưng sau 10 phút BE vẫn chưa nhận → user có thể chat hỗ trợ. ADMIN tra cứu trên app banking, mark-paid thủ công.

### 27.7 Vận hành dài hạn

39. OWNER nhận booking đều, doanh thu tăng
40. Vào dashboard xem report tháng
41. Reply review của khách
42. Nếu khách phàn nàn → mở dispute với type=service_quality
43. ADMIN xét xử
44. Tới ngày renew → app push "Đến hạn renew, click để gia hạn"
45. OWNER bấm renew → chuyển khoản theo VietQR → BE webhook reconcile → tiếp tục active

---

## 28. Hành trình CUSTOMER — Tìm phòng đến review

### 28.1 Khám phá (chưa cần login)

1. Khách mở app / web → trang chủ
2. Xem `/properties/public` — danh sách cơ sở approved
3. Filter: ngày check-in/out, số khách, giá, loại, view biển/thành phố
4. Click 1 cơ sở → xem detail (ảnh, giá, amenities, rules, reviews)
5. Xem calendar trống `/calendar/public-grid`

### 28.2 Đặt phòng

6. Click "Đặt phòng" → app yêu cầu login (chưa có account → register)
7. Sau khi login → chọn check-in/out, số khách
8. App gọi `POST /bookings/customer-hold` → tạo HOLD 24h
9. → app hiện booking với countdown "Còn 23:59:00 để OWNER xác nhận"

### 28.3 Đợi xác nhận

10. OWNER nhận noti, xác nhận trong 24h
11. CUSTOMER nhận noti "Phòng đã xác nhận"
12. Hoặc: 24h trôi qua không xác nhận → cron auto cancel, customer nhận "Booking bị huỷ do owner không xác nhận"

### 28.4 Chat với OWNER (optional)

13. CUSTOMER mở booking → "Nhắn tin"
14. Conversation type=booking tự tạo (nếu chưa có)
15. Hỏi đường đi, giờ check-in, ...
16. Real-time qua WebSocket

### 28.5 Check-in / Check-out

17. Đến cơ sở, check-in
18. OWNER ghi nhận thu tiền
19. Sau check-out → status=COMPLETED (qua cron)

### 28.6 Review

20. App push "Đánh giá cơ sở X"
21. CUSTOMER chấm 6 tiêu chí, viết comment, upload ảnh
22. Submit
23. OWNER nhận noti "Có review mới"
24. OWNER có thể reply

### 28.7 Nếu có vấn đề

25. Đến cơ sở thấy không như mô tả → mở dispute type=service_quality
26. ADMIN xét xử, possibly refund

---

## 29. Hành trình SALE — Nhân viên hỗ trợ OWNER

### 29.1 Onboarding

1. SALE nhận email mời từ OWNER
2. Mở link → web verify token → "Anh A mời bạn"
3. Accept với Google → SALE account tạo + gán ownerId=OWNER
4. → SALE login web host

### 29.2 Vận hành hàng ngày

5. Mở dashboard → thấy stats của team OWNER
6. Xem calendar `/calendar/grid?propertyIds=...` (multi cơ sở)
7. Khi có khách walk-in gọi điện → SALE tạo HOLD 30 phút `/bookings/hold`
8. Confirm sau khi khách đặt cọc
9. Mark paid khi nhận tiền
10. Chat với khách qua module Chat
11. Lock ngày khi cơ sở cần bảo trì
12. Xem leads list của OWNER → call back, update status

### 29.3 Quyền hạn (mặc định)

- Read property (không sửa được)
- CRU booking (không xoá)
- CRUD calendar (full)
- Read + Update review (không tạo/xoá)

OWNER có thể adjust quyền qua admin (chưa có UI host).

### 29.4 Bị OWNER gỡ

13. OWNER click "Xoá nhân viên"
14. SALE bị set isActive=false, refresh token bị xoá
15. SALE bị buộc logout, account vẫn còn nhưng không thuộc team

---

## 30. Hành trình ADMIN — Vận hành nền tảng hàng ngày

### 30.1 Bắt đầu ngày

1. Mở web admin → dashboard
2. Xem stats: tổng user, tổng property, MRR
3. Xem badge sidebar:
   - "5 KYC chờ duyệt" → vào queue
   - "3 dispute pending" → vào list
   - "12 review flagged" → moderation
   - "8 subscription overdue" → liên hệ owner

### 30.2 Duyệt KYC (30 phút)

4. Vào `/admin/kyc` queue
5. Mở từng hồ sơ, xem 3 ảnh
6. Verify thủ công (face match, CCCD rõ nét)
7. Approve / reject
8. Audit log tự ghi

### 30.3 Duyệt property (15 phút)

9. Vào `/admin/properties?moderationStatus=pending`
10. Mở từng property, xem ảnh, mô tả
11. Approve nếu OK
12. Reject nếu ảnh xấu, mô tả thiếu, ... (kèm lý do)

### 30.4 Xử lý dispute (30 phút)

13. Vào `/admin/disputes?status=pending`
14. Mở từng dispute, đọc detail
15. Chat với 2 bên qua module Chat
16. Investigate → collect info
17. Resolve hoặc reject
18. Notify 2 bên

### 30.5 Review moderation (15 phút)

19. Vào `/admin/reviews?rating=1` (review 1 sao)
20. Đọc comment, ảnh
21. Nếu review láo, vu khống → hide
22. Nếu review chính đáng → giữ

### 30.6 Subscription management (linh hoạt)

23. Vào `/admin/subscriptions?status=past_due`
24. Liên hệ owner qua điện thoại / Zalo
25. Nếu owner đồng ý gia hạn nhưng chưa kịp thanh toán → grant trial thêm 7 ngày
26. Nếu owner deal giá riêng → set priceOverride
27. Nếu owner chuyển bank ngoài → mark paid manually
28. Nếu owner vi phạm → freeze, sau đó unfreeze nếu hứa sửa

### 30.7 Xem audit log (cuối ngày)

29. Vào `/admin/audit-log?from=2026-06-05`
30. Xem hành động team đã làm trong ngày
31. Filter theo action, target để kiểm tra compliance

### 30.8 Settings (ít)

32. Test email template
33. Update app version (khi release mobile mới)

---

# PHẦN IV — ĐO LƯỜNG & PHÁT TRIỂN

## 31. KPI & metrics đo lường

### 31.1 Business metrics (cho Founder/Sales)

- **MRR (Monthly Recurring Revenue)** — tổng subscription đang active × giá
- **ARR (Annual Recurring Revenue)** — MRR × 12
- **Number of paying owners** — count user role=OWNER, subscriptionStatus=active
- **Average revenue per OWNER (ARPO)** — MRR / số owner trả phí
- **Churn rate monthly** — % owner cancel/expire / tổng owner đầu tháng
- **CAC (Customer Acquisition Cost)** — chi phí marketing / số owner mới tháng
- **LTV (Lifetime Value)** — ARPO × tuổi thọ trung bình (tháng)
- **LTV/CAC ratio** — > 3 là healthy

### 31.2 Engagement metrics (cho Product)

- **DAU/MAU** — daily/monthly active users
- **% OWNER tạo property trong tuần đầu** (activation rate)
- **Avg properties per OWNER**
- **Avg bookings per property/month**
- **Tỉ lệ HOLD → CONFIRMED** (chỉ báo OWNER response)
- **Avg time to confirm** (SLA owner)
- **% booking COMPLETED có review** (engagement post-stay)

### 31.3 Operations metrics (cho Admin/CS)

- **KYC approval rate**
- **Avg KYC processing time** (submit → approve/reject)
- **Property moderation queue size**
- **Dispute resolution rate**
- **Avg dispute resolution time**
- **Push notification CTR** (click-through rate)

### 31.4 Tech metrics (cho Engineering)

- **API p95 latency**
- **Error rate** (5xx / total)
- **Booking conflict rate** (% booking thất bại do conflict)
- **WebSocket connection uptime**
- **FCM delivery rate**
- **Audit log volume / day**

---

## 32. Tích hợp bên ngoài

### 32.1 Đã tích hợp

| Service | Mục đích | Required env |
|---|---|---|
| Cloudinary | Upload ảnh | `CLOUDINARY_*` |
| Firebase | FCM push | `FIREBASE_SERVICE_ACCOUNT` JSON |
| Sepay/Casso | Bank webhook reconcile | `BANK_WEBHOOK_SECRET, BANK_NAME, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_NAME, BANK_BIN` |
| Google OAuth | Sign-In với Google | `GOOGLE_OAUTH_WEB_CLIENT_ID` |
| Apple Sign-In | OAuth iOS (login only, không phải IAP) | `APPLE_TEAM_ID, APPLE_KEY_ID` |
| SMTP | Email | `SMTP_HOST, SMTP_USER, SMTP_PASS` |

### 32.2 Roadmap tích hợp

- **Booking.com / Agoda Inbound** — sync booking từ OTA về Halong24h
- **Channel Manager** (SiteMinder, Hostfully) — bidirectional sync
- **Zalo OA** — gửi noti qua Zalo (cho user không cài app)
- **VNPay / MoMo** — có thể wire lại nếu cần khi base user lớn
- **Apple IAP / Google Play Billing** — wire lại khi list được trên App Store / Play Store
- **AI eKYC** (FPT.AI, VNPT eKYC) — auto verify CCCD face match
- **Google Maps API** — directions, distance từ địa điểm khách
- **Analytics** (Mixpanel, Amplitude) — track funnel chi tiết

---

## 33. Lộ trình mở rộng (Roadmap)

### Q3 2026 — Quality of life

- Resubmit endpoint cho property (auto pending khi OWNER edit property rejected → đã có v1.2)
- Edit/delete message trong chat (đã có v1.2)
- IP/UA capture cho audit log (đã có v1.2)
- Multi-property calendar grid (đã có v1.3)

### Q4 2026 — Expansion features

- **Boost listing** — OWNER trả phí để cơ sở lên top tìm kiếm
- **OTA inbound** — sync từ Booking.com về
- **Analytics dashboard** advanced — funnel, cohort, retention chart
- **Multi-bank account** — admin có thể cấu hình nhiều TK ngân hàng nhận, mỗi OWNER 1 STK riêng để dễ đối soát

### Q1 2027 — Scale up

- **Multi-region** — mở rộng ngoài Hạ Long
- **Multi-currency** — USD cho khách nước ngoài
- **Multi-language full** — hiện tại vi/en, thêm Trung, Hàn, Nhật
- **AI recommendations** — gợi ý cơ sở dựa trên lịch sử
- **Smart pricing** — gợi ý giá optimal cho OWNER

### Q2 2027 — Platform features

- **Marketplace plugin** — third-party developers tạo addon
- **White-label** — OWNER lớn có thể custom-brand app
- **B2B sales** — bán cho công ty mua phòng cho nhân viên du lịch

---

## 34. Rủi ro & ràng buộc kỹ thuật

### 34.1 Rủi ro business

| Rủi ro | Mức độ | Mitigation |
|---|---|---|
| OWNER không trả phí đúng hạn | Cao | Auto past_due + notify, sau đó freeze. CS gọi thân thiện |
| Customer gặp scam OWNER (booking fake, đến nơi không có phòng) | Cao | KYC bắt buộc + dispute + admin xét xử + có thể ban OWNER |
| Đánh giá xấu lan truyền (bad review) | Trung | Owner reply + admin moderation hide nếu vi phạm |
| Competitor (Booking.com, Airbnb) cạnh tranh giá | Trung | Differentiate qua local support, thanh toán nội địa |
| Pháp lý lưu trú VN thay đổi | Trung | KYC + audit log đủ chứng minh tuân thủ |

### 34.2 Ràng buộc kỹ thuật

| Ràng buộc | Tác động | Khi cần lo |
|---|---|---|
| DB Postgres 1 node | Khi MRR > 1B/tháng (~5000 user concurrent) | Q1 2027 |
| WebSocket 1 instance pm2 cluster | Khi > 1000 concurrent socket | Q4 2026 |
| Redis 1 node | Không vấn đề tới 10K user | Sau Q2 2027 |
| FCM rate limit | 60K msg/phút/project | Cần monitor khi base lớn |
| Bank webhook (Sepay/Casso) reliance | Webhook delay 1-5 phút bình thường; nếu provider down → manual mark-paid | Cron monitor session pending > 24h |
| 1 TK ngân hàng chung cho mọi OWNER | OWNER chuyển sai content → khó đối soát | Bắt nội dung CK chứa sessionId, ADMIN can thiệp khi cần |
| Chat retention 180 ngày | Có thể mất history old | Document rõ cho OWNER |
| Email SMTP throughput | Gmail 500/day, SendGrid 100K/month free | Switch sang Mailgun khi cần |

### 34.3 Compliance

- **GDPR** — self-delete ✅, audit log ✅, data export (chưa có)
- **Apple App Store** — self-delete ✅, sign-in with Apple ✅
- **Google Play** — data safety section (cần khai báo)
- **Luật lưu trú VN** — KYC ✅, lưu thông tin khách (qua booking) ✅
- **PCI-DSS** — KHÔNG lưu thẻ tín dụng ở mọi điểm. Thanh toán chỉ qua chuyển khoản bank (user dùng app banking của họ) → BE không tiếp xúc thông tin thẻ

---

## Phụ lục — Glossary

| Thuật ngữ | Định nghĩa |
|---|---|
| **OWNER** | Chủ cơ sở cho thuê, trả phí platform |
| **SALE** | Nhân viên thuộc team OWNER, hỗ trợ vận hành |
| **CUSTOMER** | Khách thuê phòng |
| **ADMIN** | Quản trị viên Halong24h |
| **KYC** | Know Your Customer, định danh OWNER bằng CCCD + selfie |
| **HOLD** | Trạng thái giữ chỗ tạm thời (30p staff / 24h customer) |
| **CONFIRMED** | Booking đã được OWNER xác nhận |
| **COMPLETED** | Booking đã hoàn tất, customer có thể review |
| **Trial** | 7 ngày dùng thử miễn phí sau khi KYC approved |
| **Subscription** | Gói dịch vụ OWNER trả định kỳ (monthly/yearly) |
| **Price override** | Giá custom admin set cho 1 OWNER |
| **Freeze** | Admin tạm khoá subscription, block thao tác |
| **Suspended** | Property đã từng approved, admin tạm ngưng |
| **Rejected** | Property/KYC chưa từng approved, admin từ chối |
| **Dispute** | Khiếu nại giữa OWNER và CUSTOMER, admin xét xử |
| **Audit log** | Nhật ký immutable mọi hành động ADMIN |
| **FCM** | Firebase Cloud Messaging, kênh push notification |
| **VietQR** | Chuẩn QR code chuyển khoản Napas (chuẩn thanh toán bank duy nhất ở phase hiện tại) |
| **Sepay / Casso** | Service nhận webhook khi có giao dịch vào TK ngân hàng |
| **Bank webhook** | URL BE expose để Sepay/Casso bắn thông tin chuyển khoản về |
| **Manual mark-paid** | Admin ghi nhận thanh toán thủ công khi webhook không match được |
| **MRR** | Monthly Recurring Revenue, doanh thu định kỳ tháng |
| **DAU/MAU** | Daily/Monthly Active Users |
| **Churn** | Tỉ lệ user cancel/rời khỏi platform |
| **ARPO** | Average Revenue Per OWNER |

---

> **Phiên bản tài liệu**: PM Spec v1.2 — 2026-06-05 (add Uploads module §26.5)
> **Tác giả**: Backend team (theo yêu cầu PM brief)
> **Liên hệ kỹ thuật**: backend lead
> **Cập nhật tiếp theo**: khi có thay đổi business rule, lộ trình, hoặc release feature mới

---

> **Sử dụng tài liệu**:
> - Đọc Phần I để hiểu tổng quan sản phẩm
> - Phần II tham khảo từng module khi cần chi tiết
> - Phần III để hình dung workflow thực tế
> - Phần IV để planning & roadmap
> - Convert qua Word: `pandoc PROJECT_SPEC_PM.md -o PROJECT_SPEC_PM.docx`
