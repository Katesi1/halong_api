# API Spec — KYC (Verify Identity) cho Owner

> **Mục đích**: Trước khi OWNER được nhận booking thật, phải qua flow KYC: upload CCCD trước/sau + selfie liveness → admin duyệt → bắt đầu trial 7 ngày → auto-charge subscription. Tài liệu này để team backend implement đúng + nhanh + đỡ phải chế lại.
>
> **Audience**: Backend dev (Node/Express + Postgres/Mongo) tại repo Halong24h API.
> **Frontend hiện trạng**: 100% UI + state machine + mock repository đã xong (xem `lib/features/verify/`). Backend chỉ cần wire endpoint theo contract đã có — không phải design lại.

---

## 1. Tổng quan & quyết định kiến trúc

### 1.1 Bài học từ các bên (industry pattern)

Sau khi đối chiếu với [FPT.AI eKYC](https://docs-vision.fpt.ai/en/ekyc/), [Stripe Identity](https://docs.stripe.com/connect/handling-api-verification), Bond, Shufti, HyperVerge — pattern KYC chuẩn gồm 3 phần:

1. **Capture**: SDK/UI ở client thu thập ảnh + liveness video
2. **Processing**: Server forward đến eKYC provider (FPT.AI/VNPT/jumio…) lấy OCR + face match score + risk flags
3. **Decision**: Admin queue duyệt thủ công các case borderline (OCR confidence thấp, face match 0.7-0.85)

Pattern API: **session + status polling + webhook** (not just polling).
Response chuẩn: **3 phần** = `{ verdict: pass/fail/review, extracted: {ocr fields}, riskFlags: [...] }`.

### 1.2 Quyết định cho Halong24h: **Wrap FPT.AI eKYC (hoặc VNPT eKYC)** — KHÔNG tự build

| Lý do | DIY | FPT.AI/VNPT eKYC |
|---|---|---|
| OCR CCCD chip mới (mã QR backside, MRZ) | Tự train model ≥ 6 tháng | Out-of-the-box, 98% accuracy |
| Face match (so sánh portrait CCCD vs selfie) | Cần data, GPU server | Out-of-the-box |
| Liveness ≥ ISO 30107 (anti-spoof) | Rất khó | Có sẵn |
| Tuân thủ NĐ 13/2023/NĐ-CP về dữ liệu cá nhân | Tự audit | Provider đã chứng nhận |
| Chi phí | Vài trăm triệu R&D + ops | ~5-15k VND/lượt verify |
| Time-to-market | 3-6 tháng | 1-2 tuần |

→ **Recommend**: Backend integrate **FPT.AI eKYC** (Vietnamese, support CCCD chip mới, phổ biến nhất). VNPT eKYC là plan B nếu giá tốt hơn. Frontend KHÔNG biết provider nào — backend abstract đằng sau API riêng của mình.

### 1.3 Frontend hiện đã làm sẵn (backend không cần lo)

Frontend dùng `google_mlkit_text_recognition` + `google_mlkit_face_detection` ở client để:
- **Auto-shutter** khi đủ keyword CCCD trong khung hình (`cccd_scanner_screen.dart:183-227`)
- **4-challenge liveness** (look left/right/up/down — random shuffle anti-replay) (`selfie_scanner_screen.dart:21-95`)
- **Crop CCCD** về tỉ lệ 1.586:1 trước khi upload (`cccd_image_cropper.dart`)

→ Backend KHÔNG cần làm liveness check (đã ở client). Backend CHỈ cần OCR + face match + admin decision.
→ Tuy nhiên **backend nên double-check liveness lần 2** ở phía server (gọi FPT.AI liveness API) cho các case quan trọng — vì client check có thể bị bypass bởi attacker dùng ảnh tĩnh + APK mod.

---

## 2. Database schema (PostgreSQL — đề xuất)

```sql
-- Bảng submission gốc (1 user có thể có nhiều submission qua thời gian)
CREATE TABLE kyc_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          VARCHAR(32) NOT NULL DEFAULT 'draft',
                  -- draft | kyc_submitted | payment_pending | awaiting_approval
                  -- approved | rejected | refunded
  reject_reason   TEXT,
  rejected_items  JSONB,         -- ['cccdFront', 'selfie'] để frontend biết item nào sai
  approved_at     TIMESTAMPTZ,
  approved_by     UUID REFERENCES users(id),
  trial_ends_at   TIMESTAMPTZ,
  charge_starts_at TIMESTAMPTZ,
  expected_rooms  INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT one_active_submission UNIQUE (user_id, status)
    DEFERRABLE INITIALLY DEFERRED  -- chặn user có 2 submission cùng pending
);
CREATE INDEX idx_kyc_user ON kyc_submissions(user_id);
CREATE INDEX idx_kyc_status ON kyc_submissions(status) WHERE status IN ('awaiting_approval','payment_pending');

-- Bảng các upload (CCCD front, back, selfie) — n-to-1 với submission
CREATE TABLE kyc_uploads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     UUID NOT NULL REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  type              VARCHAR(16) NOT NULL,  -- 'cccd_front' | 'cccd_back' | 'selfie'
  image_url         TEXT NOT NULL,         -- CDN URL (S3, MinIO, ...)
  image_url_thumb   TEXT,                   -- thumbnail (300x optimization)
  ocr_result        JSONB,                  -- {cccdNumber, fullName, dob, ...} — null nếu selfie
  ocr_confidence    NUMERIC(3,2),           -- 0..1, trigger warning khi < 0.8
  face_match_score  NUMERIC(3,2),           -- 0..1, chỉ có cho 'selfie'
  liveness_score    NUMERIC(3,2),           -- 0..1, chỉ có cho 'selfie' (server-side)
  provider          VARCHAR(32),            -- 'fpt_ai' | 'vnpt_ekyc' | 'manual'
  provider_request_id TEXT,                 -- để trace nếu provider reject
  uploaded_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT one_per_type UNIQUE (submission_id, type)
);
CREATE INDEX idx_uploads_sub ON kyc_uploads(submission_id);

-- Bảng plan catalog (3 plan cứng — nhưng cho phép admin sửa giá)
CREATE TABLE billing_plans (
  id               VARCHAR(32) PRIMARY KEY,  -- 'starter' | 'professional' | 'enterprise'
  name             TEXT NOT NULL,
  price_per_room   INT NOT NULL,             -- VND/tháng
  min_charge       INT NOT NULL,             -- VND/tháng (sàn)
  max_rooms        INT,                       -- NULL = unlimited
  yearly_discount_pct NUMERIC(4,2) DEFAULT 20,
  vat_pct          NUMERIC(4,2) DEFAULT 10,
  features         JSONB NOT NULL,           -- list feature string
  active           BOOLEAN DEFAULT true,
  sort_order       INT DEFAULT 0
);

-- Bảng payment session
CREATE TABLE payment_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  plan_id         VARCHAR(32) NOT NULL REFERENCES billing_plans(id),
  cycle           VARCHAR(8) NOT NULL,       -- 'monthly' | 'yearly'
  rooms           INT NOT NULL,
  total_amount    INT NOT NULL,              -- VND, đã include VAT
  method          VARCHAR(16) NOT NULL,      -- 'vnpay_qr' | 'bank_transfer' | 'card'
  status          VARCHAR(16) NOT NULL DEFAULT 'pending',
                  -- pending | paid | failed | expired | refunded
  -- Method-specific data
  qr_code         TEXT,                      -- base64 (vnpay_qr)
  bank_info       JSONB,                     -- {bankName, accountNumber, accountName, content}
  redirect_url    TEXT,                      -- URL checkout (card)
  -- Provider trace
  provider        VARCHAR(32),               -- 'vnpay' | 'momo' | 'manual_bank'
  provider_txn_id TEXT,                      -- transaction ID phía provider
  provider_payload JSONB,                    -- raw response từ provider
  paid_at         TIMESTAMPTZ,
  refunded_at     TIMESTAMPTZ,
  refunded_amount INT,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_payment_sub ON payment_sessions(submission_id);
CREATE INDEX idx_payment_status_expires ON payment_sessions(status, expires_at)
  WHERE status = 'pending';  -- worker dọn session expired

-- Cập nhật bảng users — thêm field KYC + subscription
ALTER TABLE users ADD COLUMN kyc_status VARCHAR(32) DEFAULT 'none';
  -- 'none' | 'pending' | 'approved' | 'rejected'
ALTER TABLE users ADD COLUMN kyc_submission_id UUID REFERENCES kyc_submissions(id);
ALTER TABLE users ADD COLUMN subscription_status VARCHAR(32) DEFAULT 'none';
  -- 'none' | 'trial' | 'active' | 'past_due' | 'cancelled'
ALTER TABLE users ADD COLUMN subscription_plan_id VARCHAR(32) REFERENCES billing_plans(id);
ALTER TABLE users ADD COLUMN subscription_cycle VARCHAR(8);
ALTER TABLE users ADD COLUMN trial_ends_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN next_charge_at TIMESTAMPTZ;
```

---

## 3. State machine chuẩn (PHẢI giữ giống frontend)

Frontend đã định nghĩa 7 state ở `lib/features/verify/data/models/verify_enums.dart`:

```
draft (chưa upload đủ)
  │ uploadCCCDFront() → ocr_result, confidence
  │ uploadCCCDBack()
  │ uploadSelfie() → face_match_score
  ▼
kycSubmitted (đủ 3 ảnh)
  │ initiatePayment(plan, cycle, method)
  ▼
paymentPending (chờ tiền vào)
  │ webhook hoặc poll → status='paid'
  │ → tự động submitForApproval()
  ▼
awaitingApproval (admin xét)
  │ admin click duyệt           │ admin click reject
  ▼                              ▼
approved                       rejected
  │                              │ user resubmit() → upload lại item rejected
  │                              │   → lặp về awaitingApproval
  │                              │ HOẶC requestRefund()
  │                              ▼
  ▼                            refunded (END)
trial 7d → auto-charge subscription
```

**Backend BẮT BUỘC** trả về đúng tên status (snake_case ↔ camelCase). Mapping rõ ràng:

| Backend (DB) | API response (JSON) | Frontend enum |
|---|---|---|
| `draft` | `"draft"` | `VerifyStatus.draft` |
| `kyc_submitted` | `"kycSubmitted"` | `VerifyStatus.kycSubmitted` |
| `payment_pending` | `"paymentPending"` | `VerifyStatus.paymentPending` |
| `awaiting_approval` | `"awaitingApproval"` | `VerifyStatus.awaitingApproval` |
| `approved` | `"approved"` | `VerifyStatus.approved` |
| `rejected` | `"rejected"` | `VerifyStatus.rejected` |
| `refunded` | `"refunded"` | `VerifyStatus.refunded` |

→ Backend nên dùng **camelCase trong JSON response** để frontend khỏi map lại (khớp pattern hiện tại).

---

## 4. Endpoints chi tiết

> **Auth**: tất cả endpoint dưới yêu cầu `Authorization: Bearer <user_token>`. Owner bị scope: chỉ thao tác trên submission của chính mình. ADMIN bypass.
> **Format response**: `{ success: bool, data?: any, message?: string, error?: string }`
> **Body multipart cho upload**: `Content-Type: multipart/form-data`, key `image`.

---

### 4.1 `POST /kyc/upload-cccd-front` — Upload CCCD mặt trước

Match repo method `uploadCCCDFront(File image)` ở `verify_repository.dart:48-50`.

**Request**:
```http
POST /kyc/upload-cccd-front
Content-Type: multipart/form-data
Authorization: Bearer <token>

image: <binary jpg/png, max 5MB>
```

**Backend xử lý**:
1. Lấy hoặc tạo `kyc_submission` cho `user_id`. Nếu chưa có submission đang `draft|rejected` → tạo mới.
2. Upload file lên S3/MinIO → trả `image_url` và `image_url_thumb`.
3. Gọi **FPT.AI ID Recognition API** → parse OCR fields.
4. Lưu `kyc_uploads` record với `type='cccd_front'`, `ocr_result`, `ocr_confidence`.
5. Trả response cho client.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "upl_abc123",
    "imageUrl": "https://cdn.halong24h.vn/kyc/cccd-front-abc123.jpg",
    "ocrResult": {
      "cccdNumber": "001234567890",
      "fullName": "NGUYỄN VĂN A",
      "dob": "12/05/1992",
      "address": "123 Đường ABC, Phường XYZ, TP.HCM",
      "gender": "Nam",
      "expiryDate": "12/05/2027"
    },
    "confidence": 0.92,
    "uploadedAt": "2026-05-03T10:30:00Z"
  }
}
```

**Error 400** — OCR fail / image quality kém:
```json
{ "success": false, "error": "ocr_failed",
  "message": "Không nhận diện được CCCD. Hãy chụp lại với ánh sáng tốt hơn." }
