# Backend — Apple IAP Integration Spec

Spec cho backend team để hỗ trợ Apple In-App Purchase (iOS). Android giữ
nguyên Pays2/VNPay không đổi.

> **Trạng thái tích hợp** (cập nhật 2026-05-31):
> - `GET /billing/plans` — ✅ done & tested, trả đúng 6 plans (`rooms_1…rooms_50` + `enterprise`), app render khớp.
> - `POST /payments/apple/verify` — ✅ done; cần điền 5 env `APPLE_IAP_*` (StoreKit key/issuer/bundle…) để verify thật.
> - `POST /webhooks/apple/s2s-notifications` — ✅ done; còn cần đăng ký URL trong ASC.
> - `GET /kyc/status` — ✅ done, đã trả đủ `subscriptionStatus/PlanId/Cycle/Provider/ExpiresAt`; OWNER seed dùng `subscriptionPlanId` dạng `rooms_5` — app map tier chính xác.
> - App side: `UserModel` đã parse đủ 5 field subscription (mục 6).

---

## 0. Tóm tắt 4 phần backend cần làm

1. **`GET /billing/plans`** — Trả catalog 6 gói (giá + features) để app render màn chọn gói (mục 2)
2. **`POST /payments/apple/verify`** — App gọi sau khi user mua qua Apple IAP, backend verify receipt với Apple → activate subscription
3. **`POST /webhooks/apple/s2s-notifications`** — Apple gọi server bạn khi có event (renew, refund, cancel, expire)
4. **Sửa `POST /kyc/submit`** — Tách KYC khỏi payment (luồng mới: submit ngay sau selfie, không kèm plan info)

Mỗi phần chi tiết ở dưới.

---

## 1. Database schema bổ sung

```sql
-- Bảng user subscription (nếu chưa có)
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20)
  DEFAULT 'none';  -- none | trial | active | past_due | cancelled | expired
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cycle VARCHAR(10);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_provider VARCHAR(20);
  -- 'apple_iap' | 'pays2' | 'vnpay' | NULL

-- Bảng Apple receipt verification log (idempotency key)
CREATE TABLE IF NOT EXISTS apple_transactions (
  original_transaction_id VARCHAR(50) PRIMARY KEY,  -- Apple's idempotency key
  user_id BIGINT NOT NULL REFERENCES users(id),
  product_id VARCHAR(100) NOT NULL,
  transaction_id VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  purchase_date TIMESTAMP NOT NULL,
  environment VARCHAR(10) NOT NULL,  -- 'Production' | 'Sandbox'
  status VARCHAR(20) NOT NULL,       -- 'active' | 'expired' | 'cancelled' | 'refunded'
  raw_payload JSONB,                 -- full Apple response for debugging
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_apple_tx_user ON apple_transactions(user_id);
CREATE INDEX idx_apple_tx_expires ON apple_transactions(expires_at);
```

---

## 2. `GET /billing/plans` — Catalog gói (app render màn chọn gói)

App gọi endpoint này để dựng màn "Chọn gói". Hiện app có catalog hardcode làm
fallback (dùng khi backend lỗi/timeout); backend cần trả **đúng format** dưới
để thay thế.

### Request

```http
GET /billing/plans
Authorization: Bearer <user_jwt>   // OWNER
```

### Response

```http
HTTP/1.1 200 OK
{
  "success": true,
  "data": [
    { "id": "rooms_1",  "rooms": 1,  "monthlyPrice": 199000,  "yearlyPrice": 1999000,
      "features": ["Booking + Calendar", "Check-in / Check-out", "Báo cáo cơ bản"] },
    { "id": "rooms_5",  "rooms": 5,  "monthlyPrice": 599000,  "yearlyPrice": 5999000,
      "features": ["Tất cả tính năng Mini", "Pricing rules cơ bản", "Multi-staff (3 nhân viên)"] },
    { "id": "rooms_10", "rooms": 10, "monthlyPrice": 999000,  "yearlyPrice": 9999000,
      "features": ["Tất cả tính năng Starter", "Dynamic pricing", "Housekeeping + Expenses", "Báo cáo nâng cao"] },
    { "id": "rooms_20", "rooms": 20, "monthlyPrice": 1799000, "yearlyPrice": 17999000,
      "features": ["Tất cả tính năng Standard", "Multi-staff không giới hạn", "Multi-property"] },
    { "id": "rooms_50", "rooms": 50, "monthlyPrice": 3999000, "yearlyPrice": 29999000,
      "features": ["Tất cả tính năng Pro", "Channel sync (Booking.com, Agoda...)", "API + Webhook"] },
    { "id": "enterprise", "rooms": -1, "monthlyPrice": 0,
      "features": ["Số phòng không giới hạn", "Tất cả tính năng Business", "SLA + hỗ trợ riêng 24/7", "Onboarding 1-1"] }
  ]
}
```

