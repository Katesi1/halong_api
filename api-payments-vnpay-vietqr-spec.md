# Spec — Payments (VNPay QR + VietQR Bank Transfer + History + Renewal)

> Document này mô tả các thay đổi backend cần làm để mobile (Flutter) hoàn thiện
> phần thanh toán cho luồng KYC đăng ký + gia hạn subscription.
> Mobile đã wire client theo spec này (xem section 8) — backend chỉ cần implement
> payload đúng và FE tự render.

**Owner FE:** `lib/features/verify/`
**Phụ thuộc:** đã có `BACKEND_CHANGES_REPORT.md` (KYC) + `api-kyc-implementation-spec.md`

---

## 1. Mục tiêu

Hoàn thiện 2 phương thức thanh toán + lịch sử + gia hạn:

| Phương thức | Trạng thái | Đối soát | Phí giao dịch |
|---|---|---|---|
| **VNPay QR** (instant) | Cần backend implement webhook | Tức thời (~3s) | ~1.1% / GD |
| **Bank Transfer + VietQR** | Cần backend implement đối soát | 5–30 phút (qua Casso/Sepay/IPN ngân hàng) | Free |
| **Thẻ tín dụng/ghi nợ** | **Đang lock ở UI** — chưa cần backend làm | — | — |

Frontend đã:
- Hide method `card` (badge "Đang phát triển")
- Render QR thật từ payload backend trả
- Hiển thị STK + VietQR + countdown + nút copy
- Trang lịch sử thanh toán + flow gia hạn

---

## 2. Endpoints — Tổng hợp

| Method | Path | Mô tả | Auth |
|---|---|---|---|
| POST | `/payments/initiate` | Tạo phiên thanh toán đăng ký lần đầu (đã có) | Bearer |
| POST | `/payments/renew` | **NEW** — Tạo phiên gia hạn subscription | Bearer |
| GET | `/payments/history` | **NEW** — Lịch sử giao dịch của user | Bearer |
| GET | `/payments/:sessionId/status` | Poll trạng thái (đã có) | Bearer |
| POST | `/payments/:sessionId/refund` | Hoàn tiền (đã có) | Bearer |
| POST | `/payments/vnpay/ipn` | **NEW** — Webhook IPN từ VNPay (verify HMAC) | None (public) |
| POST | `/payments/bank-webhook` | **NEW (optional)** — Webhook từ Casso/Sepay (đối soát CK) | API key shared |

---

## 3. Cấu hình backend (env)

Cần chuẩn bị các biến môi trường sau (đặt trong file `.env` hoặc secret manager):

```
# VNPay sandbox + production
VNPAY_TMN_CODE=XXXXXXXX
VNPAY_HASH_SECRET=XXXXXXXXXXXXXXXX
VNPAY_API_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_QR_API_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
VNPAY_RETURN_URL=https://halong24h.com/payments/vnpay/return
VNPAY_IPN_URL=https://api.halong24h.com/payments/vnpay/ipn

# Tài khoản nhận chuyển khoản (Bank Transfer mode)
BANK_NAME=Vietcombank
BANK_ACCOUNT_NUMBER=0123456789
BANK_ACCOUNT_NAME=CTY HALONG24H
BANK_BIN=970436                  # BIN theo NAPAS — VCB = 970436

# Đối soát chuyển khoản (chọn 1 trong 2)
CASSO_API_KEY=XXXXXXXX            # Casso.vn (free tier 100 GD/month)
# hoặc SEPAY_API_KEY=XXXXXXXX
```

VNPay yêu cầu đăng ký merchant tại https://vnpay.vn để nhận TMN_CODE + HASH_SECRET.
Đối soát bank dùng Casso/Sepay vì hầu hết ngân hàng VN không có webhook chính thức.

---

## 4. Flow VNPay QR (chi tiết)

```
[Mobile]                [Backend]               [VNPay]              [App banking]
   │                       │                       │                       │
   │  POST /payments/      │                       │                       │
   │  initiate             │                       │                       │
   │ ────────────────────► │                       │                       │
   │                       │  POST createQR        │                       │
   │                       │  (sign HMAC-SHA512)   │                       │
   │                       │ ────────────────────► │                       │
   │                       │ ◄──────── QR payload  │                       │
   │ ◄────────────────  PaymentSession {           │                       │
   │     sessionId, qrCode, payUrl, expiresAt }    │                       │
   │                       │                       │                       │
   │  Render QR            │                       │                       │
   │  ─────────────────────┼───────────────────────┼─────► [User scan]     │
   │                       │                       │                       │
   │                       │                       │  Pay via banking      │
   │                       │                       │ ◄───────────────────  │
   │                       │  POST /vnpay/ipn      │                       │
   │                       │ ◄──────────────────── │                       │
   │                       │  Verify HMAC          │                       │
   │                       │  Update DB → paid     │                       │
   │                       │ ─────► 200 OK         │                       │
   │                       │                       │                       │
   │  Poll /status (3s)    │                       │                       │
   │ ────────────────────► │                       │                       │
   │ ◄──── status: paid    │                       │                       │
```

