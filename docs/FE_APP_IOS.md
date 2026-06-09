# Halong24h — Tổng quan toàn bộ ứng dụng

> Tài liệu mô tả **chi tiết từng trang**: chức năng, cách dùng, endpoint API gọi, cách hiển thị, cần gì, và trạng thái (đã có / còn thiếu). Sinh từ việc đọc trực tiếp source code.

## 0. Bối cảnh chung

| Mục | Giá trị |
|---|---|
| **App** | Homestay Management — **B2B, chỉ cho quản lý** (ADMIN / OWNER / SALE). Khách đặt phòng qua **website**, không có luồng khách trong app. |
| **Platform** | Flutter (iOS + Android), Dart 3.5+ |
| **Architecture** | MVC + Riverpod, GoRouter, Dio |
| **Backend** | `https://api.halong24h.com` (xem `ApiConstants.baseUrl`); spec: `API_SPEC_FULL.md` |
| **Response format** | `{ success, data, message }` — repo đọc `res.data['data']` |
| **Roles** | `ADMIN=0`, `OWNER=1`, `SALE=2` (enum app); `CUSTOMER=3` chỉ tồn tại ở backend (khách website) |

**2 lưu ý kiến trúc then chốt:**
- **Auth (v1.7, 2026-06-05):** `/login`, `/register`, `/google`, `/apple`, `/refresh` **KHÔNG trả `user`** — chỉ trả tokens. Sau khi lưu token phải gọi `GET /auth/profile` để lấy `UserModel` (`AuthRepository._finishAuthWithProfile` / `_finishOAuthWithProfile`).
- **Thanh toán = VietQR bank transfer DUY NHẤT.** Apple IAP + VNPay đã gỡ. Admin đối soát thủ công (~1–3 giờ) → kích hoạt + FCM push `subscription_paid` → app refresh profile.
- **"property" = "homestay" = "room"**: cùng một thực thể (đơn vị lưu trú + đơn vị booking); `HomestayRepository` và `RoomRepository` đều gọi `/properties`.

**Chú thích trạng thái:**
- ✅ **Hoàn chỉnh** — nối API thật, có loading/error/empty.
- 🟡 **Một phần** — UI xong nhưng chỉ lưu local (SharedPreferences) / logic client-side, chưa sync server.
- 🔴 **Placeholder** — dữ liệu giả/tĩnh hoặc nút chỉ hiện snackbar, chưa nối backend.

---

## 1. Bảng tổng kết độ hoàn thiện

| Nhóm | Màn ✅ Hoàn chỉnh | 🟡 Một phần | 🔴 Placeholder |
|---|---|---|---|
| Auth | Login, Register, Role Picker, Forgot Password, Splash | — | — |
| Dashboard | Dashboard | — | — |
| Profile | Profile, Personal Info, Change Password, Delete Account, Help, Privacy, Terms | Notification Preferences, Consent (chỉ local) | My Tickets, Feedback, Data Request, Force Update (chưa mở store) |
| Properties | Toàn bộ 11 màn CRUD cơ sở | — | — |
| Rooms | Room List, Room Detail | (lọc ngày/khách client-side) | — |
| Bookings | Hold Room, Booking List | — | — |
| Calendar | Booking Calendar, Owner Calendar | — | — |
| Front-desk | Lễ tân (nhận/trả phòng) | — | — |
| Reports | Report | — | — |
| Staff | Staff Management, Invite Accept | — | — |
| Notifications | Notification List, Detail | — | — |
| Admin | Admin Hub, User List, User Form, KYC List, KYC Detail, **Khiếu nại (disputes)**, **Lịch sử kiểm duyệt (audit-log)** | Role Permission (lưu local) | — |
| Verify | Toàn bộ 10 màn KYC + thanh toán VietQR | — | (vài text demo trong timeline) |

**Cần BE bổ sung endpoint mới (FE chưa nối được vì BE chưa có):**
- **My Tickets** (`/profile/tickets`) — chưa có endpoint support ticket.
- **Feedback / Report** (`/profile/feedback`) — chưa có endpoint gửi phản hồi.
- **Data Request / GDPR export** (`/profile/data-request`) — chỉ có `DELETE /users/me`, chưa có export.
- **Consent** (`/profile/consent`) — chưa có endpoint lưu consent.
- **Notification Preferences** (`/profile/notifications`) — chưa có endpoint lưu tuỳ chọn.

**FE còn nợ (có endpoint, chưa hoàn thiện đúng):**
- **Role Permission** (`/admin/role-permissions`) — đang lưu `SharedPreferences` theo ROLE; BE có `GET/PUT /permissions/:userId` nhưng theo TỪNG SALE user (model khác) → cần redesign UI gán quyền cho từng nhân viên.
- Endpoint check-in/check-out thật (hiện Lễ tân suy ra từ `checkinDate`/`checkoutDate`).
- Notification: filter theo loại đang client-side; màn detail phụ thuộc list đã load (không có endpoint detail riêng).