```

**Error 422** — Confidence thấp (≥ 0.5 nhưng < 0.8) — vẫn lưu, frontend warn user:
```json
{
  "success": true,
  "data": { ...ocr fields..., "confidence": 0.65 }
}
```
→ Frontend đã có logic bắt confidence < 0.8 (xem `verify_flow_controller.dart:48`).

---

### 4.2 `POST /kyc/upload-cccd-back` — Upload CCCD mặt sau

Tương tự 4.1 nhưng `type='cccd_back'`. OCR mặt sau lấy được ngày cấp + nơi cấp + đặc điểm nhận dạng. Có thể bỏ trống `ocrResult` nếu không cần — frontend không bắt buộc đọc.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "id": "upl_def456",
    "imageUrl": "https://cdn.halong24h.vn/kyc/cccd-back-def456.jpg",
    "ocrResult": {
      "issueDate": "15/06/2021",
      "issuePlace": "Cục Cảnh sát ĐKQL cư trú và DLQG về dân cư"
    },
    "confidence": 0.88,
    "uploadedAt": "2026-05-03T10:32:00Z"
  }
}
```

---

### 4.3 `POST /kyc/upload-selfie` — Upload selfie + face match

Match repo `uploadSelfie(File image, {String? cccdFrontId})` ở `verify_repository.dart:54-57`.

