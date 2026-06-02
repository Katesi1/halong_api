# Webhalong24h Manager — Frontend Spec for Backend Team

> Tài liệu này mô tả toàn bộ trang, hành động (Server Action) và endpoint REST mà FE đang/đã dự kiến gọi. Dùng để BE team đối chiếu spec hiện có với thực tế FE, từ đó bổ sung endpoint còn thiếu.
>
> **Stack FE:** Next.js 15 App Router · React 19 · Clean Architecture (core / application / infrastructure / app).
> **Base URL hiện tại:** `http://api.halong24h.com` (không có prefix `/api/v1`).
> **Auth:** access token JWT (15 phút) + refresh token (7 ngày) trong httpOnly cookie. Mọi request gắn `Authorization: Bearer <accessToken>`.
> **Response envelope BE chuẩn:**
> ```json
> { "success": true, "message": "...", "data": <T> }
> { "success": false, "statusCode": 400, "message": "...", "errors": {...}, "path": "...", "timestamp": "..." }
> ```

---

## 0. Kí hiệu

- ✅ **LIVE** — FE đang gọi BE thật, hoạt động ổn định.
- 🟡 **MOCK** — FE đang dùng mock in-memory. Sẵn sàng swap qua API khi BE bổ sung.
- ❓ **PARTIAL** — Có endpoint nhưng FE phát hiện chưa đủ field / hành vi sai.
- 🔒 **Auth required**. Vai trò: `ADMIN(0)`, `OWNER(1)`, `SALE(2)`, `CUSTOMER(3)`.

---

## 1. Tóm tắt nhanh — module nào còn thiếu

| Module | Trạng thái | Ưu tiên |
|---|---|---|
| Auth | ✅ LIVE | — |
| Properties (CRUD + images + prices) | ✅ LIVE | — |
| Dashboard stats / Reports | ✅ LIVE | — |
| Bookings | ❓ PARTIAL — chỉ có `GET /bookings`, mutations chưa xác minh | **HIGH** |
| Notifications | ✅ LIVE | — |
| Staff (invites + members) | ❓ PARTIAL — `GET /staff/invites` trả 403 cho OWNER thật | **HIGH** |
| KYC (owner side) | ❓ PARTIAL — có `GET /kyc/status`, upload qua app mobile | Medium |
| Calendar (grid + lock) | 🟡 MOCK | **HIGH** |
| Payments / Subscription | 🟡 MOCK | **HIGH** |
| Disputes | 🟡 MOCK | Medium |
| KYC admin (queue + approve/reject) | 🟡 MOCK | Medium |
| Admin Users (ban/unban/role/plan) | 🟡 MOCK | Medium |
| Reviews moderation | 🟡 MOCK | Low |
| Audit log | 🟡 MOCK | Low |
| Messages / Chat | 🟡 MOCK | Low |
| Leads | 🟡 MOCK | Low |
| Admin emails (template + test send) | 🟡 MOCK | Low |
| Housekeeping (HK tasks + issues) | 🟡 MOCK (web giám sát; app mobile sẽ kết nối) | Low |

---

## 2. Cấu trúc Routes

### 2.1 Admin (RoleCode 0)

| Path | Mục đích chính |
|---|---|
| `/admin` | Dashboard tổng quan: stats, bookings mới, biểu đồ doanh thu/role |
| `/admin/audit-log` | Audit log — filter loại hành động/đối tượng/search |
| `/admin/bookings` | List bookings toàn hệ; filter status/property/date |
| `/admin/disputes` | List dispute; filter status/type |
| `/admin/disputes/[id]` | Chi tiết dispute; resolve/reject |
| `/admin/kyc` | Queue hồ sơ KYC chờ duyệt |
| `/admin/kyc/[id]` | Chi tiết KYC + approve/reject |
| `/admin/payments` | Subscription tracker: mark paid / freeze / unfreeze |
| `/admin/permissions` | Permission matrix (RBAC config UI — static) |
| `/admin/pricing` | Cấu hình gói/giá platform — static |
| `/admin/properties` | List cơ sở toàn hệ; moderation approve/reject/suspend |
| `/admin/properties/[id]` | Chi tiết property + moderation |
| `/admin/reports` | Báo cáo doanh thu |
| `/admin/reviews` | Moderation reviews: hide/restore |
| `/admin/settings` | Cài đặt hệ thống |
| `/admin/settings/emails` | Email template manager + test send |
| `/admin/users` | List user toàn hệ |
| `/admin/users/[id]` | Chi tiết user + ban/unban/revoke/reset password/change role/plan |