**✅ Đã nối API trong đợt này:**
- **Khiếu nại** (`/admin/abuse-reports`) → `GET /admin/disputes` (§13) — có filter trạng thái, loading/error/empty.
- **Lịch sử kiểm duyệt** (`/admin/moderation-audit`) → `GET /admin/audit-log` (§14) — nhãn action tiếng Việt.
- **Force Update** → mở App Store thật từ `storeUrl.ios` (dialog `showAppUpdatePrompt` vốn đã đúng; màn `/update-required` standalone nay cũng mở store).

---

## 2. Bảng endpoint hợp nhất

| Method + Path | Dùng ở |
|---|---|
| `POST /auth/login` → `GET /auth/profile` | Login |
| `POST /auth/register` → `GET /auth/profile` | Register |
| `POST /auth/google` / `POST /auth/apple` → `GET /auth/profile` | Login, Register, Role Picker |
| `POST /auth/forgot-password`, `POST /auth/reset-password` | Forgot Password |
| `POST /auth/change-password` | Change Password |
| `POST /auth/logout` | Profile (logout), Delete Account |
| `GET /auth/profile` | Auth refresh, Dashboard, app resume |
| `GET /dashboard/stats` | Dashboard |
| `GET /users`, `GET /users/my-staff`, `GET /users/:id`, `POST /users`, `PUT /users/:id`, `DELETE /users/me` | User mgmt, Profile edit, Delete account |
| `GET /properties`, `GET /properties/public`, `GET /properties/:id`, `POST /properties`, `PATCH /properties/:id`, `DELETE /properties/:id` | Properties, Rooms |
| `PUT /properties/:id/prices` | Property Pricing |
| `POST/DELETE/PATCH /properties/:id/images[...]` | Property Images |
| `GET /bookings`, `POST /bookings/hold`, `PATCH /bookings/:id/confirm`, `PATCH /bookings/:id/cancel` | Bookings, Front-desk |
| `GET /calendar/public-grid`, `GET /calendar/grid`, `POST/DELETE /calendar/lock`, `PATCH /calendar/sold`, `GET /calendar/admin-contact` | Calendar, Hold Room |
| `GET /reports` | Report |
| `GET /staff`, `DELETE /staff/:userId`, `GET/POST/DELETE /staff/invites[...]`, `GET /staff/invites/verify/:token`, `POST /staff/invites/accept` | Staff |
| `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` | Notifications |
| `GET /admin/kyc/queue`, `GET /kyc/submissions/:id`, `POST /admin/kyc/submissions/:id/approve`, `POST /admin/kyc/submissions/:id/reject` | Admin KYC |
| `GET /admin/disputes`, `GET /admin/audit-log` | Admin Khiếu nại + Lịch sử kiểm duyệt |
| `POST /kyc/upload-cccd-front`, `/upload-cccd-back`, `/upload-selfie`, `GET /kyc/status`, `POST /kyc/submit`, `POST /kyc/submissions/:id/resubmit` | Verify KYC |
| `GET /billing/plans`, `POST /payments/initiate`, `POST /payments/renew`, `GET /payments/:id/status`, `GET /payments/history`, `POST /payments/:id/refund` | Verify Subscription |
| `GET /app/version` | Force Update check |
| `POST/DELETE /devices` | FCM register/unregister |

---

# 3. Chi tiết từng feature

## AUTH

App B2B (chỉ OWNER + SALE). State qua `AuthNotifier` (`authProvider`); data từ `AuthRepository`.

### Splash — `/splash`
- **Chức năng**: Màn khởi động + animation; chờ `authProvider._init()` (đọc token đã lưu + verify) rồi điều hướng.
- **Cách dùng**: Tự mở khi khởi chạy. Timer tối thiểu 1800ms → `isLoggedIn` ? `/dashboard` : `/login`.
- **API**: Gián tiếp `GET /auth/profile` (verify token).
- **Hiển thị**: Logo, ring pulse, sóng nền, loading dots.
- **Trạng thái**: ✅

### Login — `/login`
- **Chức năng**: Đăng nhập email/SĐT + mật khẩu, hoặc Google/Apple. Có "Ghi nhớ đăng nhập".
- **Cách dùng**: Mặc định khi chưa đăng nhập. Link sang `/forgot-password`, `/register`, `/staff/accept`. Google/Apple user mới → `/auth/role-picker`.
- **API**: `POST /auth/login` / `POST /auth/google` / `POST /auth/apple` → đều `GET /auth/profile`.
- **Hiển thị**: Form email + password (toggle ẩn/hiện), Remember me, nút Google + Apple (Apple chỉ iOS), nền sóng.
- **Cần gì**: identifier (tự normalize +84/84→0) + mật khẩu. Lưu ý: BE DTO login còn `@IsEmail()` nên SĐT có thể trả 400 tới khi BE deploy field `identifier`.
- **Trạng thái**: ✅

