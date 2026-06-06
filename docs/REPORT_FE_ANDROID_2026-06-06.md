# Report cho FE Android — 2026-06-06

> **From**: BE team
> **To**: FE Android team (Flutter)
> **Re**: `docs/FE_APP_ANDROID.md` v1.1.3+12 review + BE patch v1.9
> **Tham chiếu**: `docs/API_SPEC_FULL.md` §10 (Payment), §9 (KYC), §6 (Roles)
> **Severity**: P0 = chặn release, P1 = sửa trong sprint, P2 = roadmap

---

## 1. BE đã đổi gì trong patch v1.9 (FE phải sync ngay)

| # | API | Mô tả |
|---|---|---|
| 1 | `GET /payments/active` | Trả session `pending` mới nhất của user (hoặc `null`). FE dùng để rehydrate modal QR sau khi đóng/mở lại app. |
| 2 | `POST /payments/:sessionId/cancel` | Huỷ session pending. Response 409 `cannotCancel` nếu session đã `paid/expired/refunded/failed`. |
| 3 | `GET /kyc/status` thêm `latestPayment` | Bao gồm `sessionId, status, totalAmount, planId, planLabel, expiresAt, qrExpiresAt, createdAt`. `null` nếu user chưa từng tạo session. |
| 4 | `POST /payments/initiate`, `/renew`, `/active` thêm trường response | `qrExpiresAt` (Date — 15 phút), `reconcileWindowHours: 24`. |
| 5 | Plan mới `starter_test` (10.000đ/tháng, 1 phòng, VAT 0%) | Dùng cho QA / App Store / Apple review. |
| 6 | Cron auto-revert KYC submission | Khi session expired/cancelled → submission tự về `kyc_submitted`, FE chỉ cần re-poll `/kyc/status` |

Spec chi tiết: `docs/API_SPEC_FULL.md` §10.2 + changelog v1.9.

---

## 2. Bug "loading mãi ở màn chờ đối soát" — Root cause + fix

**Root cause (xác nhận BE)**:
- Khi user đóng modal QR và mở lại, FE chỉ giữ `sessionId` trong memory → mất.
- FE poll `GET /kyc/status` → nhận `paymentPending` → hiển thị màn "chờ đối soát" nhưng không có session info → spinner xoay vô hạn.
- `GET /payments/:sessionId/status` không gọi được vì không còn sessionId.

**Fix phía FE (P0)**:

| # | Việc | File gợi ý |
|---|------|-----------|
| F1 | Khi vào màn paywall / verify-payment / pending-review, gọi `GET /payments/active` trước → có data thì render modal QR + countdown, không có thì cho phép initiate mới | `verify_repository_impl.dart`, `paywall_modal.dart` |
| F2 | **Bỏ persist `sessionId`** vào secure storage. Dùng `GET /payments/active` hoặc `kyc/status.latestPayment` làm source of truth | `verify_controller.dart` |
| F3 | Countdown 15 phút dùng field mới **`qrExpiresAt`**, KHÔNG dùng `expiresAt` (24h) | `payment_session.dart` model |
| F4 | Khi `qrExpiresAt` đã qua nhưng `expiresAt` chưa qua: hiển thị label "Đang đối soát, tối đa 24h" + nút "Tôi đã chuyển khoản"; không show countdown nữa | `payment_screen.dart` |
| F5 | Khi user bấm **Đóng / Hủy / Đổi gói**: gọi `POST /payments/:sessionId/cancel` trước khi điều hướng. Nếu 409 → re-fetch `/payments/active` để sync | `payment_controller.dart` |
| F6 | Polling: 5s trong 60s đầu → 15s sau đó. Dừng khi `status != pending` hoặc khi nhận FCM `data.type == "payment"` | `payment_controller.dart` |

---

## 3. Sai lệch trong `docs/FE_APP_ANDROID.md` cần update

### 3.1 §5 Billing & Payment

Hiện ghi:
```
method FE map: vnpay_qr, bank_transfer, …
```

**Sửa**: BE chỉ chấp nhận `bank_transfer`. VNPay đã loại từ v1.4. Apple IAP đã loại từ v1.4 (`apple-iap/` module đã xoá khỏi BE — xem git status). iOS thanh toán bằng cùng flow bank_transfer như Android.

Bảng API thêm 2 dòng:
```
| GET  | /payments/active        | verify_repository_impl | Paywall hydrate, payment screen rehydrate |
| POST | /payments/:id/cancel    | verify_repository_impl | Khi đóng modal / đổi gói |
```