**Request**:
```http
POST /kyc/upload-selfie
Content-Type: multipart/form-data
Authorization: Bearer <token>

image: <binary>
cccdFrontId: upl_abc123        # ID upload CCCD trước (đã upload trước đó)
```

**Backend xử lý**:
1. Lookup `kyc_uploads` cho `cccdFrontId` → lấy `image_url` của CCCD front.
2. Gọi **FPT.AI Face Match** API → trả score 0..1.
3. Optional: gọi **FPT.AI Liveness Detection** với selfie video/multi-frame nếu client gửi → trả liveness score.
4. Lưu `kyc_uploads` với `type='selfie'`, `face_match_score`, `liveness_score`.
5. Quyết định `isValid`:
   - `face_match_score >= 0.85 AND (liveness_score IS NULL OR >= 0.7)` → `isValid = true`
   - `< 0.85` → `isValid = false` — frontend tăng `selfieFailAttempts`, lock sau 3 lần
6. Nếu cả 3 upload đầy đủ + `selfie.isValid` → tự động set `submission.status = 'kyc_submitted'`.

**Response 200 — pass**:
```json
{
  "success": true,
  "data": {
    "id": "upl_sel789",
    "imageUrl": "https://cdn.halong24h.vn/kyc/selfie-sel789.jpg",
    "faceMatchScore": 0.94,
    "isValid": true,
    "uploadedAt": "2026-05-03T10:35:00Z"
  }
}
```

**Response 200 — fail**:
```json
{
  "success": true,
  "data": {
    "id": "upl_sel790",
    "imageUrl": "...",
    "faceMatchScore": 0.62,
    "isValid": false,
    "uploadedAt": "..."
  }
}
```
→ Frontend tự bắt `isValid: false` để tăng counter (xem `verify_flow_controller.dart:78-90`). KHÔNG return 4xx, để frontend handle UX retry.

---

### 4.4 `GET /billing/plans` — Lấy catalog plan

Match repo `fetchPlans()` ở `verify_repository.dart:60`.

**Request**: `GET /billing/plans` (no auth required, public).

**Response 200**:
```json
{
  "success": true,
  "data": [
    {
      "id": "starter",
      "name": "Starter",
      "pricePerRoom": 199000,
      "minCharge": 1999000,
      "maxRooms": 20,
      "yearlyDiscountPct": 20,
      "vatPct": 10,
      "features": [
        "Booking + Calendar",
        "Check-in / Check-out",
        "Báo cáo cơ bản"
      ]
    },
    {
      "id": "professional",
      "name": "Professional",
      "pricePerRoom": 149000,
      "minCharge": 2999000,
      "maxRooms": 50,
      "yearlyDiscountPct": 20,
      "vatPct": 10,
      "features": ["Tất cả của Starter", "Pricing rules", "Dynamic pricing", "Housekeeping", "Báo cáo nâng cao"]
    },
    {
      "id": "enterprise",
      "name": "Enterprise",
      "pricePerRoom": 99000,
      "minCharge": 4999000,
      "maxRooms": null,
      "yearlyDiscountPct": 20,
      "vatPct": 10,
      "features": ["Tất cả của Pro", "Multi-property", "Channel sync", "API/Webhook", "Hỗ trợ 24/7"]
    }
  ]
}
```