### Field spec

| Field | Type | Bắt buộc | Notes |
|---|---|---|---|
| `id` | string | ✅ | **Phải đúng 1 trong**: `rooms_1`, `rooms_5`, `rooms_10`, `rooms_20`, `rooms_50`, `enterprise`. App dùng `id` để map ra tier. Sai chuỗi → app fallback nhầm về Starter. |
| `rooms` | int | optional | Số phòng tối đa. Enterprise = `-1` (unlimited). Bỏ trống app tự suy từ tier. |
| `monthlyPrice` | int | ✅ | VND/tháng (integer, KHÔNG thập phân). Enterprise = `0` = "Liên hệ". |
| `yearlyPrice` | int | optional | VND/năm. Bỏ trống app tự tính `monthly × 12 × 0.84`. **Nên set explicit** để khớp giá Apple. |
| `features` | string[] | ✅ | Danh sách bullet hiển thị trên card gói. |

### ⚠️ Quy tắc giá & VAT

- Giá ở đây là **giá trước VAT**. App tự cộng **10% VAT** khi hiển thị tổng VND.
- Trên **iOS**, số tiền user thực trả = **giá Apple StoreKit** (cột Apple bên
  dưới), KHÔNG phải giá VND ở đây. VND chỉ là tham khảo → cấu hình giá trong ASC
  = giá cuối cùng user trả.

### Bảng giá đã chốt + Apple Product ID (khớp catalog app & file StoreKit)

| Tier | id (`/billing/plans` + `subscription_plan_id`) | Rooms | Monthly | Yearly | Apple Product ID (monthly / yearly) |
|---|---|---|---|---|---|
| Mini       | `rooms_1`    | 1  | 199.000 ₫   | 1.999.000 ₫  | `com.halong24h.sub.rooms1_monthly` / `…rooms1_yearly` |
| Starter    | `rooms_5`    | 5  | 599.000 ₫   | 5.999.000 ₫  | `com.halong24h.sub.rooms5_monthly` / `…rooms5_yearly` |
| Standard   | `rooms_10`   | 10 | 999.000 ₫   | 9.999.000 ₫  | `com.halong24h.sub.rooms10_monthly` / `…rooms10_yearly` |
| Pro        | `rooms_20`   | 20 | 1.799.000 ₫ | 17.999.000 ₫ | `com.halong24h.sub.rooms20_monthly` / `…rooms20_yearly` |
| Business   | `rooms_50`   | 50 | 3.999.000 ₫ | 29.999.000 ₫ | `com.halong24h.sub.rooms50_monthly` / `…rooms50_yearly` |
| Enterprise | `enterprise` | ∞  | Liên hệ     | —            | **Không có IAP** — bán hợp đồng riêng |

> **Lưu ý quy ước ID** (2 dạng khác nhau, đừng nhầm):
> - **Plan id** (ở `/billing/plans` và `subscription_plan_id`): có gạch dưới — `rooms_10`.
> - **Apple Product slug** (trong product ID): KHÔNG gạch dưới — `rooms10`.
> - Backend map ngược: `com.halong24h.sub.rooms10_monthly` → plan id `rooms_10`, cycle `monthly` (xem `planIdFromProductId` ở mục 3).
>
> → **10 Apple product** (5 tier × 2 cycle) cần tạo trong ASC. Enterprise không
> lên IAP (app hiện CTA "Liên hệ").

---