### 2.2 Host (RoleCode 1 = OWNER, 2 = SALE)

| Path | Mục đích chính |
|---|---|
| `/host` | Dashboard host: stats + bookings + notifications |
| `/host/billing` | Hoá đơn/thanh toán của host |
| `/host/bookings` | List bookings của host |
| `/host/bookings/[id]` | Chi tiết booking; confirm/markPaid/cancel + open dispute |
| `/host/bookings/new` | Form tạo HOLD booking |
| `/host/calendar` | Calendar grid theo cơ sở/ngày; lock/unlock/markSold/bulkLock |
| `/host/guests` | Danh sách khách (chưa wire) |
| `/host/hk` | Housekeeping tasks + issues (giám sát; mobile cập nhật) |
| `/host/kyc` | Owner xem trạng thái KYC |
| `/host/leads` | List lead inbound từ public site |
| `/host/leads/[id]` | Chi tiết lead |
| `/host/messages` | Inbox conversations |
| `/host/messages/[id]` | Khung chat 1 conversation |
| `/host/properties` | List cơ sở của owner/sale |
| `/host/properties/[id]` | Chi tiết property; update/prices/delete |
| `/host/properties/[id]/images` | Quản lý ảnh: upload/delete/setCover |
| `/host/properties/new` | Form tạo property |
| `/host/settings` | Cài đặt tài khoản + đổi mật khẩu |
| `/host/settings/subscription` | Owner xem gói + STK chuyển khoản |
| `/host/staff` | Quản lý SALE: invite/cancel/list/remove |

---

## 3. Auth & RBAC

### 3.1 Endpoint Auth (✅ đã có)

| Method | Path | Mô tả | Body | Trả về |
|---|---|---|---|---|
| `POST` | `/auth/login` | Login email/password | `{ email, password }` | `{ accessToken, refreshToken, user }` |
| `POST` | `/auth/register` | Đăng ký owner/sale | `{ fullName, email, phone?, password, role }` | profile |
| `POST` | `/auth/google` | Đăng nhập Google ID token | `{ idToken, role? }` | tokens + user |
| `POST` | `/auth/refresh` | Refresh access token | `{ refreshToken }` | tokens mới |
| `POST` | `/auth/logout` | Logout (revoke refresh) | — | `{ success }` |
| `POST` | `/auth/forgot-password` | Gửi link reset | `{ identifier }` | `{ success }` |
| `POST` | `/auth/reset-password` | Đặt lại mật khẩu | `{ token, newPassword }` | `{ success }` |
| `POST` | `/auth/change-password` | Đổi mật khẩu (đang login) | `{ currentPassword, newPassword }` | `{ success }` |
| `GET` | `/auth/profile` | Lấy profile hiện tại | — | `User { id, fullName, email, phone, role, ownerId?, kycStatus, permissions }` |

### 3.2 Guard logic ở FE (tham chiếu — BE tự enforce lại)

| Guard | Cho ai qua |
|---|---|
| `requireAdmin` | role = 0 |
| `requireOwner` | role = 1 |
| `requireManagerRole` | role ∈ {0, 1, 2} (chặn CUSTOMER) |
| `requireOwnerOfProperty(propertyId)` | ADMIN bypass · OWNER nếu `ownerId === user.id` · SALE nếu `ownerId === user.ownerId` |

> **YÊU CẦU BE**: profile response phải có field `ownerId` cho role SALE để FE biết nó thuộc owner nào.

---

## 4. Module spec chi tiết