→ Source of truth = bảng `billing_plans`. Admin sửa giá → frontend tự lấy mới.

---

### 4.5 `POST /payments/initiate` — Tạo payment session

Match repo `initiatePayment({planId, cycle, method, rooms, totalAmount})` ở `verify_repository.dart:63-69`.

**Request**:
```http
POST /payments/initiate
Authorization: Bearer <token>
Content-Type: application/json

{
  "planId": "professional",
  "cycle": "yearly",        // monthly | yearly
  "method": "vnpayQR",      // vnpayQR | bankTransfer | card
  "rooms": 15,
  "totalAmount": 35268000   // FE tính sẵn để verify với BE
}
```

**Backend xử lý**:
1. Verify `totalAmount` khớp với `plan.pricePerRoom * rooms * monthsInCycle * (1 - discount) * (1 + vat)` — sai → 400 `amount_mismatch`.
2. Tạo `payment_sessions` record.
3. Theo `method`:
   - **vnpayQR**: gọi VNPay tạo QR → lưu `qr_code` base64
   - **bankTransfer**: random `accountNumber` từ pool TKNH công ty + nội dung CK = `KYC<submissionId8>` → lưu `bank_info`
   - **card**: tạo VNPay checkout URL → lưu `redirect_url`
4. Trả PaymentSession.

**Response 200 — vnpayQR**:
```json
{
  "success": true,
  "data": {
    "sessionId": "pay_xyz789",
    "method": "vnpayQR",
    "totalAmount": 35268000,
    "qrCode": "iVBORw0KGgoAAAANSUhEUgAA...",
    "expiresAt": "2026-05-03T11:05:00Z"
  }
}
```

**Response 200 — bankTransfer**:
```json
{
  "success": true,
  "data": {
    "sessionId": "pay_xyz790",
    "method": "bankTransfer",
    "totalAmount": 35268000,
    "bankInfo": {
      "bankName": "Vietcombank",
      "accountNumber": "0011004567890",
      "accountName": "CONG TY HALONG24H",
      "content": "KYC abc123de"
    },
    "expiresAt": "2026-05-03T11:35:00Z"
  }
}
```

**Response 200 — card**:
```json
{
  "success": true,
  "data": {
    "sessionId": "pay_xyz791",
    "method": "card",
    "totalAmount": 35268000,
    "redirectUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
    "expiresAt": "2026-05-03T11:05:00Z"
  }
}
```

---

### 4.6 `GET /payments/{sessionId}/status` — Poll trạng thái thanh toán

Match repo `checkPaymentStatus(String sessionId)` ở `verify_repository.dart:71`.

**Request**: `GET /payments/pay_xyz789/status`

**Response 200**:
```json
{ "success": true, "data": { "status": "paid" } }
```
Status: `pending | paid | failed | expired | refunded` (5 enum khớp `PaymentStatus` ở frontend).

**Backend logic**:
- VNPay/bank webhook bắn về `/webhooks/vnpay` (xem 4.11) → set status = paid.
- Cron job mỗi 5 phút: SET status='expired' WHERE status='pending' AND expires_at < NOW().
- Khi status chuyển sang `paid`: tự động set `kyc_submissions.status = 'kyc_submitted'` rồi `'awaiting_approval'` (có thể dồn 2 step → 1 step luôn vì sau khi pay xong là chờ admin duyệt).

→ Frontend poll endpoint này mỗi 3s, max 5 phút (xem `payment_screen.dart:77-115`).

---

### 4.7 `POST /kyc/submit` — Submit hồ sơ chờ duyệt (manual)

Match repo `submitForApproval()` ở `verify_repository.dart:73`.

**Khi nào dùng**: Hầu hết case backend tự submit khi payment paid. Endpoint này dùng cho trường hợp đặc biệt (vd payment qua bank transfer thủ công, admin enter vào DB).

**Request**: `POST /kyc/submit` (body rỗng, lấy submission từ token).

**Response 200**:
```json
{
  "success": true,
  "data": { "submissionId": "sub_aaa111", "status": "awaitingApproval" }
}
```

**Error 400 — chưa đủ điều kiện**:
```json
{ "success": false, "error": "incomplete_kyc",
  "message": "Cần upload đủ CCCD trước, sau và selfie." }
```

---

### 4.8 `GET /kyc/submissions/{id}` — Poll trạng thái duyệt

Match repo `checkApprovalStatus(String submissionId)` ở `verify_repository.dart:75`.

**Request**: `GET /kyc/submissions/sub_aaa111`

**Response 200 — đang chờ**:
```json
{
  "success": true,
  "data": { "status": "awaitingApproval" }
}
```

**Response 200 — đã duyệt**:
```json
{
  "success": true,
  "data": {
    "status": "approved",
    "approvedAt": "2026-05-03T14:00:00Z",
    "trialEndsAt": "2026-05-10T14:00:00Z",
    "chargeStartsAt": "2026-05-10T14:00:00Z"
  }
}
```

**Response 200 — bị reject**:
```json
{
  "success": true,
  "data": {
    "status": "rejected",
    "rejectReason": "Ảnh CCCD bị mờ, không đọc được số. Selfie không khớp với ảnh trên CCCD.",
    "rejectedItems": ["cccdFront", "selfie"]
  }
}
```
→ `rejectedItems` là array các string khớp enum `RejectableItem` ở frontend (`verify_enums.dart`): `cccdFront | cccdBack | selfie | identity`.