## 3. `POST /payments/apple/verify` — Verify Apple receipt

Endpoint được iOS app gọi sau khi:
- User mua thành công qua Apple IAP (PurchaseStatus.purchased)
- User tap "Restore Purchases" → có entitlement → (PurchaseStatus.restored)

### Request

```http
POST /payments/apple/verify
Authorization: Bearer <user_jwt>
Content-Type: application/json

{
  "productId": "com.halong24h.sub.rooms10_monthly",
  "purchaseId": "2000000451234567",
  "receiptData": "MIIUYwYJKoZIhvcNAQcCoIIUVDCC..." // base64 string, có thể dài 10-30KB
}
```

| Field | Type | Notes |
|---|---|---|
| `productId` | string | Product ID khớp 10 product trong ASC (com.halong24h.sub.*) |
| `purchaseId` | string | Apple transaction ID (cho debug, KHÔNG dùng làm trust) |
| `receiptData` | string | base64 receipt từ StoreKit, **đây mới là trust source** |

### Response — Success

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "status": "approved",
    "expiresAt": "2026-07-30T15:42:11Z",
    "originalTransactionId": "2000000451234567"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `status` | string | `approved` (subscription active) hoặc `awaitingApproval` (KYC chưa duyệt) |
| `expiresAt` | ISO 8601 | Khi subscription hết hạn (từ Apple) — UI dùng hiển thị "Đến HH/MM" |
| `originalTransactionId` | string | Apple's idempotency key — app log để debug |

### Response — Error

```http
HTTP/1.1 400 Bad Request
{
  "success": false,
  "message": "Apple receipt is invalid or expired",
  "code": "INVALID_RECEIPT"
}
```

App không call `completePurchase()` khi error → Apple sẽ redeliver cho user thử lại.

### Backend logic (pseudo-code)

```typescript
async function verifyAppleReceipt(req) {
  const { productId, receiptData } = req.body;
  const userId = req.auth.userId;

  // 1. Verify receipt với Apple
  const result = await callAppleStoreKitAPI({
    receiptData,
    // BẮT BUỘC dùng App Store Server API v2 (modern) hoặc verifyReceipt (legacy)
  });

  // 2. Validate bundle_id + product_id (chống tampering)
  if (result.bundleId !== 'com.halongtravel.halong24h') {
    throw new Error('Invalid bundle_id');
  }
  if (result.productId !== productId) {
    throw new Error('Product ID mismatch');
  }

  // 3. Check expiry
  if (result.expiresAt < Date.now()) {
    throw new Error('Subscription expired');
  }

  // 4. Idempotent upsert vào apple_transactions
  await db.upsert('apple_transactions', {
    original_transaction_id: result.originalTransactionId,
    user_id: userId,
    product_id: productId,
    transaction_id: result.transactionId,
    expires_at: result.expiresAt,
    purchase_date: result.purchaseDate,
    environment: result.environment,
    status: 'active',
    raw_payload: result,
  });

  // 5. Update user subscription
  await db.update('users', userId, {
    subscription_status: 'active',
    subscription_plan_id: planIdFromProductId(productId),
    subscription_cycle: cycleFromProductId(productId),
    subscription_expires_at: result.expiresAt,
    subscription_provider: 'apple_iap',
    kyc_status: 'approved',  // nếu KYC chưa approved thì auto-approve khi paid
  });

  return {
    status: 'approved',
    expiresAt: result.expiresAt.toISOString(),
    originalTransactionId: result.originalTransactionId,
  };
}

// Map product ID → plan + cycle.
// Apple slug 'rooms10' (KHÔNG gạch dưới) → plan id 'rooms_10' (CÓ gạch dưới)
// để khớp id ở /billing/plans + cột subscription_plan_id (xem mục 2).
function planIdFromProductId(productId) {
  const match = productId.match(/^com\.halong24h\.sub\.rooms(\d+)_/);
  return match ? `rooms_${match[1]}` : null;  // 'rooms_1' | 'rooms_5' | 'rooms_10' | 'rooms_20' | 'rooms_50'
}

function cycleFromProductId(productId) {
  return productId.endsWith('_yearly') ? 'yearly' : 'monthly';
}
```