### 4.1 Properties (✅ LIVE)

| Method | Path | Trigger | Role |
|---|---|---|---|
| `GET` | `/properties?ownerId&isActive&search&page&limit` | list FE/admin | `requireManagerRole` |
| `GET` | `/properties/:id` | chi tiết | `requireOwnerOfProperty` |
| `POST` | `/properties` | tạo mới | `requireManagerRole` (FE: cần `canCreateProperty`) |
| `PATCH` | `/properties/:id` | update + moderation (admin set `isActive`) | `requireOwnerOfProperty` / `requireAdmin` |
| `DELETE` | `/properties/:id` | xoá | `requireOwnerOfProperty` |
| `PUT` | `/properties/:id/prices` | cập nhật ma trận giá | `requireOwnerOfProperty` |
| `POST` | `/properties/:id/images` (multipart) | upload nhiều ảnh | `requireOwnerOfProperty` |
| `DELETE` | `/properties/:propertyId/images/:imageId` | xoá ảnh | `requireOwnerOfProperty` |
| `PATCH` | `/properties/:propertyId/images/:imageId/cover` | set ảnh bìa | `requireOwnerOfProperty` |

**Đề xuất bổ sung**:
- Thêm field `moderationStatus: 'pending' | 'approved' | 'rejected'` và `rejectedReason: string | null` trong response property — hiện FE phải suy ra từ `isActive` nên không phân biệt được "bị từ chối" vs "tạm ngưng".

### 4.2 Dashboard & Reports (✅ LIVE)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/dashboard/stats` | Stats tổng hợp cho header dashboard |
| `GET` | `/reports?period=day\|week\|month&from&to` | Báo cáo doanh thu theo kỳ |

### 4.3 Bookings (❓ PARTIAL)

| Method | Path | Mô tả | State |
|---|---|---|---|
| `GET` | `/bookings?status&propertyId&from&to&page&limit` | List | ✅ |
| `GET` | `/bookings/:id` | Chi tiết | ❓ FE đoán; cần BE xác nhận |
| `POST` | `/bookings/hold` | Tạo HOLD booking | ❌ **THIẾU** |
| `PATCH` | `/bookings/:id/confirm` | HOLD → CONFIRMED | ❌ **THIẾU** |
| `PATCH` | `/bookings/:id/paid` body `{ amount? }` | Ghi nhận đã thu tiền | ❌ **THIẾU** |
| `PATCH` | `/bookings/:id/cancel` body `{ reason? }` | Huỷ booking | ❌ **THIẾU** |

**Body `POST /bookings/hold` đề xuất:**
```ts
{
  propertyId: string;
  roomTypeId?: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  guests: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  channel: 'direct' | 'ota' | 'walkin';
  amount: number;    // VND
  depositAmount?: number;
  notes?: string;
}
```

### 4.4 Notifications (✅ LIVE)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/notifications?type&isRead&page&limit` | List |
| `GET` | `/notifications/unread-count` | Badge |
| `PATCH` | `/notifications/:id/read` | Đánh dấu đọc 1 |
| `PATCH` | `/notifications/read-all` | Đánh dấu đọc tất cả |

### 4.5 Staff / Invites (❓ PARTIAL — gặp lỗi 403)

**Hiện tại**: `GET /staff/invites` trả `403` cho OWNER thực, FE phải tạm switch về mock. BE cần verify scope.

| Method | Path | Mô tả | Role |
|---|---|---|---|
| `GET` | `/staff?isActive` | List nhân viên thuộc owner | OWNER |
| `DELETE` | `/staff/:userId` | Gỡ nhân viên | OWNER |
| `GET` | `/staff/invites?status` | List invite | OWNER |
| `POST` | `/staff/invites` | Tạo invite | OWNER |
| `DELETE` | `/staff/invites/:id` | Huỷ invite | OWNER |