→ Frontend poll mỗi 30s ở pending screen (`pending_approval_screen.dart`).
→ **TỐT HƠN**: gửi FCM push khi admin duyệt → frontend invalidate provider thay vì poll. Xem section 6.

---

### 4.9 `POST /kyc/submissions/{id}/resubmit` — Re-upload sau khi bị reject

Match repo `resubmit({List<RejectableItem> items})` ở `verify_repository.dart:77`.

**Request**:
```http
POST /kyc/submissions/sub_aaa111/resubmit
Content-Type: application/json

{ "items": ["cccdFront", "selfie"] }
```

**Backend xử lý**:
1. Verify submission đang ở status `rejected`.
2. Reset `submission.status = 'draft'`, xoá các `kyc_uploads` cho `type` trong `items`.
3. Trả thành công — frontend sẽ điều hướng user về screen capture lại.
4. Sau khi user upload lại đủ → backend tự set status `kyc_submitted` → `awaiting_approval`.

**Response 200**:
```json
{ "success": true, "data": { "status": "draft" } }
```

---

### 4.10 `POST /payments/{sessionId}/refund` — Yêu cầu hoàn tiền

Match repo `requestRefund(String submissionId)` ở `verify_repository.dart:79`.

**Khi nào dùng**: User bị reject muốn hoàn tiền (không resubmit), HOẶC payment đã pay nhưng admin reject toàn bộ.

**Request**: `POST /payments/pay_xyz789/refund`

**Backend xử lý**:
1. Verify submission ở status `rejected` HOẶC `awaiting_approval`.
2. Verify payment status là `paid`.
3. Gọi VNPay refund API (hoặc tạo task thủ công cho bank transfer).
4. Cập nhật `payment_sessions.status = 'refunded'`, `refunded_amount`, `refunded_at`.
5. Cập nhật `kyc_submissions.status = 'refunded'`.

**Response 200**:
```json
{
  "success": true,
  "data": {
    "refunded": true,
    "amount": 35268000,
    "refundedAt": "2026-05-03T15:00:00Z"
  }
}
```

→ Bank transfer thực tế phải xử lý thủ công (admin nhận yêu cầu → chuyển khoản → đánh dấu refunded). VNPay/MoMo có API refund tự động.

---

### 4.11 `POST /webhooks/vnpay` — Webhook nhận callback VNPay

(Internal endpoint, không expose cho client)