### Apple StoreKit Server API v2 — gọi như nào

**Khuyến nghị**: dùng API v2 modern thay vì legacy `verifyReceipt`.

1. **Tạo StoreKit Key** trong ASC → Users and Access → Integrations →
   In-App Purchase → **+** → Generate key. Download file `.p8`.
2. **Sign JWT** mỗi request:

```typescript
import jwt from 'jsonwebtoken';
import fs from 'fs';

const privateKey = fs.readFileSync('/path/to/AuthKey_XXXXX.p8');
const keyId = 'XXXXXXXXXX';       // Key ID hiện trên ASC
const issuerId = 'YYYYYYYY-...';  // Issuer ID hiện trên ASC

function signAppStoreJWT() {
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    keyid: keyId,
    issuer: issuerId,
    audience: 'appstoreconnect-v1',
    expiresIn: '20m',  // max 20 phút
  });
}
```

3. **Call API**:

```typescript
async function callAppleStoreKitAPI({ originalTransactionId }) {
  const token = signAppStoreJWT();

  // Production endpoint
  let url = `https://api.storekit.itunes.apple.com/inApps/v1/transactions/${originalTransactionId}`;

  let res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Sandbox fallback (Apple yêu cầu thử prod trước)
  if (res.status === 404) {
    url = `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${originalTransactionId}`;
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (!res.ok) throw new Error(`Apple API ${res.status}`);

  // Response is signed JWT — decode the `signedTransactionInfo` field
  const { signedTransactionInfo } = await res.json();
  const decoded = jwt.decode(signedTransactionInfo, { complete: true });

  return {
    productId: decoded.payload.productId,
    bundleId: decoded.payload.bundleId,
    transactionId: decoded.payload.transactionId,
    originalTransactionId: decoded.payload.originalTransactionId,
    purchaseDate: new Date(decoded.payload.purchaseDate),
    expiresAt: new Date(decoded.payload.expiresDate),
    environment: decoded.payload.environment,  // 'Production' | 'Sandbox'
  };
}
```

**Note**: receiptData từ app **chứa** transactionId. Backend extract bằng cách
parse base64 receipt **hoặc** call API với original_transaction_id từ
purchaseId được app gửi kèm.

Cách đơn giản hơn: dùng package có sẵn:
- Node.js: `apple-receipt-verify` hoặc `node-apple-receipt-verify`
- Python: `inapppy`
- Go: `github.com/awa/go-iap`

---

## 4. `POST /webhooks/apple/s2s-notifications` — Apple Server Notifications V2

Apple gọi server bạn mỗi khi có event liên quan đến subscription (renew,
refund, cancel, expire). **Bắt buộc đăng ký webhook** trong ASC, nếu không
subscription state sẽ drift.

### Setup trong ASC

ASC → App → **App Information** → **App Store Server Notifications**:
- **Production Server URL**: `https://your-backend.halong24h.com/webhooks/apple/s2s-notifications`
- **Sandbox Server URL**: cùng URL hoặc URL khác cho dev environment
- **Version**: chọn **Version 2** (mới hơn, JWT signed)

### Request từ Apple

```http
POST /webhooks/apple/s2s-notifications
Content-Type: application/json

{
  "signedPayload": "eyJhbGciOiJFUzI1NiIsIng1YyI6Wy..."
}
```

`signedPayload` là JWT do Apple ký bằng cert. Backend phải:
1. Verify JWT signature (cert public key có trong header `x5c`)
2. Decode payload để lấy notification type + data

### Notification types cần xử lý