**Body `POST /staff/invites` đề xuất:**
```ts
{
  email?: string;       // email hoặc phone bắt buộc 1 trong 2
  phone?: string;
  fullName?: string;
  permissions: {
    properties: { canCreate, canUpdate, canDelete, canViewPrices };
    bookings:   { canCreate, canConfirm, canCancel, canMarkPaid };
    calendar:   { canLock, canMarkSold };
    messages:   { canReply };
  };
  expiresAt?: string;   // ISO datetime
}
```

**Response:**
```ts
{ invite: StaffInvite, inviteLink: string, emailSent: boolean }
```

### 4.6 KYC (Host side — ❓ PARTIAL)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/kyc/status` | Owner xem trạng thái: `{ status: 'none'\|'pending'\|'approved'\|'rejected', rejectedReason?, submittedAt?, approvedAt? }` |

> Upload ảnh CCCD/giấy tờ thực hiện qua **app mobile**. Web chỉ xem trạng thái.

### 4.7 Calendar (🟡 MOCK — HIGH PRIORITY)

Hiện trang `/host/calendar` đã làm xong UI (grid drag-select, multi-day booking bar, bulk lock). Cần BE bổ sung:

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/calendar/grid?from=&to=&propertyIds=` | **THIẾU** — Trả `{ from, to, properties: [{ id, name, days: [{ date, status:0\|1\|2\|3, note: string\|null, bookingId?: string }] }] }` |
| `POST` | `/calendar/lock` body `{ propertyId, date }` | **THIẾU** — Khoá 1 đêm |
| `DELETE` | `/calendar/lock` body `{ propertyId, date }` (hoặc `POST /calendar/unlock`) | **THIẾU** — Mở khoá |
| `PATCH` | `/calendar/sold` body `{ propertyId, date }` | **THIẾU** — Đánh dấu bán ngoài hệ thống |
| `POST` | `/calendar/bulk` body `{ items: [{propertyId,date}], mode: 'lock'\|'unlock' }` | **NICE-TO-HAVE** — hiện FE loop từng cái, sẽ rất chậm khi user chọn 30+ ô |

**Status enum:** `0=AVAILABLE`, `1=LOCKED`, `2=HOLD`, `3=BOOKED`.

### 4.8 Payments / Subscription (🟡 MOCK — HIGH PRIORITY)

Subscription = gói chủ nhà trả cho platform (free / basic / standard / pro). Status: `paid / pending / overdue / frozen`.

| Method | Path | Mô tả | Role |
|---|---|---|---|
| `GET` | `/admin/subscriptions?status&plan&search&page` | List | ADMIN |
| `GET` | `/admin/subscriptions/:id` | Chi tiết | ADMIN |
| `GET` | `/admin/subscriptions/count-overdue` | Badge sidebar admin | ADMIN |
| `GET` | `/admin/subscriptions/sum-paid?from&to` | Tổng doanh thu kỳ | ADMIN |
| `POST` | `/admin/subscriptions/:id/mark-paid` body `{ paidAmount }` | Ghi nhận thu + gia hạn `expireAt` | ADMIN |
| `POST` | `/admin/subscriptions/:id/freeze` body `{ reason }` | Tạm khoá gói (chặn host) | ADMIN |
| `POST` | `/admin/subscriptions/:id/unfreeze` | Mở khoá | ADMIN |
| `GET` | `/subscriptions/me` | Owner/Sale xem gói của mình (resolve theo profile.ownerId) | OWNER/SALE |

**Subscription entity:**
```ts
{
  id: string;
  ownerId: string;
  plan: 'free' | 'basic' | 'standard' | 'pro';
  status: 'paid' | 'pending' | 'overdue' | 'frozen';
  amount: number;     // VND
  paidAt: string | null;
  expireAt: string | null;
  frozenReason: string | null;
  bankInfo: { accountNumber, accountName, bankCode } | null;  // STK chuyển khoản
}
```

### 4.9 Disputes (🟡 MOCK)

| Method | Path | Mô tả | Role |
|---|---|---|---|
| `GET` | `/admin/disputes?status&type&search&page` | List | ADMIN |
| `GET` | `/admin/disputes/:id` | Chi tiết | ADMIN |
| `GET` | `/admin/disputes/count-active` | Badge | ADMIN |
| `POST` | `/admin/disputes/:id/investigate` | Chuyển sang investigating | ADMIN |
| `POST` | `/admin/disputes/:id/resolve` body `{ resolution, refundAmount? }` | Đóng + phán quyết | ADMIN |
| `POST` | `/admin/disputes/:id/reject` body `{ resolution }` | Bác | ADMIN |
| `POST` | `/disputes` body `{ bookingId, type, subject, description, amount?, opener }` | OWNER/SALE/CUSTOMER mở dispute từ booking | Authenticated |

**Type enum đề xuất**: `refund_request`, `service_quality`, `damage_claim`, `no_show`, `overbooking`, `other`.

### 4.10 KYC admin (🟡 MOCK)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/admin/kyc?status&search&page` | Queue |
| `GET` | `/admin/kyc/:id` | Chi tiết + ảnh upload |
| `GET` | `/admin/kyc/count-pending` | Badge |
| `POST` | `/admin/kyc/:id/approve` | Duyệt |
| `POST` | `/admin/kyc/:id/reject` body `{ reason }` | Từ chối + lý do |