### Register — `/register`
- **Chức năng**: Đăng ký chủ homestay (role cứng OWNER; SALE chỉ qua invite). Hỗ trợ Google.
- **Cách dùng**: Từ Login. Tạo xong KHÔNG auto-login: clear token → snackbar → `/login`.
- **API**: `POST /auth/register` (header anti-spam `X-Device-Id`) → `GET /auth/profile`; `POST /auth/google`.
- **Cần gì**: name, email, password (role=OWNER). BE giới hạn 3 tài khoản/24h/device.
- **Trạng thái**: ✅

### Role Picker — `/auth/role-picker`
- **Chức năng**: Sau Google/Apple với user mới (`isNewUser`), chọn role rồi gọi lại endpoint OAuth kèm role.
- **Cách dùng**: Push khi outcome `GoogleSignInNeedsRole`. Chọn role → hoàn tất → router redirect `/dashboard`.
- **API**: `POST /auth/google` / `POST /auth/apple` (lần 2, kèm role) → `GET /auth/profile`.
- **Cần gì**: `idToken` + `GoogleProfile` + provider từ bước trước.
- **Trạng thái**: ✅

### Forgot Password — `/forgot-password`
- **Chức năng**: Reset 2 bước: (1) nhập email/SĐT nhận mã, (2) token + mật khẩu mới.
- **API**: `POST /auth/forgot-password` `{identifier}`; `POST /auth/reset-password` `{token, newPassword}`.
- **Trạng thái**: ✅ (phụ thuộc BE gửi token).

---

## DASHBOARD

### Dashboard — `/dashboard`
- **Chức năng**: Tổng quan KPI (tổng phòng, trống, đang ở, check-out hôm nay, doanh thu tháng/hôm nay), quick actions, booking gần đây, banner KYC + subscription + cảnh báo SALE chưa được gán.
- **Cách dùng**: Landing sau login. Pull-to-refresh → invalidate stats + bookings + `refreshProfile()`. Quick actions → `/bookings`, `/front-desk`, `/front-desk?tab=departures`, `/properties/new` (nếu `canManageProperty`), `/staff/manage` (OWNER). SALE thấy shortcut `/rooms`, `/calendar` (khóa nếu chưa active).
- **API**: `GET /dashboard/stats`; `GET /auth/profile` (pull-refresh); `GET /bookings` (booking gần đây).
- **Hiển thị**: Header (avatar, chuông → `/notifications`), 4 KPI card (global + của tôi), revenue card, quick actions cuộn ngang, booking gần đây, các banner điều kiện (`_VerifyCTABanner`, `_SubscriptionBanner` 4 biến thể trial/active/past_due/cancelled, banner SALE chưa gán).
- **Cần gì**: Đăng nhập. `currentUserProvider` quyết định UI theo role.
- **Trạng thái**: ✅ (dữ liệu thật, không mock).

---

## PROFILE

Hub: `ProfileScreen` (`/profile`).

### Profile — `/profile`
- **Chức năng**: Hub tài khoản: info user, sửa hồ sơ/đổi mật khẩu, mục KYC + Gói (OWNER), toggle dark mode, link hỗ trợ/pháp lý, đăng xuất.
- **API**: Đọc `currentUserProvider`. Logout: `POST /auth/logout` (+ Google signOut + FCM unregister).
- **Trạng thái**: ✅

### Personal Info — `/profile/edit`
- **Chức năng**: Sửa tên, SĐT, giới tính, ngày sinh (email chỉ ADMIN sửa).
- **API**: `PUT /users/:id` (gửi name, phone, gender, [email/dob]).
- **Hiển thị**: Form + `PhoneInput`, date picker.
- **Trạng thái**: ✅

### Change Password — `/profile/change-password`
- **API**: `POST /auth/change-password` `{currentPassword, newPassword}`.
- **Trạng thái**: ✅

### Help / FAQ — `/profile/help`
- **Chức năng**: Liên hệ (gọi/email qua `url_launcher`) + FAQ accordion **tĩnh**.
- **API**: Không. Đích đến của banner subscription past_due.
- **Trạng thái**: ✅ (FAQ tĩnh đúng mục đích).

### Notification Preferences — `/profile/notifications`
- **Chức năng**: Bật/tắt nhóm thông báo (Booking/Payment/System/Giờ yên lặng).
- **API**: Không — lưu `SharedPreferences`.
- **Trạng thái**: 🟡 (chưa sync server).