### 3.2 §6.9 Verify + Subscription — bảng "Luồng màn hình"

Hiện ghi:
```
5. Thanh toán | /verify/payment | POST /payments/initiate → poll GET /payments/:id/status
```

**Sửa**:
```
5a. Vào màn payment | /verify/payment | GET /payments/active → nếu có session pending: render lại; nếu null: cho chọn plan
5b. Tạo session     | (sau khi confirm plan) | POST /payments/initiate
5c. Poll status     | poll every 5–15s | GET /payments/:sessionId/status; stop khi != pending
5d. Hủy session     | nút Hủy / Đổi gói | POST /payments/:sessionId/cancel
```

### 3.3 §9.6 "Payment polling"

Thêm note: "Phân biệt `qrExpiresAt` (15 phút — countdown QR) và `expiresAt` (24h — session/đối soát). Sau `qrExpiresAt`, không cancel session, chỉ chuyển UI sang state 'đang đối soát'."

### 3.4 Plan IDs — bổ sung `starter_test`

Trong `lib/data/models/billing_plan.dart` hoặc nơi tương ứng, map thêm:
```
'starter_test' → label "Starter Test (10k)", maxRooms 1
```

Khi user chọn nút "Gói thử 10k", FE phải gửi:
```jsonc
POST /payments/initiate
{ "planId": "starter_test", "cycle": "monthly", "method": "bank_transfer", "rooms": 1, "totalAmount": 10000 }
```

**Nguyên nhân bug 658.900đ trước đó**: FE label "Starter Test 10k" nhưng `planId` gửi `rooms_5` → BE tính `rooms_5.minCharge × 1.1 VAT = 658.900`. Xác nhận lại với BE qua i18n `payment.amountMismatch` nếu sai lệch trong tương lai.

---

## 4. Vấn đề lớn về thiết kế app B2B (FE + PM cần quyết)

### 4.1 [P0] Check-in / Check-out là "filter local"

`docs/FE_APP_ANDROID.md` §6.6:
```
/bookings/check-in  → Filter local từ booking list
/bookings/check-out → Filter local từ booking list
```

Đây **không phải workflow check-in/out** mà là filter UI. Một PMS B2B thực thụ phải:
- Mutate booking status (`CONFIRMED → CHECKED_IN → COMPLETED`)
- Ghi `actualCheckinAt`, `actualCheckoutAt`
- Trigger audit log
- Optional: capture CCCD khách, damage photo, extra charges

**BE hiện chưa có endpoint** `PATCH /bookings/:id/check-in` và `/check-out`. **BE sẽ bổ sung ở sprint kế** (đã ghi vào todo). FE chuẩn bị:
- UI form check-in (input notes, photo CCCD optional)
- UI form check-out (extra charges, damage report optional)
- Status enum cần thêm `CHECKED_IN = 4`, `NO_SHOW = 5`

### 4.2 [P1] Customer mode trong app quản lý

§6.3 + §7: `POST /bookings/customer-hold` có repo nhưng UI không gọi. Mode khách (`/home`, `/search`, `/my-bookings`) chỉ xem được chứ không đặt được.

**PM quyết một trong hai**:
- **Tách bạch**: Xoá customer mode khỏi app quản lý → app này thuần B2B (host only). Customer dùng app riêng.
- **Hoàn thiện**: Wire UI cho `/bookings/customer-hold`, search → detail → hold 24h → payment. Phức tạp hơn nhưng giữ "1 app cho mọi role".

Khuyến nghị BE: **tách**. Mix product trong 1 app làm khó tracking metrics + onboarding.

### 4.3 [P1] OWNER chưa KYC bị chặn xem `/properties/:id` detail

§4.3: "OWNER `needsKyc` → chặn mọi `/properties/:id/*` mutate → redirect `/verify/cccd-front`. Cho phép `/properties` (list)".

**Sửa**: Cho phép `GET /properties/:id` (read-only detail) cả khi chưa KYC. User cần xem dữ liệu cũ (giá, ảnh, policy) trước khi quyết định pay để hoàn KYC.

### 4.4 [P2] Reports nghèo

§6.8 chỉ có `/reports?period=...`. PMS B2B cần KPI chuẩn ngành:
- Occupancy rate, ADR (Average Daily Rate), RevPAR, ALOS (Average Length of Stay)
- Channel mix, cancellation rate, no-show rate
- Export CSV/Excel/PDF