| Type | Sub-type | Action |
|---|---|---|
| `SUBSCRIBED` | `INITIAL_BUY` | First purchase — set `subscription_status='active'` |
| `SUBSCRIBED` | `RESUBSCRIBE` | User mua lại sau cancel — set `active` |
| `DID_RENEW` | - | Auto-renew thành công — extend `expires_at` |
| `DID_FAIL_TO_RENEW` | `GRACE_PERIOD` | Card declined nhưng đang grace — set `past_due` |
| `DID_FAIL_TO_RENEW` | - | Card declined hết grace — set `expired` |
| `EXPIRED` | - | Subscription hết hạn không renew — set `expired` |
| `DID_CHANGE_RENEWAL_STATUS` | `AUTO_RENEW_DISABLED` | User huỷ auto-renew (vẫn còn dùng tới hết kỳ) — set `cancelled` |
| `DID_CHANGE_RENEWAL_STATUS` | `AUTO_RENEW_ENABLED` | User bật lại — set `active` |
| `DID_CHANGE_RENEWAL_PREF` | `UPGRADE` | User upgrade gói — update `subscription_plan_id` |
| `DID_CHANGE_RENEWAL_PREF` | `DOWNGRADE` | User downgrade — chỉ apply ở chu kỳ tiếp theo |
| `REFUND` | - | Apple refund tiền — set `cancelled`, revoke access |
| `CONSUMPTION_REQUEST` | - | Apple hỏi backend confirm transaction usage (rare, refund disputes) |

### Backend logic

```typescript
async function handleS2SNotification(req) {
  const { signedPayload } = req.body;

  // 1. Verify JWT từ Apple
  const decoded = await verifyAppleJWT(signedPayload);
  // → { notificationType, subtype, data: { signedTransactionInfo, signedRenewalInfo } }

  // 2. Decode transaction info
  const tx = await verifyAppleJWT(decoded.data.signedTransactionInfo);
  // → { productId, originalTransactionId, expiresDate, ... }

  // 3. Idempotency: skip nếu đã xử lý event này
  const exists = await db.get('apple_events', { notificationUUID: decoded.notificationUUID });
  if (exists) return { ok: true };  // already processed

  // 4. Find user theo original_transaction_id
  const txRecord = await db.get('apple_transactions', {
    original_transaction_id: tx.originalTransactionId,
  });
  if (!txRecord) {
    // Edge case: notification before our /verify endpoint was called
    // Log + return 200 (Apple retries if non-200)
    logger.warn('S2S notification for unknown transaction', { tx });
    return { ok: true };
  }

  // 5. Apply state change
  switch (decoded.notificationType) {
    case 'DID_RENEW':
      await db.update('users', txRecord.user_id, {
        subscription_status: 'active',
        subscription_expires_at: new Date(tx.expiresDate),
      });
      break;
    case 'DID_FAIL_TO_RENEW':
      const newStatus = decoded.subtype === 'GRACE_PERIOD' ? 'past_due' : 'expired';
      await db.update('users', txRecord.user_id, { subscription_status: newStatus });
      break;
    case 'EXPIRED':
      await db.update('users', txRecord.user_id, { subscription_status: 'expired' });
      break;
    case 'DID_CHANGE_RENEWAL_STATUS':
      const renewalStatus = decoded.subtype === 'AUTO_RENEW_DISABLED' ? 'cancelled' : 'active';
      await db.update('users', txRecord.user_id, { subscription_status: renewalStatus });
      break;
    case 'REFUND':
      await db.update('users', txRecord.user_id, { subscription_status: 'cancelled' });
      await db.update('apple_transactions', txRecord.original_transaction_id, {
        status: 'refunded',
      });
      break;
    // ... handle remaining types
  }

  // 6. Lưu notificationUUID để idempotent
  await db.insert('apple_events', {
    notification_uuid: decoded.notificationUUID,
    type: decoded.notificationType,
    subtype: decoded.subtype,
    received_at: new Date(),
  });

  // 7. Trả 200 (BẮT BUỘC — Apple retry nếu không nhận 200)
  return { ok: true };
}
```

### Verify JWT từ Apple

```typescript
import jwt from 'jsonwebtoken';

async function verifyAppleJWT(signedToken) {
  const decoded = jwt.decode(signedToken, { complete: true });
  const x5cChain = decoded.header.x5c;  // Apple cert chain

  // Convert base64 cert → PEM
  const certPem = `-----BEGIN CERTIFICATE-----\n${x5cChain[0]}\n-----END CERTIFICATE-----`;

  // Verify signature + verify cert chain anchors to Apple Root CA
  // (Apple Root CA: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer)
  return jwt.verify(signedToken, certPem, { algorithms: ['ES256'] });
}
```