### My Tickets — `/profile/tickets`
- **Chức năng**: Danh sách yêu cầu hỗ trợ.
- **Hiển thị**: 2 ticket **hardcode** (HT-1024, HT-1009).
- **Trạng thái**: 🔴 Placeholder.

### Feedback / Report — `/profile/feedback`
- **Chức năng**: Gửi phản hồi/báo lỗi (danh mục + nội dung + device info).
- **API**: Không gửi lên server — chỉ `AnalyticsService.logEvent` + snackbar.
- **Trạng thái**: 🔴 Placeholder.

### Data Request — `/profile/data-request`
- **Chức năng**: Yêu cầu xuất dữ liệu cá nhân (GDPR). **Không có lối vào từ Profile** (chỉ route trực tiếp).
- **API**: Không — nút hiện snackbar, lịch sử giả.
- **Trạng thái**: 🔴 Placeholder.

### Consent — `/profile/consent`
- **Chức năng**: Quản lý consent KYC (bắt buộc) + marketing. **Không có lối vào từ Profile**.
- **API**: Không — `SharedPreferences`.
- **Trạng thái**: 🟡 (chưa sync server).

### Delete Account — `/profile/delete-account`
- **Chức năng**: Tự xoá tài khoản (Apple 5.1.1(v) + GDPR). Gõ "XOA" + checkbox xác nhận.
- **API**: `DELETE /users/me` `{reason?}` → `POST /auth/logout`.
- **Trạng thái**: ✅ (BE cần cho phép self-delete; 403 → hiện lỗi).

### Privacy Policy — `/profile/privacy` / Terms — `/profile/terms`
- **Chức năng**: Hiển thị nội dung tĩnh.
- **Trạng thái**: ✅ (tĩnh đúng mục đích).

### Force Update — `/update-required`
- **Chức năng**: Chặn khi version hết hỗ trợ, yêu cầu cập nhật.
- **API**: Check qua `GET /app/version`; nút "Cập nhật ngay" **mở App Store** từ `storeUrl.ios` (re-fetch qua `AppVersionService`). Luồng chính `showAppUpdatePrompt` (dialog từ main.dart) vốn đã mở store đúng.
- **Trạng thái**: ✅.

---

## PROPERTIES

> "property"/"homestay"/"room" = cùng thực thể. List dùng `homestayListProvider`; màn chi tiết/sửa dùng `roomDetailProvider`+`roomActionsProvider` (`RoomModel`). `type`: 0=VILLA, 1=HOMESTAY, 2=HOTEL.

### Danh sách quản lý — `/properties` (alias `/admin/rooms`)
- **Chức năng**: Quản lý cơ sở/phòng (OWNER/ADMIN/SALE); 4 tab loại + tìm kiếm + tạo mới.
- **Cách dùng**: Bottom nav "Quản lý". Tap card → `/properties/:id`. FAB `+` → `/properties/new` (chốt KYC).
- **API**: `GET /properties?includeInactive=true`. FAB chỉ điều hướng (kiểm tra `kycStatus` cục bộ).
- **Cần gì**: FAB chỉ khi `canManageProperty`; SALE bị guard chặn mọi route con mutate.
- **Trạng thái**: ✅

### Thêm cơ sở — `/properties/new`
- **Chức năng**: Form 1 trang tạo cơ sở đầy đủ (loại, ảnh, thông tin, sức chứa, bảng giá, phụ thu, tiện nghi, chính sách huỷ, quy định).
- **API**: `POST /properties`; nếu có ảnh → `POST /properties/{id}/images` (multipart).
- **Cần gì**: bắt buộc `code`; ADMIN/OWNER; OWNER phải KYC approved.
- **Trạng thái**: ✅

### Quản lý cơ sở — `/properties/:id`
- **Chức năng**: Header ảnh bìa + tên, toggle Hoạt động/Tạm ngưng, menu 8 mục con, nút Xoá.
- **API**: `GET /properties/{id}`; toggle → `PATCH /properties/{id}`; xoá → `DELETE /properties/{id}`.
- **Trạng thái**: ✅

### Các màn con (đều: `GET /properties/{id}` để load → lưu)
| Màn | Route | Lưu qua |
|---|---|---|
| Thông tin chi tiết | `/properties/:id/info` | `PATCH /properties/{id}` |
| Tiện ích | `/properties/:id/amenities` | `PATCH` (amenities) |
| **Bảng giá** | `/properties/:id/pricing` | **`PUT /properties/{id}/prices`** |
| Ảnh căn | `/properties/:id/images` | `POST` / `DELETE` / `PATCH .../cover` |
| Dịch vụ | `/properties/:id/services` | `PATCH` (services) |
| Quy định | `/properties/:id/rules` | `PATCH` (rules) |
| Vị trí | `/properties/:id/location` | `PATCH` (address, mapLink) |
| Chính sách huỷ | `/properties/:id/cancellation` | `PATCH` (cancellationPolicy 0/1/2) |
- **Trạng thái**: ✅ tất cả.