### 4.1. POST `/payments/initiate` (đã có — bổ sung output)

**Request:**
```json
{
  "planId": "rooms_10",
  "cycle": "monthly",
  "method": "vnpay_qr",
  "rooms": 10,
  "totalAmount": 6589000
}
```

**Response (vnpay_qr) — bổ sung trường `qrCode`, `payUrl`:**
```json
{
  "success": true,
  "data": {
    "sessionId": "pay_a8f3k29s",
    "method": "vnpay_qr",
    "totalAmount": 6589000,
    "qrCode": "00020101021238570010A0000007270127...",  // EMVCo string raw
    "payUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TmnCode=XXX&vnp_TxnRef=pay_a8f3k29s&vnp_SecureHash=...",
    "expiresAt": "2026-05-09T12:30:00.000Z"
  }
}
```

**Quy ước:**
- `qrCode` = **EMVCo raw string** (không phải base64 PNG). Mobile dùng `QrImageView` render. Backend ưu tiên format này vì payload nhỏ (~150 bytes), scale tốt trên mọi DPI.
- Nếu backend không tiện build EMV string, có thể trả `qrImageBase64` (base64 PNG, có thể có prefix `data:image/png;base64,`) — FE sẽ fallback dùng `Image.memory`.
- `payUrl` = link mở browser/WebView để user nhập thẻ ATM/quốc tế (VNPay Gateway mode). Mobile show nút **"Mở app ngân hàng"**.
- `expiresAt` ≥ 15 phút — sau khi hết hạn, FE disable nút "Mở app ngân hàng" và hiện banner đỏ.

### 4.2. POST `/payments/vnpay/ipn` (NEW)

VNPay sẽ gọi endpoint này khi user thanh toán xong (server-to-server, **không** qua client).

**Request từ VNPay:** query string với các field sau (verify HMAC trước khi xử lý):
```
vnp_TxnRef=pay_a8f3k29s
vnp_Amount=658900000          // VNPay nhân với 100 (VND không có thập phân)
vnp_ResponseCode=00           // 00 = success
vnp_TransactionStatus=00
vnp_BankCode=NCB
vnp_PayDate=20260509123000
vnp_TransactionNo=14123456
vnp_SecureHash=<hmac-sha512>  // Verify với HASH_SECRET
```

**Backend xử lý:**
1. Verify `vnp_SecureHash` bằng HMAC-SHA512 với `HASH_SECRET` (theo doc VNPay)
2. Idempotent check: nếu `payments` table đã có status = paid cho `sessionId` này → return luôn
3. Update `payments.status = 'paid'`, lưu `referenceCode = vnp_TransactionNo`, `settledAt = NOW()`
4. Nếu là `kind = 'subscription'` → trigger flow KYC submit cho approval (mobile sẽ tự push vì poll status)
5. Nếu là `kind = 'renew'` → extend `subscriptions.endsAt += 1 month/year` theo cycle
6. Trả về VNPay format chuẩn:
```json
{ "RspCode": "00", "Message": "Confirm Success" }
```

**Lưu ý bảo mật:**
- Endpoint này **public** (VNPay gọi từ IP của họ) — KHÔNG yêu cầu Bearer token
- Whitelist IP VNPay nếu có thể (xem doc, có range cố định)
- HMAC verify là bắt buộc — nếu không pass → log + return `{ "RspCode": "97", "Message": "Invalid signature" }`

### 4.3. Mobile poll status

Mobile gọi `GET /payments/:sessionId/status` mỗi 3 giây sau khi mở dialog QR.
Khi backend đã set `status = 'paid'` (qua webhook IPN ở 4.2), mobile thấy paid →
auto submit KYC + push `/verify/pending` (logic đã có).

---

## 5. Flow Bank Transfer + VietQR

### 5.1. POST `/payments/initiate` (response cho `method = bank_transfer`)

```json
{
  "success": true,
  "data": {
    "sessionId": "pay_b2x9k0p1",
    "method": "bank_transfer",
    "totalAmount": 6589000,
    "bankInfo": {
      "bankName": "Vietcombank",
      "accountNumber": "0123456789",
      "accountName": "CTY HALONG24H",
      "content": "HALONG24H PAY_B2X9K0P1",
      "vietQrPayload": "00020101021238570010A00000072701..."  // EMVCo VietQR
    },
    "expiresAt": "2026-05-10T12:00:00.000Z"
  }
}
```