### 4.11 Admin Users (🟡 MOCK)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/admin/users?role&status&search&page&limit` | List |
| `GET` | `/admin/users/:id` | Chi tiết kèm sessions, plan, kyc |
| `POST` | `/admin/users/:id/ban` body `{ reason }` | Ban |
| `POST` | `/admin/users/:id/unban` | Unban |
| `POST` | `/admin/users/:id/revoke-sessions` | Buộc logout |
| `PATCH` | `/admin/users/:id/subscription` body `{ plan }` | Đổi gói |
| `PATCH` | `/admin/users/:id/role` body `{ role }` | Đổi vai trò |
| `POST` | `/admin/users/:id/reset-password` | Reset password (BE gửi mail link) |

### 4.12 Reviews moderation (🟡 MOCK)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/admin/reviews?status&rating&flagged&search` | List |
| `GET` | `/admin/reviews/:id` | Chi tiết |
| `GET` | `/admin/reviews/count-flagged` | Badge |
| `POST` | `/admin/reviews/:id/hide` body `{ reason }` (reason ≥ 5 ký tự) | Ẩn |
| `POST` | `/admin/reviews/:id/restore` | Khôi phục |

### 4.13 Audit log (🟡 MOCK)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/admin/audit-log?action&targetType&search&from&to&page&limit` | List entries |

**Audit entry:**
```ts
{
  id: string;
  actorId: string;
  actorName: string;
  actorRole: 0 | 1 | 2 | 3;
  action: string;          // 'property.approve' | 'user.ban' | 'kyc.reject' | ...
  targetType: 'property' | 'user' | 'booking' | 'dispute' | 'subscription' | 'review' | 'kyc';
  targetId: string;
  targetLabel: string;     // human-readable summary
  metadata: Record<string, unknown>;  // arbitrary extra
  createdAt: string;
}
```

FE đã ghi audit ở 13 admin action (approve/reject KYC, ban/unban user, revoke sessions, reset password, change subscription, approve/reject/suspend property, dispute investigate/resolve/reject). Khi BE có endpoint, FE sẽ POST song song.

### 4.14 Messages / Chat (🟡 MOCK)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/conversations?role=owner\|customer&page&limit` | List inbox |
| `GET` | `/conversations/:id` | Chi tiết + messages |
| `POST` | `/conversations` body `{ propertyId }` | Mở conversation mới |
| `PATCH` | `/conversations/:id/read` body `{ asRole }` | Đánh dấu đã đọc |
| `POST` | `/messages` body `{ conversationId, content }` | Gửi tin nhắn |

**Nice-to-have**: WebSocket `/ws/conversations/:id` push real-time.