---

## ROOMS

### Danh sách phòng (xem chéo) — `/rooms`
- **Chức năng**: Phòng công khai để SALE/chủ nhà xem chéo; 4 tab loại + tìm kiếm + lọc (view, sắp xếp giá, ngày, số khách).
- **API**: `GET /properties/public` (lọc client-side `isActive`). Filter ngày/khách **client-side**, không query availability BE.
- **Cách dùng**: Bottom nav "Phòng". Tap card → `/rooms/:id`.
- **Trạng thái**: ✅ (lọc availability thuần client-side).

### Chi tiết phòng — `/rooms/:id`
- **Chức năng**: Gallery ảnh (PageView + PhotoView fullscreen), thông tin, tiện ích, địa chỉ, mô tả, quy định, bảng giá 4 ô, chia sẻ text, nút "Tạo booking".
- **API**: `GET /properties/{id}`. Nút "Tạo booking" → `/rooms/:id/hold`. Share dùng `share_plus`.
- **Trạng thái**: ✅

---

## BOOKINGS

### Giữ phòng — `/rooms/:id/hold`
- **Chức năng**: Tạo booking giữ 30 phút: chọn ngày, **kiểm tra xung đột lịch**, tự tính cọc 50%, nhập tên/SĐT/ghi chú khách.
- **API**: `GET /properties/{id}`; `GET /calendar/public-grid` (check trùng ngày); `POST /bookings/hold`.
- **Hiển thị**: Card phòng, 2 nút ngày, banner cảnh báo xung đột (đỏ) — **nút submit disable nếu trùng**, form khách (`PhoneInput.validateOptional`, cọc `VndInputFormatter`).
- **Trạng thái**: ✅

### Quản lý Booking — `/bookings`
- **Chức năng**: Danh sách booking + chip lọc trạng thái (Tất cả/Đang giữ/Đã đặt/Đã huỷ); HOLD có nút Huỷ + Xác nhận + đếm ngược.
- **Cách dùng**: Icon 🛎 lễ tân ở header → `/front-desk`. Avatar → `/profile`.
- **API**: `GET /bookings`; Xác nhận → `PATCH /bookings/{id}/confirm`; Huỷ → `PATCH /bookings/{id}/cancel`. Lọc client-side.
- **Cần gì**: "Xác nhận" chỉ khi `user.canEdit`.
- **Trạng thái**: ✅ (lưu ý nhỏ: card hiển thị `propertyName` 2 lần).

---

## CALENDAR

> 2 màn dùng chung `calendarGridProvider` (auto-refresh 30s) + `CalendarGridWidget`, phân biệt `isPublic`.

### Lịch Booking (công khai) — `/calendar`
- **Chức năng**: Lịch tổng hợp tất cả phòng (xem-only), tuần/tháng, lọc loại; tap ô → modal liên hệ admin (Zalo/gọi); chia sẻ ảnh/link.
- **API**: `GET /calendar/public-grid?startDate&endDate&type`; `GET /calendar/admin-contact`. Share dùng `screenshot`+`share_plus`.
- **Trạng thái**: ✅

### Lịch phòng của tôi (quản lý) — `/admin/owner-calendar`
- **Chức năng**: Lịch các căn của user + lock/giữ/đã bán/mở khoá (BE scope theo role).
- **API**: `GET /calendar/grid` (Bearer); Khoá/Giữ → `POST /calendar/lock` (status 0=LOCKED/1=HOLD); Mở khoá → `DELETE /calendar/lock`; Đã bán → `PATCH /calendar/sold`.
- **Cần gì**: quyền quản lý (route `/admin`).
- **Trạng thái**: ✅

---

## FRONT-DESK (Lễ tân)

### Lễ tân — `/front-desk` (`?tab=departures`)
- **Chức năng**: Gom booking theo ngày thành 2 tab: **Nhận phòng** (`checkinDate`=ngày) / **Trả phòng** (`checkoutDate`=ngày); gọi khách + xác nhận HOLD đang đến.
- **Cách dùng**: Vào từ icon 🛎 ở `BookingListScreen`. Điều hướng ngày bằng pill prev/next hoặc date picker.
- **API**: `GET /bookings` (gom/lọc client-side); Xác nhận → `PATCH /bookings/{id}/confirm`. Gọi khách → `tel:` (url_launcher).
- **Hiển thị**: Header gradient + bộ chọn ngày, tab segmented có badge đếm, card (avatar, timeline nhận→trả, chip khách/cọc/ghi chú, nút Gọi/Xác nhận). Loại bỏ booking huỷ.
- **Trạng thái**: ✅ — **giải pháp tạm**: BE không có status checked-in/out riêng nên suy ra từ ngày.