**Sinh `vietQrPayload`:**
- Dùng VietQR.io API (`https://api.vietqr.io/v2/generate`) — free, trả về QR PNG hoặc EMV string
- Hoặc tự build EMV string theo chuẩn NAPAS (xem https://vietqr.net/portal/document):
  - Tag `00`: Payload Format Indicator = `01`
  - Tag `38`: Merchant Account Info (BIN ngân hàng + STK)
  - Tag `54`: Transaction Amount = `6589000`
  - Tag `62`: Additional Data — chứa `content` (nội dung CK)

**Quan trọng:** `content` PHẢI có **prefix duy nhất** (vd `HALONG24H ${sessionId.toUpperCase()}`) để đối soát chính xác. KHÔNG để user tự nhập.

### 5.2. Đối soát chuyển khoản

**Khuyến nghị:** dùng [Casso.vn](https://casso.vn) (miễn phí 100 GD/tháng, integrate ~30 phút).

Flow:
1. Đăng ký Casso → connect tài khoản Vietcombank → Casso polling 1 phút/lần
2. Setup webhook Casso → trỏ về `POST /payments/bank-webhook`
3. Backend nhận webhook → parse `description` → tìm `sessionId` (từ pattern `HALONG24H PAY_XXXXXX`)
4. Match amount + sessionId → update `payments.status = 'paid'`

```json
// POST /payments/bank-webhook (từ Casso)
{
  "id": 12345,
  "amount": 6589000,
  "description": "HALONG24H PAY_B2X9K0P1 chuyển khoản gia hạn",
  "tid": "FT26509ABC123",
  "when": "2026-05-09T14:32:00+07:00"
}
```

Backend xử lý:
1. Verify `X-Webhook-Secret` header (Casso cấp)
2. Regex extract `sessionId` từ `description`: `/PAY_[A-Z0-9]+/`
3. Tìm session → check amount khớp (cho phép sai lệch ±1.000đ do user gõ thừa/thiếu) → status = paid
4. Tương tự VNPay IPN: idempotent + extend subscription nếu là renew
5. Trả `{ "success": true }` để Casso không retry

**Alternative:** nếu không dùng Casso, backend tự pull statement qua API ngân hàng (VCB Connect, MB BankPlus...). Phức tạp hơn nhưng free.

---

## 6. Lịch sử thanh toán

### 6.1. GET `/payments/history`

**Query params:**
- `limit` (optional, default 50)
- `cursor` (optional — pagination, dùng `id` của item cuối)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pay_renew_001",
      "kind": "renew",                    // subscription | renew | upgrade | refund
      "planLabel": "Standard · Tháng",    // backend format sẵn cho FE hiển thị
      "cycle": "monthly",
      "amount": 6589000,
      "method": "vnpay_qr",
      "status": "paid",
      "createdAt": "2026-05-07T10:00:00.000Z",
      "settledAt": "2026-05-07T10:03:00.000Z",
      "referenceCode": "VNP-238910238",
      "invoiceNumber": "INV-2026-0042"
    },
    {
      "id": "pay_subscribe_001",
      "kind": "subscription",
      "planLabel": "Standard · Tháng",
      "cycle": "monthly",
      "amount": 6589000,
      "method": "vnpay_qr",
      "status": "paid",
      "createdAt": "2026-03-04T10:00:00.000Z",
      "settledAt": "2026-03-04T10:02:00.000Z",
      "referenceCode": "VNP-198273645",
      "invoiceNumber": "INV-2026-0011"
    }
  ]
}
```

**Quy tắc:**
- Sort newest → oldest theo `createdAt`
- Trả **tất cả** giao dịch (paid + failed + expired + refunded) — FE filter UI nếu cần
- `kind = 'refund'`: `amount` là số dương (FE tự render dấu trừ)
- `kind = 'subscription'`: chỉ có 1 record duy nhất per user (đăng ký lần đầu)
- `kind = 'renew'`: 1 record cho mỗi lần gia hạn (~ 1 record/tháng nếu monthly)

### 6.2. Bảng `payments` cần lưu (gợi ý schema)

```sql
CREATE TABLE payments (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL,
  kind            VARCHAR(20) NOT NULL,    -- subscription | renew | upgrade | refund
  plan_id         VARCHAR(50),
  plan_label      VARCHAR(100),             -- denormalized cho history
  cycle           VARCHAR(10),              -- monthly | yearly
  rooms           INT,
  amount          BIGINT NOT NULL,          -- VND
  method          VARCHAR(20) NOT NULL,     -- vnpay_qr | bank_transfer | card
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  reference_code  VARCHAR(100),             -- VNPay TxnNo / bank tid
  invoice_number  VARCHAR(50) UNIQUE,
  qr_code         TEXT,                     -- EMV payload (cho audit)
  expires_at      TIMESTAMPTZ NOT NULL,
  settled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_status (status)
);
```

`invoice_number`: backend tự sinh format `INV-YYYY-NNNN` khi `status = 'paid'`. Có thể dùng cho xuất hoá đơn VAT sau.

---

## 7. Gia hạn — POST `/payments/renew`

**Request:**
```json
{ "method": "vnpay_qr" }
```

Mobile **chỉ gửi method**. Backend tự lookup `subscriptions` của user → lấy
plan + cycle hiện tại → tính `totalAmount` → tạo session với `kind = 'renew'`.

**Response:** giống `/payments/initiate` (cùng schema `PaymentSession`).

**Logic backend:**
1. Get `user.subscription` → nếu null/inactive → return 400 "Chưa có subscription"
2. Insert row vào `payments` với `kind = 'renew'`, `plan_id`, `cycle`, `amount` từ subscription
3. Gọi VNPay createQR (hoặc sinh VietQR cho bank_transfer)
4. Return PaymentSession

**Khi paid (qua IPN/webhook):**
- Update `subscriptions.ends_at = ends_at + (1 month | 12 months)` tùy cycle
- Set `subscriptions.status = 'active'` nếu trước đó là `past_due`
- Push notification cho user (`type = 'subscription_renewed'`)

---

## 8. Mobile contract (đã wire sẵn)

Để backend dễ đối chiếu, dưới đây là model FE đang parse:

```dart
// lib/features/verify/data/models/payment_session.dart
class PaymentSession {
  String sessionId;
  PaymentMethod method;       // vnpayQR | bankTransfer | card
  int totalAmount;
  String? qrCode;             // EMV payload
  String? qrImageBase64;      // fallback nếu BE trả PNG
  BankInfo? bankInfo;         // chỉ cho bank_transfer
  String? redirectUrl;        // VNPay Gateway (card flow tương lai)
  String? payUrl;             // mở app banking ngay trên device
  DateTime expiresAt;
}