### 4.15 Leads (🟡 MOCK)

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/leads` body `{ propertyId, roomId?, guestName, guestPhone, guestEmail?, checkIn?, checkOut?, numGuests?, message? }` | Public form submit |
| `GET` | `/leads?status&propertyId&page` | Owner list |
| `GET` | `/leads/:id` | Chi tiết |
| `PATCH` | `/leads/:id` body `{ status: 'new'\|'contacted'\|'rejected'\|'expired' }` | Cập nhật trạng thái |

### 4.16 Admin Emails (🟡 MOCK)

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/admin/emails/templates` | List 15 template key |
| `POST` | `/admin/emails/test` body `{ template, to }` | Gửi mẫu để verify rendering |

Template key đề xuất:
`welcome_owner`, `welcome_sale`, `password_reset`, `booking_confirmed`, `booking_cancelled`, `booking_paid`, `kyc_approved`, `kyc_rejected`, `staff_invite`, `subscription_due`, `subscription_overdue`, `subscription_paid`, `dispute_opened`, `review_received`, `property_approved`.

### 4.17 Housekeeping (🟡 MOCK — mobile-first)

Web `/host/hk` chỉ giám sát + giao việc. App mobile của nhân viên cập nhật trạng thái + upload ảnh.

Endpoint dự kiến:
| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/hk/tasks?propertyId&status&dueFrom&dueTo` | List task |
| `POST` | `/hk/tasks` body `{ propertyId, roomId, type:'clean'\|'inspect'\|'restock', assignedUserId?, dueAt?, notes? }` | Tạo task (owner giao việc) |
| `PATCH` | `/hk/tasks/:id` body `{ status, doneAt?, photoUrls? }` | Mobile cập nhật |
| `GET` | `/hk/issues?propertyId&status&severity` | List sự cố |
| `POST` | `/hk/issues` body `{ propertyId, roomId, category, severity, description, photoUrls? }` | Mobile báo sự cố |
| `PATCH` | `/hk/issues/:id` body `{ status }` | Owner cập nhật xử lý |

---

## 5. Error format chuẩn FE mong đợi

Khi 4xx/5xx:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": {
    "email": ["Email đã được sử dụng"],
    "password": ["Mật khẩu phải có ít nhất 8 ký tự"]
  },
  "path": "/auth/register",
  "timestamp": "2026-06-02T10:30:00.000Z"
}
```

- `message`: human-readable, FE hiển thị trực tiếp.
- `errors`: optional, mapping field → array message để FE highlight từng input form.

**Status code mapping FE đã handle:**
- `401` → tự gọi `/auth/refresh`, nếu fail → redirect `/login`.
- `403` → toast "Bạn không có quyền thực hiện thao tác này".
- `409` → mâu thuẫn (vd. trùng date), hiển thị `message` BE.
- `422` → validation, dùng `errors` field.
- `5xx` → toast "Lỗi máy chủ, vui lòng thử lại".

---

## 6. Tổng kết — Endpoint cần BE bổ sung (ưu tiên)

### High
1. **Bookings mutations** — `POST /bookings/hold`, `PATCH /bookings/:id/{confirm,paid,cancel}`.
2. **Calendar** — `GET /calendar/grid`, `POST /calendar/lock`, `DELETE /calendar/lock`, `PATCH /calendar/sold`, optionally `POST /calendar/bulk`.
3. **Staff/invites 403 fix** — verify scope cho OWNER, đảm bảo `GET /staff/invites` hoạt động.
4. **Subscriptions** — full set ở §4.8 (admin + owner self).

### Medium
5. **Disputes** — full set ở §4.9.
6. **KYC admin queue** — full set ở §4.10.
7. **Admin Users** — full set ở §4.11.
8. **Property moderation status field** — thêm `moderationStatus` + `rejectedReason`.

### Low
9. Reviews moderation, Audit log, Messages, Leads, Admin Emails, Housekeeping.

---

## 7. Liên hệ FE

Mọi câu hỏi về schema/contract trong tài liệu này, ping team Web Manager. FE cam kết khi BE ra endpoint thật, chỉ cần swap `MockXxxRepository` → `ApiXxxRepository` trong [`src/infrastructure/container.ts`](../src/infrastructure/container.ts), UI không thay đổi.