Package có sẵn: `app-store-server-api` (Node.js) — official Apple SDK.

---

## 5. Sửa `POST /kyc/submit` — Tách KYC khỏi payment

### Luồng cũ (vẫn dùng cho Android)

1. User upload CCCD front + back + selfie
2. User chọn plan
3. User thanh toán (VNPay/Pays2)
4. App gọi `/kyc/submit` với body **kèm `planId` + `paymentSessionId`**
5. Backend tạo submission **chỉ khi đã có payment**
6. Admin duyệt → user vào trial

### Luồng mới (cho cả iOS lẫn Android sau này)

1. User upload CCCD + selfie
2. **App gọi `/kyc/submit` ngay sau selfie — KHÔNG kèm plan/payment**
3. Backend tạo submission với `status='pending'`
4. Admin duyệt → set `user.kyc_status='approved'` + `subscription_status='trial'` (7 ngày)
5. User dùng app trong trial
6. Trước/sau khi trial hết, user vào `/verify/subscription-detail` chọn gói + mua qua Apple IAP (iOS) hoặc Pays2 (Android)
7. Sau khi mua, `subscription_status='active'`

### Spec mới của `/kyc/submit`

```http
POST /kyc/submit
Authorization: Bearer <user_jwt>
Content-Type: application/json

{
  // ⚠️ KHÔNG còn `planId`, `billingCycle`, `paymentSessionId`
  // Backend tự lấy CCCD + selfie uploads từ user_id trong token
}
```

### Backend logic

```typescript
async function submitKyc(req) {
  const userId = req.auth.userId;

  // 1. Verify user đã upload đủ 3 file
  const uploads = await db.query(
    'SELECT * FROM kyc_uploads WHERE user_id = $1', [userId]
  );
  const hasFront = uploads.some(u => u.kind === 'cccd_front');
  const hasBack = uploads.some(u => u.kind === 'cccd_back');
  const hasSelfie = uploads.some(u => u.kind === 'selfie');

  if (!hasFront || !hasBack || !hasSelfie) {
    throw new Error('Vui lòng upload đủ CCCD trước/sau + selfie trước khi submit');
  }

  // 2. KHÔNG còn check payment

  // 3. Tạo submission
  const submission = await db.insert('kyc_submissions', {
    user_id: userId,
    status: 'pending',  // chờ admin duyệt
    submitted_at: new Date(),
  });

  // 4. Update user kyc_status
  await db.update('users', userId, { kyc_status: 'pending' });

  return {
    success: true,
    data: {
      submissionId: submission.id,
      status: 'pending',
      submittedAt: submission.submitted_at.toISOString(),
    },
  };
}
```

### ⚠️ Enforce trạng thái KYC (BẮT BUỘC — backend tự gác, không dựa vào app)

App đã mirror `kycStatus` để ẩn/chuyển hướng UI (pending → chỉ hiện "chờ duyệt",
không cho KYC lại). Nhưng client có thể bị sửa → **backend PHẢI tự kiểm tra
`kycStatus` hiện tại của user và trả lỗi rõ ràng** cho các API sau. App đã sẵn
sàng bắt lỗi + hiển thị `message`.

**1. `POST /kyc/submit`** — chặn submit trùng/không hợp lệ:

| `kycStatus` hiện tại | Hành vi backend |
|---|---|
| `none` | ✅ Cho submit → set `pending` |
| `rejected` | ✅ Cho submit lại (resubmit) → set `pending` |
| `pending` | ❌ **409** · `code: KYC_ALREADY_PENDING` · "Hồ sơ đang chờ duyệt, không thể gửi lại." |
| `approved` | ❌ **409** · `code: KYC_ALREADY_APPROVED` · "Tài khoản đã được xác thực." |

**2. Upload CCCD/selfie** (`/kyc/cccd-front`, `/kyc/cccd-back`, `/kyc/selfie`):

- `kycStatus = pending` hoặc `approved` → ❌ **403** · `code: KYC_LOCKED` ·
  "Hồ sơ đang chờ duyệt / đã duyệt, không thể chỉnh sửa." (Chống ghi đè hồ sơ
  đang chờ.) Khi `rejected` → cho upload lại bình thường.