class BankInfo {
  String bankName;
  String accountNumber;
  String accountName;
  String content;
  String? vietQrPayload;      // EMV VietQR
}

// lib/features/verify/data/models/payment_history_item.dart
class PaymentHistoryItem {
  String id;
  PaymentHistoryKind kind;    // subscription | renew | upgrade | refund
  String planLabel;
  BillingCycle cycle;
  int amount;
  PaymentMethod method;
  PaymentStatus status;
  DateTime createdAt;
  DateTime? settledAt;
  String? referenceCode;
  String? invoiceNumber;
}
```

Mọi field đều support `camelCase` + `snake_case` parse → backend nào cũng OK.

---

## 9. Test plan đề xuất cho backend

| Test | Steps | Expected |
|---|---|---|
| VNPay sandbox happy path | initiate → mock IPN với valid HMAC → check status | Session paid trong 5s, subscription created |
| VNPay invalid HMAC | initiate → mock IPN với HMAC sai | IPN return code 97, status vẫn pending |
| VNPay double IPN | initiate → mock IPN 2 lần liên tiếp | Idempotent — chỉ 1 lần update DB, return 00 cả 2 |
| Bank transfer happy path | initiate → mock Casso webhook khớp content + amount | Session paid, content được parse đúng |
| Bank transfer wrong amount | initiate (amount 6.589.000) → mock webhook amount 6.000.000 | Status pending, log warning |
| Renew khi subscription expired | POST /payments/renew khi `ends_at < NOW()` | Tạo session OK, sau khi paid extend từ NOW() |
| Renew khi subscription active | Tương tự nhưng `ends_at > NOW()` | Extend từ `ends_at` cũ, không bị mất ngày |
| Refund flow | POST /refund cho session paid | Tạo row refund mới (kind=refund), không xoá row gốc |
| History pagination | Insert 60 GD → GET /history?limit=20 | Trả 20 newest, có cursor cho lần kế |

---

## 10. Lộ trình recommended

1. **Phase 1** (tuần 1): VNPay QR sandbox + IPN + status polling — đủ để dev test E2E
2. **Phase 2** (tuần 2): VietQR generate + Casso integration cho bank transfer
3. **Phase 3** (tuần 3): `/payments/history` + `/payments/renew` + extend subscription
4. **Phase 4** (sau go-live ổn): Card payment (mobile sẽ unlock badge "Đang phát triển")

---

## 11. Liên hệ

- Mobile lead: `lib/features/verify/` — bất kỳ field nào backend trả khác spec → ping FE để confirm trước khi đẩy lên prod
- Bug ở mobile khi backend thay đổi: log JSON response trong dev console, check parser tại `payment_session.dart` + `payment_history_item.dart`