**BE sẽ bổ sung**: `/reports/occupancy`, `/reports/adr`, `/reports/revpar`, `POST /reports/export?format=csv|xlsx`. FE cần thiết kế lại screen `/reports`.

### 4.5 [P1] Không có e-invoice VAT

Theo Nghị định 123/2020/NĐ-CP, host có MST phải xuất hoá đơn điện tử. BE đã có `invoiceNumber` nhưng chưa expose PDF download.

**BE sẽ bổ sung**: `GET /payments/:sessionId/invoice` trả PDF (hoặc redirect signed URL). FE cần nút "Tải hoá đơn VAT" ở `/verify/payment-history`.

### 4.6 [P2] Không có 2FA cho ADMIN/OWNER

Tài khoản giữ tiền + dữ liệu khách. **BE roadmap**: `POST /auth/2fa/setup`, `/verify`, `/disable`. FE cần thêm `/profile/security/2fa`.

### 4.7 [P2] Bulk edit phòng

§6.5 tách 8 sub-screen. Host có 20 phòng + đổi giá theo mùa → phải vào từng phòng = phi thực tế. Cần:
- Multi-select phòng → bulk update price/availability/policy
- Template policy / amenities tái dùng

### 4.8 [P2] Chat module

§8: "Chat REST + WebSocket — app chưa có module chat". BE đã có migration `chat_messaging` (xem git status). Schema sẵn sàng — FE cần wire khi PM ưu tiên.

---

## 5. Vấn đề nhỏ / Polish

| # | Vấn đề | Hành động |
|---|--------|-----------|
| 5.1 | §9.1 Login phone — FE đang gửi key `email` cho identifier | BE đã hỗ trợ `identifier` (memory: `feedback-auth-response-shape.md`). Đổi `'email'` → `'identifier'` trong `auth_repository.dart`. |
| 5.2 | §6.10 `/admin/abuse-reports`, `/moderation-audit`, `/role-permissions` là UI placeholder | Hoặc ẩn khỏi production build, hoặc BE expose API. Đừng ship empty screen ra prod. |
| 5.3 | §6.2 `/profile/feedback`, `/tickets`, `/notifications`, `/data-request` là mock | Như trên. Đặc biệt `/profile/data-request` cần thật để compliance GDPR/Nghị định 13/2023/NĐ-CP. |
| 5.4 | §9.10 không có real-time | OK ở MVP. Khi BE wire WebSocket cho chat, dùng chung cho booking notification (event-driven thay vì poll dashboard). |
| 5.5 | KYC queue gọi 3 API parallel theo status | Chấp nhận được nhưng tốn 3 request. Khi BE optimize sang `GET /admin/kyc/queue?status[]=awaiting_approval,approved,rejected` thì FE sync. |

---

## 6. Priority summary

**P0 (chặn release v1.2):**
- F1–F6 (rehydrate payment + cancel + qrExpiresAt) — bug "loading mãi"
- Plan ID `starter_test` cho gói 10k
- 3.1/3.2/3.3 update doc FE_APP_ANDROID

**P1 (sprint kế):**
- 4.1 Check-in/Check-out workflow (cần BE bổ sung endpoint song song)
- 4.2 Quyết tách / giữ customer mode
- 4.3 KYC gate đọc detail
- 4.5 E-invoice VAT
- 5.1 Login phone identifier

**P2 (roadmap):**
- 4.4 Reports KPI
- 4.6 2FA
- 4.7 Bulk edit
- 4.8 Chat

---

## 7. Câu hỏi cho FE/PM

1. **Customer mode** trong app quản lý: tách hay hoàn thiện?
2. **Apple Sign-In** vẫn giữ chứ? (BE đã giữ `/auth/apple` cho login, chỉ bỏ IAP). FE iOS có còn build không?
3. **VietQR vs STK chuyển khoản thường**: FE có hiển thị cả 2 cho user (quét QR HOẶC nhập tay)? Nếu có, đảm bảo cả 2 dùng cùng `content` field trong session để webhook match.
4. **Update `docs/FE_APP_ANDROID.md`**: FE team tự update hay muốn BE update giúp + PR review?

---

*BE liaison: tôi (chat session 2026-06-06). Patch v1.9 đã commit pending review. Ping ngược nếu cần clarify endpoint nào.*