**3. Tạo / sửa property** (`POST /properties`, `PUT /properties/:id`, ...):

- `kycStatus != approved` → ❌ **403** · `code: KYC_REQUIRED` ·
  "Cần hoàn tất xác thực trước khi đăng/sửa phòng."

**4. `GET /kyc/status` + `GET /auth/profile`**:

- `kycStatus` luôn phản ánh đúng DB: `none | pending | approved | rejected`.
- Chỉ admin approve/reject mới đổi `pending → approved | rejected`.
- App poll field này để cập nhật UI (banner, route guard).

**Error format thống nhất** (app đọc `message` để hiện snackbar; `code` là tùy chọn):

```json
{ "success": false, "message": "Hồ sơ đang chờ duyệt, không thể gửi lại.", "code": "KYC_ALREADY_PENDING" }
```

> Tóm tắt: status do **API quyết định + enforce**; app chỉ phản chiếu. Thiếu các
> guard 1-3 ở backend thì người dùng sửa client vẫn có thể submit trùng hoặc
> đăng phòng khi chưa duyệt.

### Sửa flow admin approve

Khi admin duyệt:

```typescript
async function adminApproveKyc(submissionId) {
  const submission = await db.get('kyc_submissions', submissionId);

  await db.transaction(async (trx) => {
    // Set submission status
    await trx.update('kyc_submissions', submissionId, {
      status: 'approved',
      approved_at: new Date(),
    });

    // Activate user với trial 7 ngày
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await trx.update('users', submission.user_id, {
      kyc_status: 'approved',
      subscription_status: 'trial',
      subscription_expires_at: trialEndsAt,
      // KHÔNG còn `subscription_plan_id` — user tự chọn sau
    });
  });

  // (optional) push FCM notification cho user
  await sendPushNotification(submission.user_id, {
    title: 'Tài khoản đã được duyệt',
    body: 'Trial 7 ngày miễn phí bắt đầu từ hôm nay.',
  });
}
```

### Trial → Active transition

Khi user mua plan qua Apple IAP **trong lúc đang trial**:
- `/payments/apple/verify` được gọi
- Backend set `subscription_status='active'` ngay (override 'trial')
- `subscription_expires_at` = Apple's expires_date (1 tháng/năm sau)
- Trial 7 ngày BỊ MẤT (Apple đã trừ tiền) — Apple cho `introductoryOffer` xử lý trial nếu cần

**Khuyến nghị**: Setup `introductoryOffer` trong ASC cho mỗi product monthly =
"7 days free trial" → Apple tự cho free 7 ngày trước khi trừ tiền lần đầu →
user không bị mất trial.

---

## 6. `GET /kyc/status` — Update response để gồm subscription

App đã call endpoint này khi load profile. Bổ sung subscription fields:

```http
GET /kyc/status
Authorization: Bearer <user_jwt>

Response:
{
  "success": true,
  "data": {
    "status": "approved",
    "submissionId": "abc123",
    "approvedAt": "2026-05-30T10:00:00Z",
    "trialEndsAt": "2026-06-06T10:00:00Z",
    "uploads": { "cccdFront": true, "cccdBack": true, "selfie": true },

    // NEW: subscription info
    "subscriptionStatus": "trial",     // none|trial|active|past_due|cancelled|expired
    "subscriptionPlanId": null,        // null khi chưa mua; khi có dùng dạng "rooms_10" (khớp id /billing/plans)
    "subscriptionCycle": null,         // monthly|yearly
    "subscriptionExpiresAt": "2026-06-06T10:00:00Z",
    "subscriptionProvider": null       // 'apple_iap' sau khi mua qua IAP
  }
}
```