**Request**: VNPay gọi server với payload IPN (xem [VNPay docs](https://sandbox.vnpayment.vn/apis/docs/loai-hinh-tich-hop/)).

**Backend xử lý**:
1. **Verify signature** (cực kỳ quan trọng — không verify = ai cũng fake được payment).
2. Tìm `payment_sessions` theo `vnp_TxnRef`.
3. Update `status` theo `vnp_ResponseCode` (00 = success).
4. Nếu paid → update submission status, optionally trigger admin notification.
5. Trả `{RspCode: '00', Message: 'Confirm Success'}` cho VNPay.

**Idempotent**: nếu VNPay gửi duplicate (retry) → check `provider_txn_id` đã ghi nhận chưa, skip nếu rồi.

---

### 4.12 Endpoints cho ADMIN duyệt (queue)

Admin cần screen riêng — đây là endpoint backend cho dashboard admin.

#### `GET /admin/kyc/queue`
List các submission `awaiting_approval`. Hỗ trợ pagination + filter.

**Response**:
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "sub_aaa111",
        "user": { "id": "u1", "name": "Nguyễn Văn A", "phone": "0900...", "email": "..." },
        "submittedAt": "2026-05-03T11:00:00Z",
        "uploads": {
          "cccdFront": { "imageUrl": "...", "ocrResult": {...}, "confidence": 0.92 },
          "cccdBack":  { "imageUrl": "...", "confidence": 0.88 },
          "selfie":    { "imageUrl": "...", "faceMatchScore": 0.94 }
        },
        "expectedRooms": 15,
        "plan": "professional",
        "totalPaid": 35268000
      }
    ],
    "total": 23,
    "page": 1,
    "pageSize": 20
  }
}
```

#### `POST /admin/kyc/submissions/{id}/approve`
Body: `{ trialDays: 7 }` (optional, default 7).
Backend: set `status='approved'`, `approved_at=NOW()`, `trial_ends_at=NOW()+7d`, `charge_starts_at=NOW()+7d`. Update `users.kyc_status='approved'`, `users.subscription_status='trial'`. Gửi FCM cho user.

#### `POST /admin/kyc/submissions/{id}/reject`
Body: `{ reason: "string", items: ["cccdFront","selfie"] }`.
Backend: set `status='rejected'`, `reject_reason`, `rejected_items`. Update `users.kyc_status='rejected'`. Gửi FCM cho user.

---

## 5. Side effect lên `users` table — quan trọng

Hiện frontend KHÔNG sync `UserModel` khi verify approved. Cần fix bằng cách:

| Trigger | Cập nhật `users.*` |
|---|---|
| `submission.status` chuyển → `awaiting_approval` | `kyc_status = 'pending'` |
| Admin approve | `kyc_status = 'approved'`, `subscription_status = 'trial'`, `trial_ends_at`, `subscription_plan_id`, `subscription_cycle`, `next_charge_at` |
| Admin reject | `kyc_status = 'rejected'` |
| User refund | `kyc_status = 'rejected'`, `subscription_status = 'cancelled'` |
| Cron khi `trial_ends_at` qua | Charge subscription → `subscription_status = 'active'` (hoặc `past_due` nếu charge fail) |

→ `GET /auth/profile` PHẢI trả về các field mới này trong user payload.

→ Sau khi sync xong, business rule khác mới hoạt động đúng:
- `POST /bookings/customer-hold` cần check `owner.kyc_status = 'approved'` → 403 `owner_not_verified` nếu không (đã đề cập trong file `api-staff-owner-scope-spec.md` mục 6).
- `POST /properties` cần check `kyc_status = 'approved'` (chặn OWNER chưa verify đăng phòng).

---

## 6. Notification (FCM push) — UX nâng cao

**Thay vì frontend poll mỗi 30s ở pending screen**, dùng FCM push để tiết kiệm pin + giảm latency:

| Sự kiện | Push payload | Frontend hành động |
|---|---|---|
| Payment paid (webhook VNPay nhận) | `{type:'kyc_payment_paid', submissionId}` | Invalidate `verifyFlowController` → đẩy thẳng về `/verify/pending` |
| Admin approve | `{type:'kyc_approved', submissionId, trialEndsAt}` | Invalidate → đẩy về `/verify/approved` (TrialActiveScreen) |
| Admin reject | `{type:'kyc_rejected', submissionId, rejectedItems, reason}` | Invalidate → đẩy về `/verify/rejected` |
| Refund processed | `{type:'kyc_refunded', amount}` | Show snackbar success + refresh dashboard |
| Trial sắp hết (T-2 ngày) | `{type:'trial_ending_soon', daysLeft: 2}` | In-app banner + push noti |

Polling endpoints VẪN giữ làm fallback (FCM có thể trượt). Frontend thiết kế: nhận push → invalidate → poll 1 lần liền để xác nhận state mới.

---

## 7. Error codes

Backend trả format chuẩn `{success: false, error: '<code>', message: '<vi text>'}`:

| HTTP | `error` | Message gợi ý |
|:-:|---|---|
| 400 | `ocr_failed` | "Không nhận diện được CCCD. Hãy chụp lại." |
| 400 | `face_detection_failed` | "Không phát hiện khuôn mặt trong ảnh selfie." |
| 400 | `incomplete_kyc` | "Cần upload đủ CCCD trước, sau và selfie." |
| 400 | `amount_mismatch` | "Số tiền thanh toán không khớp với gói đã chọn." |
| 400 | `invalid_plan` | "Gói không tồn tại hoặc đã ngừng cung cấp." |
| 400 | `room_count_exceeds_plan` | "Số phòng vượt quá giới hạn của gói." |
| 403 | `submission_not_owned` | "Bạn không có quyền truy cập hồ sơ này." |
| 403 | `cannot_resubmit` | "Hồ sơ không thể resubmit ở trạng thái hiện tại." |
| 404 | `submission_not_found` | "Không tìm thấy hồ sơ verify." |
| 409 | `submission_already_paid` | "Hồ sơ đã thanh toán, không thể tạo session mới." |
| 409 | `payment_already_refunded` | "Đã hoàn tiền cho giao dịch này." |
| 410 | `payment_session_expired` | "Phiên thanh toán đã hết hạn. Vui lòng tạo mới." |
| 422 | `low_ocr_confidence` | (dùng kèm response 200, chỉ là warning) |
| 422 | `face_match_failed` | (dùng kèm response 200, để frontend tăng counter) |
| 502 | `provider_unavailable` | "Dịch vụ verify tạm gián đoạn. Vui lòng thử lại sau." |

Frontend đã có code bắt một số error code này (xem `verify_flow_controller.dart`) — cần backend trả đúng tên.

---

## 8. Test cases (acceptance)

### 8.1 Happy path
- [ ] Owner mới đăng ký → upload CCCD front (OCR confidence ≥ 0.85) → upload back → upload selfie (face match ≥ 0.85) → chọn Pro yearly 15 phòng → init VNPay QR → quét trả tiền → webhook VNPay vào → status = `awaiting_approval` trong < 5s
- [ ] Admin mở queue → thấy submission → approve → user nhận FCM trong < 5s → mở app vào `/verify/approved` thấy đúng `trialEndsAt = NOW() + 7d`
- [ ] User vào dashboard → `users.kyc_status = 'approved'`, banner verify biến mất
- [ ] Sau 7 ngày, cron auto-charge thẻ → `subscription_status = 'active'`

### 8.2 OCR failure
- [ ] Upload ảnh CCCD mờ → confidence = 0.45 → response 400 `ocr_failed` → frontend show "chụp lại"
- [ ] Upload ảnh CCCD trung bình → confidence = 0.7 → response 200 + warning → frontend hiện thông điệp confirm

### 8.3 Face match failure
- [ ] Upload selfie không khớp CCCD (face match 0.5) → response 200 `isValid: false` → frontend tăng `selfieFailAttempts`
- [ ] Sau 3 lần fail → frontend khoá button capture, hiện CTA "Liên hệ hỗ trợ"

### 8.4 Payment edge case
- [ ] Init VNPay QR → user không quét trong 30 phút → `expires_at` qua → cron set `status='expired'` → frontend poll trả `expired` → show "Tạo session mới"
- [ ] User quét VNPay nhưng tiền vào tài khoản khác (sai content) → backend không match → submission vẫn `payment_pending` → admin manual reconcile

### 8.5 Reject + resubmit
- [ ] Admin reject với `rejectedItems = ['selfie']` → user nhận FCM → vào `/verify/rejected` thấy item bị reject
- [ ] Click "Chụp lại selfie" → POST `/kyc/submissions/{id}/resubmit` với `items: ['selfie']` → quay lại `/verify/selfie` → upload mới → status quay về `awaiting_approval`
- [ ] CCCD trước/sau KHÔNG bị xoá nếu không nằm trong `items`

### 8.6 Refund flow
- [ ] User chọn refund thay vì resubmit → POST `/payments/{id}/refund` → VNPay refund API trả OK → status = `refunded` → user nhận FCM → app reset state

### 8.7 Authorization
- [ ] User A cố GET submission của user B → 403 `submission_not_owned`
- [ ] Non-admin gọi `/admin/kyc/queue` → 403 `forbidden`

### 8.8 Idempotency
- [ ] VNPay gửi webhook 2 lần liền → submission chỉ chuyển status 1 lần, FCM chỉ gửi 1 lần
- [ ] User upload CCCD front 2 lần → `kyc_uploads` chỉ có 1 record cho `type='cccd_front'` (UNIQUE constraint), record cũ bị overwrite hoặc cập nhật (xem CONSTRAINT `one_per_type`)

---

## 9. Migration & rollout

### 9.1 Migration SQL

Chạy theo thứ tự:
1. `CREATE TABLE billing_plans` + seed 3 plan default
2. `CREATE TABLE kyc_submissions`
3. `CREATE TABLE kyc_uploads`
4. `CREATE TABLE payment_sessions`
5. `ALTER TABLE users ADD COLUMN kyc_status, kyc_submission_id, subscription_*, trial_ends_at, next_charge_at`
6. Backfill: `UPDATE users SET kyc_status = 'none' WHERE kyc_status IS NULL`

### 9.2 Storage

S3 / MinIO bucket riêng cho KYC images:
- Bucket policy: **private**, không cho public download
- Lifecycle rule: rejected/refunded sau 6 tháng → archive Glacier
- Encryption at rest: AES-256
- Pre-signed URL có TTL 5 phút khi admin xem queue

### 9.3 Provider setup

- Đăng ký account [FPT.AI Vision](https://fpt.ai/products/fpt-ai-ekyc/) → lấy API key
- Đăng ký VNPay merchant (production) → lấy `vnp_TmnCode`, `vnp_HashSecret`
- Lưu credentials trong env var, KHÔNG hardcode

### 9.4 Rollout chiến lược

1. **Phase 1** — Deploy backend với feature flag `KYC_ENABLED=false`. Smoke test admin queue endpoint.
2. **Phase 2** — Bật flag cho 5 owner test (whitelist). Theo dõi log + metric.
3. **Phase 3** — Bật toàn bộ. OWNER hiện hữu (chưa verify) → bắt buộc verify trong 30 ngày, sau đó block đăng phòng.

---

## 10. PROMPT cho AI để implement backend

> **Copy nguyên block dưới** vào AI coding tool (Claude Code / Cursor / Copilot) khi đang ở repo backend.

```
Bạn là backend engineer làm việc trên repo Halong24h API (Node.js + Express + Postgres, base URL http://103.183.118.148:3000, swagger http://103.183.118.148/index.html).

Nhiệm vụ: Implement KYC (verify identity) cho OWNER theo spec dưới. Wrap FPT.AI eKYC làm provider — frontend không biết provider nào, backend abstract hết. Tuân thủ format response hiện tại {success, data, message, error}.

YÊU CẦU:

1. MIGRATION
   - Tạo bảng: billing_plans, kyc_submissions, kyc_uploads, payment_sessions
   - ALTER users: thêm kyc_status, kyc_submission_id, subscription_status, subscription_plan_id, subscription_cycle, trial_ends_at, next_charge_at
   - Seed 3 billing_plans: starter (199k/phòng, sàn 1.999k, max 20), professional (149k, 2.999k, 50), enterprise (99k, 4.999k, unlimited)
   - Index: kyc_submissions(user_id), kyc_submissions(status) WHERE awaiting/payment, kyc_uploads(submission_id), payment_sessions(status, expires_at) WHERE pending

2. INTEGRATION FPT.AI EKYC
   - Module wrapper `services/fptai.js` với 3 method:
       * recognizeIdCard(imageBuffer, side) → {ocr, confidence, providerRequestId}
       * faceMatch(idCardImageUrl, selfieImageBuffer) → {score, providerRequestId}
       * livenessCheck(selfieImageBuffer) → {score} — optional (nếu FPT.AI có)
   - API key trong env: FPT_AI_API_KEY, FPT_AI_API_SECRET
   - Timeout 30s, retry 1 lần khi 5xx
   - Log raw response vào kyc_uploads.provider_payload (cho audit)

3. INTEGRATION VNPAY
   - Module wrapper `services/vnpay.js`:
       * createQR({amount, orderInfo, txnRef, expireInMinutes}) → {qrCodeBase64}
       * createCheckoutUrl(...) → {redirectUrl}
       * verifyIPN(query) → {valid, txnRef, responseCode}
       * refund({txnRef, amount, txnDate}) → {success, refundTxnRef}
   - Verify signature CỰC KỲ kỹ ở /webhooks/vnpay — không verify = fake được payment

4. UPLOAD IMAGES
   - Sử dụng S3/MinIO (env: S3_ENDPOINT, S3_BUCKET_KYC). Bucket private.
   - Upload original + thumbnail (300x — dùng sharp resize)
   - Trả pre-signed URL TTL 1 giờ cho client xem (cho admin: TTL 5 phút khi mở queue)

5. ENDPOINTS (chi tiết section 4 spec):
   - POST   /kyc/upload-cccd-front       → multipart, OCR via FPT.AI
   - POST   /kyc/upload-cccd-back        → multipart, OCR optional
   - POST   /kyc/upload-selfie           → multipart + cccdFrontId, face match via FPT.AI
   - GET    /billing/plans               → list active plans (public)
   - POST   /payments/initiate           → tạo session (vnpayQR/bankTransfer/card)
   - GET    /payments/:id/status         → poll (5 enum)
   - POST   /kyc/submit                  → manual submit (rare)
   - GET    /kyc/submissions/:id         → poll approval
   - POST   /kyc/submissions/:id/resubmit→ reset items
   - POST   /payments/:id/refund         → gọi VNPay refund
   - POST   /webhooks/vnpay              → IPN listener (KHÔNG cần auth, verify signature)
   - GET    /admin/kyc/queue             → admin only, paginate
   - POST   /admin/kyc/submissions/:id/approve   → admin only, body {trialDays}
   - POST   /admin/kyc/submissions/:id/reject    → admin only, body {reason, items}

6. STATE MACHINE (BẮT BUỘC giữ tên status trong response — camelCase):
   draft → kycSubmitted → paymentPending → awaitingApproval → approved/rejected
   rejected → (resubmit) draft → ...
   any → refunded (END)
   Backend tự transition khi đủ điều kiện (vd payment paid → tự set awaitingApproval)

7. SIDE EFFECT TRÊN BẢNG users
   - Submit submission: users.kyc_status='pending'
   - Admin approve: users.kyc_status='approved', subscription_status='trial', trial_ends_at, plan_id, cycle
   - Admin reject: users.kyc_status='rejected'
   - Refund: users.kyc_status='rejected', subscription_status='cancelled'
   - GET /auth/profile PHẢI trả các field mới này

8. FCM PUSH (nếu repo đã có notification module):
   - kyc_payment_paid     → khi webhook VNPay xác nhận tiền vào
   - kyc_approved         → khi admin approve
   - kyc_rejected         → khi admin reject (kèm rejectedItems, reason)
   - kyc_refunded         → khi refund xong
   - trial_ending_soon    → cron T-2 ngày trước trial_ends_at

9. CRON JOBS
   - Mỗi 5 phút: payment_sessions.status='pending' AND expires_at < NOW() → SET 'expired'
   - Mỗi giờ: kyc_submissions stuck ở 'awaiting_approval' > 24h → notify admin
   - Mỗi ngày 00:00: users.subscription_status='trial' AND trial_ends_at < NOW() → charge → set 'active' hoặc 'past_due'
   - Mỗi ngày 09:00: users có trial_ends_at = NOW() + 2d → push trial_ending_soon

10. ERROR CODES (PHẢI dùng đúng tên):
    400: ocr_failed, face_detection_failed, incomplete_kyc, amount_mismatch, invalid_plan, room_count_exceeds_plan
    403: submission_not_owned, cannot_resubmit, forbidden
    404: submission_not_found
    409: submission_already_paid, payment_already_refunded
    410: payment_session_expired
    422: low_ocr_confidence, face_match_failed (kèm response 200, chỉ là hint)
    502: provider_unavailable

11. SECURITY
    - S3 bucket KYC: private. Pre-signed URL TTL 1h cho user, 5min cho admin.
    - VNPay IPN: verify signature.
    - Encrypt at rest cho ảnh KYC (S3 SSE-S3 hoặc KMS).
    - Log audit cho mọi admin action (approve/reject) vào bảng audit_logs (nếu chưa có thì tạo).
    - Rate limit POST /kyc/upload-* : 10 req/phút/user (chống flood storage).

12. TEST
    Viết integration test cho 8 nhóm case ở section 8 spec:
    happy path, OCR failure, face match failure, payment expired, reject + resubmit, refund, authorization, idempotency.
    Mock FPT.AI + VNPay (không gọi real trong test).

13. KHÔNG ĐƯỢC LÀM
    - Đổi format response chung
    - Đặt tên status khác camelCase đã định
    - Skip verify VNPay signature
    - Public S3 bucket
    - Hardcode FPT.AI/VNPay keys
    - Self-approve (admin tự duyệt cho chính mình) — block trong /admin/kyc/approve nếu approved_by === submission.user_id

OUTPUT:
- Diff các file: routes, controllers, services (fptai, vnpay, kyc), middleware (admin guard), models, migrations
- Migration SQL files
- Test files (jest hoặc framework đang dùng)
- Update Swagger docs cho các endpoint mới
- Brief PR description tiếng Việt: tóm tắt thay đổi, env var mới cần set, cách rollback, smoke test checklist
```

---

## 11. Frontend follow-up sau khi backend xong

- [ ] Tạo `lib/features/verify/data/repositories/verify_repository_impl.dart` (real impl, hiện chỉ có abstract + mock) — implement đúng 10 method theo contract
- [ ] Override provider trong `verify_flow_controller.dart` để dùng impl thật khi `kReleaseMode`
- [ ] Bắt error code mới ở UI: `ocr_failed`, `face_match_failed`, `payment_session_expired`…
- [ ] Wire FCM listener: khi nhận `type=kyc_*` → `ref.invalidate(verifyFlowControllerProvider)` + `ref.invalidate(currentUserProvider)`
- [ ] Wire SharedPreferences cho draft persistence (xem TODO ở `verify_flow_controller.dart:247`)
- [ ] Update `app_router.dart` redirect: nếu `user.isOwner && user.kyc_status != 'approved'` → block các route quản lý phòng → redirect về `/verify/cccd-front`
- [ ] Update banner trên dashboard: dùng `user.kyc_status` thay vì `verifyFlowController.status` (source of truth là user, không phải local state)

---

## 12. Tham khảo

- [FPT.AI eKYC Documentation](https://docs-vision.fpt.ai/en/ekyc/)
- [VNPay sandbox docs](https://sandbox.vnpayment.vn/apis/docs/loai-hinh-tich-hop/)
- [Stripe Identity API patterns](https://docs.stripe.com/connect/handling-api-verification) — tham khảo cách Stripe abstract eKYC provider
- [KYC API best practices 2026](https://kycaid.com/blog/kyc-api-integration-fintech-guide/)
- Halong24h frontend code: `lib/features/verify/` (toàn bộ flow + state machine + mock repo đã sẵn sàng)