---

## REPORTS

### Báo cáo — `/reports`
- **Chức năng**: KPI kinh doanh theo kỳ (doanh thu, lấp đầy, ADR, booking) + biểu đồ xu hướng, phân bố trạng thái, top phòng, đánh giá khách, booking gần đây.
- **Cách dùng**: Chip kỳ (Hôm nay/Tuần/Tháng/Năm/**Tuỳ chỉnh**); "Tuỳ chỉnh" → date-range picker → chip khoảng (sửa lại được). Pull-to-refresh. Booking gần đây phân trang 5/trang client-side.
- **API**: `GET /reports?period&from&to&month&year` (chỉ gửi from/to khi period=custom & đủ 2 giá trị, tránh 400).
- **Hiển thị**: 4 KPI card (delta % vs kỳ trước), `RevenueTrendChart` (line, 3 metric), `DayOfWeekChart` (heatmap), `LengthOfStayChart` (bar), `StatusDonutChart`, top phòng (podium), `PropertyRatingsSection` (rating tổng + phòng yêu thích + 3 review), `CriteriaBreakdownCard` (6 tiêu chí), booking gần đây.
- **Trạng thái**: ✅ (hỗ trợ cả BE mới `ratingSummary` lẫn legacy).

---

## STAFF

### Quản lý nhân viên — `/staff/manage`
- **Chức năng**: OWNER xem nhân viên SALE + quản lý lời mời (mời/huỷ/xoá). 2 tab "Nhân viên" / "Lời mời".
- **API**: `GET /staff?isActive=true`; `GET /staff/invites?status=`; `POST /staff/invites` `{email}`; `DELETE /staff/invites/:id`; `DELETE /staff/:userId`.
- **Cần gì**: role **OWNER** (guard chặn non-OWNER → `/dashboard`).
- **Trạng thái**: ✅

### Chấp nhận lời mời (public) — `/staff/accept?token=`
- **Chức năng**: Người được mời verify token (hoặc mã ngắn HL-XXXXXX) → tạo tài khoản SALE bằng Google hoặc email/password. **Không cần login** (whitelist).
- **API**: `GET /staff/invites/verify/:token`; `POST /staff/invites/accept` (`method: google|password`). Response `{accessToken, refreshToken, user}` → lưu SecureStorage.
- **Trạng thái**: ✅

---

## NOTIFICATIONS

### Danh sách — `/notifications`
- **Chức năng**: Toàn bộ thông báo, lọc theo loại (booking/payment/system), đánh dấu đã đọc tất cả, tap → detail.
- **API**: `GET /notifications`; `GET /notifications/unread-count` (badge); `PATCH /notifications/read-all`. Filter **client-side**.
- **Trạng thái**: ✅

### Chi tiết — `/notifications/:id`
- **Chức năng**: Resolve từ list provider (BE **không có** endpoint detail riêng), auto mark-read khi mở, nút "mở link" điều hướng theo `(type, targetType, targetId)`.
- **API**: `PATCH /notifications/:id/read`. Không gọi API load detail.
- **Trạng thái**: ✅ — caveat: cold-start deep-link `/notifications/:id` có thể không tìm thấy model nếu list chưa fetch.

---

## ADMIN

Mọi route dưới `/admin`, guard: route nhạy cảm (abuse-reports, moderation-audit, kyc*, users/new, users/:id/edit) chỉ ADMIN. User CRUD dùng `UserRepository` (ApiResponse); Admin KYC dùng `AdminKycRepositoryImpl` (throw-style; **không còn mock**).

### Admin Hub — `/admin`
- **Chức năng**: Hub trung tâm: KPI (nhân viên/villa/phòng/booking), badge KYC chờ, nhân viên gần đây, nav tới mọi màn con.
- **API**: `staffListProvider` (ADMIN `GET /users` / OWNER `GET /users/my-staff`); `homestayListProvider(true)`; `GET /bookings`; `pendingKycCountProvider` → `GET /admin/kyc/queue` (3 status).
- **Hiển thị**: 4 KPI, nav tiles (Nhân viên, Phòng, Booking, Lịch, Phân quyền, Gói; admin-only: Duyệt KYC có badge, Báo cáo vi phạm, Lịch sử moderation), quick actions.
- **Trạng thái**: ✅

### Danh sách user — `/admin/users`
- **Chức năng**: Liệt kê user/nhân viên + filter role + toggle active.
- **API**: `staffListProvider`; toggle → `PUT /users/:id` `{isActive}`. Filter role client-side.
- **Trạng thái**: ✅

### Form user — `/admin/users/new` (tạo) / `/admin/users/:id/edit` (sửa)
- **Chức năng**: Tạo nhân viên (name/phone/password/role) hoặc xem + đổi role + active.
- **API**: Load: `GET /users/:id`; Tạo: `POST /users`; Cập nhật: `PUT /users/:id` `{role, isActive}`.
- **Trạng thái**: ✅

### KYC queue — `/admin/kyc`
- **Chức năng**: Hàng đợi hồ sơ KYC, 4 tab (Chờ duyệt/Đã duyệt/Bị từ chối/Tất cả); pending sort overdue→FIFO.
- **API**: `GET /admin/kyc/queue?status=&page=1&pageSize=100` (3 status song song). Lọc/sort client-side.
- **Trạng thái**: ✅

### KYC detail + duyệt — `/admin/kyc/:id`
- **Chức năng**: Xem CCCD trước/sau + selfie + OCR + face-match, phê duyệt hoặc từ chối (multi-select item + lý do).
- **API**: `GET /kyc/submissions/:id`; Approve → `POST /admin/kyc/submissions/:id/approve` `{trialDays:7}`; Reject → `POST /admin/kyc/submissions/:id/reject` `{reason, items}`.
- **Trạng thái**: ✅

### Phân quyền vai trò — `/admin/role-permissions`
- **Chức năng**: Ma trận quyền (module/sub-group/entry) cho SALE & OWNER.
- **API**: **KHÔNG** — `SharedPreferences` (key `role_permissions_v1_<role>`), default hardcode.
- **Trạng thái**: 🟡 (chỉ local, không enforce server).

### Khiếu nại & vi phạm — `/admin/abuse-reports`
- **Chức năng**: Hàng đợi khiếu nại/tranh chấp; filter trạng thái (Tất cả/Chờ xử lý/Đang điều tra/Đã giải quyết/Đã từ chối).
- **API**: `GET /admin/disputes?status&type&search&page&limit` (qua `disputesProvider`).
- **Hiển thị**: chip filter, card (subject, mô tả, loại tiếng Việt, số tiền, khách/cơ sở/ngày, badge trạng thái màu), loading/error/empty + pull-to-refresh.
- **Trạng thái**: ✅ (đã nối API thật).

### Lịch sử kiểm duyệt — `/admin/moderation-audit`
- **Chức năng**: Nhật ký hành động admin (read-only; BE tự ghi).
- **API**: `GET /admin/audit-log?action&targetType&actorId&search&from&to&page&limit` (qua `auditLogProvider`).
- **Hiển thị**: list entry (action map sang nhãn tiếng Việt, target, người thực hiện, lý do từ metadata, thời gian local), loading/error/empty + pull-to-refresh.
- **Trạng thái**: ✅ (đã nối API thật).

---

## VERIFY (KYC + Subscription)

Luồng xác minh danh tính + đăng ký/thanh toán cho OWNER. Guard: `kycStatus != approved` → chặn tạo/sửa property.

**State machine:**
```
draft → kycSubmitted → paymentPending → awaitingApproval → approved (→ trial → active)
                                              ↑                    │
                                       resubmit ──────────────────┘─ rejected | refunded
```
- **KYC và mua gói TÁCH RỜI**: chụp CCCD+selfie → submit ngay → pending; chọn gói + thanh toán là flow riêng sau khi admin duyệt.
- **Thanh toán = VietQR DUY NHẤT**; admin đối soát thủ công → FCM `subscription_paid`.
- **Source of truth**: `user.kycStatus`/`subscription*` (từ `/auth/profile`) cho banner + guard; `verifyFlowController` chỉ là draft local.

| Bước | Endpoint |
|---|---|
| Upload CCCD trước/sau | `POST /kyc/upload-cccd-front` / `-back` (multipart + OCR) |
| Upload selfie | `POST /kyc/upload-selfie` |
| Trạng thái KYC | `GET /kyc/status` |
| Submit duyệt | `POST /kyc/submit` |
| Poll duyệt | `GET /kyc/submissions/{id}` |
| Resubmit | `POST /kyc/submissions/{id}/resubmit` |
| Gói | `GET /billing/plans` (fallback `kDefaultPlans`) |
| Tạo phiên | `POST /payments/initiate` |
| Gia hạn | `POST /payments/renew` |
| Poll thanh toán | `GET /payments/{id}/status` |
| Lịch sử | `GET /payments/history?limit&cursor` |
| Hoàn tiền | `POST /payments/{sessionId}/refund` |

### 1. Paywall Modal — (bottom sheet, không route)
- **Chức năng**: Giải thích cần xác minh + 3 bước, CTA "Bắt đầu xác thực". Entry point của flow.
- **API**: `GET /kyc/status` (hydrate). Nút primary `clearDraft()` → push `/verify/cccd-front`.
- **Trạng thái**: ✅

### 2. CCCD Capture — `/verify/cccd-front`, `/verify/cccd-back` (`?resubmit=1`)
- **Chức năng**: Bước 1–2/4. Mở scanner hoặc gallery, upload kèm OCR/QR on-device.
- **API**: `POST /kyc/upload-cccd-front` / `-back`.
- **Cần gì**: Gallery mặt trước chạy `CccdImageValidator` (block ảnh không phải CCCD).
- **Trạng thái**: ✅

### 2b. CCCD Scanner — (push MaterialPageRoute)
- **Chức năng**: Camera + ML Kit: front = TextRecognizer match keyword auto-shutter; back = barcode QR auto-shutter. Crop 1.586:1, parse OCR/QR.
- **API**: Không (on-device).
- **Trạng thái**: ✅

### 3. Selfie Capture — `/verify/selfie` (`?resubmit=1`)
- **Chức năng**: Bước 3/4. Hiện info CCCD, chụp selfie. Upload → **submit luôn** → `/verify/pending`.
- **API**: `POST /kyc/upload-selfie` → `POST /kyc/submit`.
- **Lưu ý**: KHÔNG auto-reject theo faceMatchScore (chỉ hint cho admin).
- **Trạng thái**: ✅

### 3b. Selfie Scanner — (push MaterialPageRoute)
- **Chức năng**: ML Kit FaceDetector liveness: 4 action shuffle, giữ pose ≥1.2s, floor 5s (chống bot).
- **API**: Không.
- **Trạng thái**: ✅

### 4. Select Plan — `/verify/select-plan`
- **Chức năng**: Chọn gói (6 tier room cố định, toggle Monthly/Yearly −20%). User không nhập số phòng.
- **API**: `GET /billing/plans`.
- **Cần gì**: tier + cycle. Giá qua `PlanPriceCalculator.total` (+VAT 10%; Enterprise=0/"Contact us").
- **Trạng thái**: ✅

### 5. Payment (VietQR) — `/verify/payment`
- **Chức năng**: Tạo phiên VietQR → `BankTransferDialog` → poll back-off (3s→10s→30s→60s).
- **API**: `POST /payments/initiate` (`bank_transfer`); poll `GET /payments/{id}/status`.
- **Cách dùng**: `paid` → `refreshUserProfile()` → approved ? `/verify/subscription-detail` : `/verify/pending`. "Đóng & đợi" → về dashboard, chờ FCM.
- **Hiển thị**: `OrderSummaryCard`, 1 method tile VietQR (luôn selected), `BankTransferDialog` (QR + STK/nội dung CK có icon copy + đếm ngược `expiresAt` + "Tạo mã mới" khi hết hạn; QR ưu tiên payload EMVCo → base64 → img.vietqr.io).
- **Trạng thái**: ✅

### 6. Pending Approval — `/verify/pending`
- **Chức năng**: Chờ admin duyệt, poll 8s (pause khi background).
- **API**: `GET /kyc/submissions/{id}`; `refreshProfile()` khi đổi trạng thái. approved → `/verify/approved`; rejected → `/verify/rejected`.
- **Trạng thái**: ✅ (timeline có text demo cosmetic).

### 7. Trial Active — `/verify/approved`
- **Chức năng**: Đã duyệt + trial 7 ngày; CTA tạo homestay đầu tiên + chọn/xem gói.
- **API**: Không trực tiếp (đọc state). Chưa chọn gói → `/verify/select-plan`; đã có → `/verify/subscription-detail`; tạo homestay → `/properties/new`.
- **Trạng thái**: ✅

### 8. Rejected — `/verify/rejected`
- **Chức năng**: Lý do từ chối + checklist item cần bổ sung; resubmit hoặc hoàn tiền.
- **API**: Refund → `GET /kyc/submissions/{id}` + `POST /payments/{sessionId}/refund`; resubmit qua màn capture (`?resubmit=1`) hoặc `POST /kyc/submissions/{id}/resubmit`.
- **Trạng thái**: ✅

### 9. Subscription Detail — `/verify/subscription-detail`
- **Chức năng**: Chi tiết gói + action theo trạng thái sub thật. Chưa active → "Chọn gói"; active/past_due → "Gia hạn ngay" (VietQR) + "Đổi gói"; luôn có "Lịch sử thanh toán".
- **API**: Renew → `POST /payments/renew` → `BankTransferDialog`. Đọc `currentUserProvider`.
- **Trạng thái**: ✅

### 10. Payment History — `/verify/payment-history`
- **Chức năng**: Lịch sử thanh toán + gia hạn, phân trang cursor (auto loadMore), tổng đã thanh toán.
- **API**: `GET /payments/history?limit&cursor`.
- **Trạng thái**: ✅

---

*Tài liệu tự sinh từ source. Khi thêm/sửa màn hoặc endpoint, cập nhật lại file này + `CLAUDE.md`.*