| Field | App đọc? | Ghi chú |
|---|---|---|
| `subscriptionStatus` | ✅ | Quyết định banner dashboard. App xử lý `trial/active/past_due/cancelled` + getter `isSubscriptionExpired` cho `expired`. |
| `subscriptionPlanId` | ✅ (hiển thị) | **Dùng dạng `rooms_10`** (gạch dưới) cho khớp `/billing/plans`. App in giá trị này ra dashboard. |
| `subscriptionCycle` | ✅ | `monthly`/`yearly`. |
| `subscriptionExpiresAt` | ✅ | App map vào `UserModel.subscriptionExpiresAt` (DateTime) + getter `subscriptionDaysLeft` (fallback `trialEndsAt` nếu null). |
| `subscriptionProvider` | ✅ | App map vào `UserModel.subscriptionProvider` + getter `isAppleSubscription` (== `apple_iap`). |

> Tên field giữ **camelCase** đúng như trên — `UserModel` của app đọc theo key này.
> Cả 5 field subscription đều đã được `UserModel` parse (không còn field nào "chưa đọc").

---

## 7. Testing checklist

### Local dev

- [ ] Mock Apple receipt verification (return fake data) cho dev environment
- [ ] Test `/payments/apple/verify` với mock receipt → tạo apple_transactions row
- [ ] Test `/webhooks/apple/s2s-notifications` với mock JWT → state update đúng
- [ ] Test `/kyc/submit` không kèm plan → tạo submission OK
- [ ] Test admin approve → user.kyc_status='approved', subscription_status='trial'

### Sandbox (real Apple)

- [ ] Tạo Sandbox tester trong ASC
- [ ] Cài app iOS trên thiết bị thật, login sandbox account
- [ ] Mua plan qua app → check backend log
  - `/payments/apple/verify` được call với receipt
  - Apple API trả productId + expires_at
  - DB: apple_transactions row created, user.subscription_status='active'
- [ ] Restore Purchases → check log
- [ ] Đợi 5 phút (sandbox: 1 month = 5 min) → DID_RENEW webhook fire
- [ ] Manual cancel trong Settings → DID_CHANGE_RENEWAL_STATUS webhook
- [ ] Refund request qua Apple → REFUND webhook

### Production

- [ ] Domain webhook URL active HTTPS (Apple bắt buộc, không chấp nhận self-signed)
- [ ] Webhook URL register trong ASC App Information
- [ ] Apple Root CA chain verify hoạt động
- [ ] Monitoring: alert nếu webhook fail rate > 5%

---

## 8. Hỏi/đáp thường gặp

**Q: Lưu receipt ở đâu? Bao lâu?**
A: Lưu `raw_payload` JSONB trong `apple_transactions` table forever (cho audit
+ debug refund disputes). Apple receipt có thể decode lại bất cứ lúc nào.

**Q: Một user có nhiều Apple account (multi-device) thì sao?**
A: Apple cho phép. Mỗi `original_transaction_id` là 1 subscription. User mua
2 subscription cùng plan → có 2 row trong apple_transactions, nhưng app chỉ
tính active subscription mới nhất (theo expires_at DESC).

**Q: User upgrade gói thì xử lý sao?**
A: Apple gửi webhook `DID_CHANGE_RENEWAL_PREF` với subtype `UPGRADE` →
backend update `subscription_plan_id` ngay (upgrade = active immediately,
Apple prorate). `DOWNGRADE` chỉ apply ở chu kỳ tiếp theo.

**Q: Backend gọi App Store Server API rate limit?**
A: 1500 requests/30 phút mỗi key. Đủ cho production size vừa. Nếu vượt,
Apple trả 429 → backend retry với exponential backoff.

**Q: Khi nào dùng `verifyReceipt` legacy?**
A: Chỉ khi can't migrate App Store Server API v2 (rất hiếm). Apple sẽ
deprecate legacy nhưng vẫn chạy. Best practice 2026: chỉ dùng v2.

---

## 9. Liên kết tham khảo

- [App Store Server API v2 docs](https://developer.apple.com/documentation/appstoreserverapi)
- [App Store Server Notifications V2](https://developer.apple.com/documentation/appstoreservernotifications)
- [Receipt validation programming guide](https://developer.apple.com/documentation/storekit/in-app_purchase/validating_receipts_with_the_app_store)
- [Sandbox testing](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases_with_sandbox)
- Apple StoreKit Node.js SDK: https://github.com/apple/app-store-server-library-node
