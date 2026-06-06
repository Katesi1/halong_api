# Report cho BE — Subscription billing logic

> **From**: FE Android team (Flutter)
> **To**: BE team
> **Date**: 2026-06-06
> **Re**: Logic tính tiền gia hạn / mua lại / nâng cấp gói subscription OWNER
> **Tham chiếu FE**: `lib/features/verify/`, `docs/FE_APP_ANDROID.md` §Billing, `docs/API_SPEC_FULL.md` §10
> **Nguyên tắc**: **BE là source of truth** cho mọi tính toán tiền và thời hạn. FE chỉ hiển thị số BE trả về.

---

## 1. Bối cảnh — FE đang làm gì hôm nay

FE có **2 luồng thanh toán** subscription:

| Luồng | Nút UI | API FE gọi | Body FE gửi |
|---|---|---|---|
| **Gia hạn** | `Gia hạn ngay` trên `/verify/subscription-detail` | `POST /payments/renew` | `{ method: "bank_transfer" }` |
| **Chọn gói / Nâng cấp** | `Nâng cấp gói` → `/verify/select-plan?mode=upgrade` → `/verify/payment` | `POST /payments/initiate` | `{ planId, cycle, method, rooms, totalAmount }` |

**FE hiện tại:**
- Tự tính `totalAmount` theo công thức cố định (xem §2) rồi gửi lên BE validate.
- **Không** cộng thêm tháng, **không** prorate, **không** đọc `subscriptionPriceOverride`.
- Sau mark-paid: `refreshProfile()` → hiển thị `nextChargeAt`, `subscriptionPlanLabel`, v.v.

**Yêu cầu:** Toàn bộ logic nghiệp vụ (extend period, upgrade prorate, downgrade policy, validate amount) **phải nằm ở BE**. FE chỉ render field BE trả về.

---

## 2. Công thức giá chuẩn (BE validate + tính expected)

### 2.1 Giá catalog

```
monthlySubtotal = plan.monthlyPrice
                hoặc user.subscriptionPriceOverride (nếu != null)
yearlySubtotal  = monthlySubtotal × 12 × 0.8   // giảm 20% gói năm
vat             = round(subtotal × 0.10)       // VAT 10%
expectedTotal   = subtotal + vat
```

| Chu kỳ | Subtotal | VAT | Ví dụ Starter 599.000đ/th |
|---|---|---|---|
| `monthly` | 599.000 | 59.900 | **658.900** |
| `yearly` | 5.750.400 | 575.040 | **6.325.440** |

### 2.2 Override giá admin

Theo `API_SPEC_FULL.md` §10.5 — giữ nguyên:
- `subscriptionPriceOverride` (VND/**kỳ**, không VAT) thay `monthlyPrice` khi tính subtotal.
- `priceOverride = 0` → miễn phí, `expectedTotal = 0`.
- `priceOverride = null` → fallback catalog.
- Tolerance validate `totalAmount` FE gửi: **±1%** so với `expectedTotal` BE tính. Sai → `400 amountMismatch`.

### 2.3 Plan ID

`rooms_1 | rooms_5 | rooms_10 | rooms_20 | rooms_50 | enterprise | starter_test`  
`cycle` lưu riêng: `monthly | yearly` — **không** suffix `_monthly`/`_yearly` trong planId.

---

## 3. State machine subscription (BE implement)

### 3.1 Model thời hạn

BE cần lưu và expose (ít nhất qua `/auth/profile`):

| Field | Mô tả |
|---|---|
| `currentPeriodStart` | Bắt đầu kỳ hiện tại |
| `currentPeriodEnd` | Hết hạn kỳ hiện tại (= ngày user mất quyền nếu không gia hạn) |
| `nextChargeAt` | Ngày charge tiếp theo (có thể = `currentPeriodEnd` hoặc trước 1 ngày tùy policy) |

> FE hiện chỉ có `nextChargeAt` + `trialEndsAt`. **BE bổ sung `currentPeriodEnd`** để FE hiển thị "còn X ngày" mà không tự tính.

### 3.2 Quy tắc `baseDate` khi extend (stack — không replace)

```
baseDate = max(now, currentPeriodEnd)
```

- User còn hạn → cộng thêm kỳ **từ ngày hết hạn**, không mất ngày đã trả.
- User `past_due` / hết hạn → cộng từ `now`.

### 3.3 Cộng thời hạn theo cycle

```
if cycle == monthly:  newPeriodEnd = baseDate + 1 calendar month
if cycle == yearly:   newPeriodEnd = baseDate + 12 calendar months
```

Cập nhật sau mark-paid:
```
user.currentPeriodStart = (giữ nguyên nếu stack) hoặc now (nếu first purchase)
user.currentPeriodEnd   = newPeriodEnd
user.nextChargeAt       = newPeriodEnd   // hoặc newPeriodEnd - 1 day
user.subscriptionStatus = 'active'
```

---

## 4. Phân loại giao dịch — `payment.kind`

BE gán `kind` khi tạo session và lưu vào `GET /payments/history`:

| `kind` | Khi nào | Tiền charge |
|---|---|---|
| `subscription` | Lần đầu (KYC flow, `subscriptionStatus == none`) | Full 1 kỳ |
| `renew` | `POST /payments/renew` | Full 1 kỳ gói hiện tại |
| `renew` | `POST /payments/initiate` với **cùng** `planId` + `cycle` đang active | Full 1 kỳ → extend stack |
| `upgrade` | `POST /payments/initiate` với tier **cao hơn** | Prorate (§5) |
| `downgrade` | `POST /payments/initiate` với tier **thấp hơn** | Theo policy §6 |

FE đã có enum map sẵn: `PaymentHistoryKind` (`subscription | renew | upgrade | refund`).

---

## 5. Case A — Gia hạn cùng gói (`POST /payments/renew`)

### Input

```json
{ "method": "bank_transfer" }
```

BE tự resolve từ token:
- `subscriptionPlanId`, `subscriptionCycle` hiện tại
- `subscriptionPriceOverride` (nếu có)

### Logic

1. Tính `expectedTotal` = full 1 kỳ (§2).
2. Tạo `PaymentSession` với `totalAmount = expectedTotal`, `kind = renew`.
3. Sau mark-paid:
   - `baseDate = max(now, currentPeriodEnd)`
   - Extend theo cycle (§3.3)
   - **Không đổi** `planId` / `cycle`
   - `subscriptionStatus = active`
   - Nếu đang `trial`: clear `trialEndsAt`, lưu `previousTrialEndsAt` vào audit (giữ spec §10.6 hiện có)

### Edge cases

| Trạng thái user | Hành vi BE |
|---|---|
| `trial` | Cho renew; sau paid → `active`, extend từ `max(now, trialEndsAt)` hoặc `max(now, currentPeriodEnd)` — **BE chọn 1, document rõ** |
| `active` (còn hạn) | Stack thêm 1 kỳ từ `currentPeriodEnd` |
| `past_due` | Extend từ `now`, set `active` |
| `cancelled` | Cho renew như new period từ `now` |
| `frozen` | **409** `subscriptionFrozen` — phải admin unfreeze trước |
| `none` | **409** `noActiveSubscription` — redirect flow `initiate` |

### Response session (bổ sung)

```json
{
  "sessionId": "...",
  "method": "bank_transfer",
  "totalAmount": 658900,
  "kind": "renew",
  "planId": "rooms_5",
  "cycle": "monthly",
  "breakdown": {
    "listPrice": 599000,
    "creditApplied": 0,
    "vat": 59900,
    "periodExtension": { "months": 1 }
  },
  "expiresAt": "...",
  "qrExpiresAt": "...",
  "bankInfo": { ... }
}
```

---

## 6. Case B — Nâng cấp gói cao hơn (`POST /payments/initiate`)

### Input FE (không đổi contract)

```json
{
  "planId": "rooms_10",
  "cycle": "monthly",
  "method": "bank_transfer",
  "rooms": 10,
  "totalAmount": 1098900
}
```

> **Lưu ý:** FE hiện gửi **full giá gói mới**. Sau khi BE implement prorate, FE sẽ chuyển sang gọi **quote API** (§8) hoặc BE **override `totalAmount`** trong response session và reject nếu FE gửi sai.

### Điều kiện upgrade

```
tier(newPlan) > tier(currentPlan)
```

Tier order (thấp → cao):
`rooms_1 < rooms_5 < rooms_10 < rooms_20 < rooms_50 < enterprise`

### Công thức prorate (BE implement)

```
periodEnd     = currentPeriodEnd ?? nextChargeAt ?? now
remainingDays = max(0, daysBetween(now, periodEnd))
totalDays     = cycle == monthly ? 30 : 365

oldSubtotal   = pricePerCycle(currentPlan, currentCycle)   // override nếu có
newSubtotal   = pricePerCycle(newPlan, requestedCycle)

oldCredit     = round(oldSubtotal × remainingDays / totalDays)
newFullSubtotal = newSubtotal   // full kỳ mới — KHÔNG prorate phần còn lại của gói mới
vat           = round((newFullSubtotal - oldCredit) × 0.10)  // VAT trên amount due
amountDue     = max(0, newFullSubtotal - oldCredit + vat)
```

**Ví dụ:** Starter monthly 599.000 (+VAT 658.900), còn 15/30 ngày, nâng Standard 999.000 (+VAT 1.098.900):

```
oldCredit  = 599.000 × 15/30 = 299.500
amountDue  = 999.000 - 299.500 = 699.500
vat        = round(699.500 × 0.10) = 69.950
total      = 769.450
```

### Sau mark-paid (upgrade)

| Field | Giá trị |
|---|---|
| `subscriptionPlanId` | Gói mới — **áp dụng ngay** |
| `subscriptionCycle` | Cycle user chọn (nếu đổi cycle → policy bên dưới) |
| `currentPeriodEnd` | **Giữ nguyên** — không reset period khi upgrade |
| `nextChargeAt` | Giữ nguyên |
| `subscriptionStatus` | `active` |
| `payment.kind` | `upgrade` |

### Đổi cycle khi upgrade (monthly → yearly)

**Đề xuất policy:**
- Cho phép đổi cycle khi upgrade.
- `amountDue` tính trên **giá gói mới + cycle mới** trừ `oldCredit`.
- `currentPeriodEnd` **không đổi** lần upgrade này; cycle mới áp dụng từ **kỳ tiếp theo** (`nextChargeAt`).
- BE set flag `cycleChangeEffectiveAt = currentPeriodEnd` (optional field profile).

---

## 7. Case C — Mua lại đúng gói qua `initiate` (không qua renew)

Xảy ra khi user bấm **"Nâng cấp gói"** nhưng chọn lại tier đang dùng.

### Logic BE

```
if requestedPlanId == currentPlanId AND requestedCycle == currentCycle:
  kind = 'renew'
  amount = full 1 kỳ
  extend stack (§3.2) — GIỐNG POST /payments/renew
```

**Không** tạo subscription row replace — luôn **stack**.

---

## 8. Case D — Hạ gói (downgrade)

FE **không chặn** user chọn tier thấp hơn. BE quyết định:

**Đề xuất policy (BE confirm):**

| Option | Hành vi | Charge |
|---|---|---|
| **A — Deferred (khuyến nghị)** | Downgrade có hiệu lực từ `currentPeriodEnd` | `amountDue = 0`, `kind = downgrade`, không tạo session trả tiền — hoặc 409 + message |
| **B — Immediate** | Đổi plan ngay, không hoàn credit | Không charge thêm |

**Đề xuất implement Option A:**
- `POST /payments/initiate` với tier thấp hơn → **409** `downgradeScheduled` + body:
  ```json
  {
    "code": "downgradeScheduled",
    "message": "Gói mới áp dụng từ ngày ...",
    "effectiveAt": "2026-07-06T00:00:00Z",
    "pendingPlanId": "rooms_5"
  }
  ```
- FE chỉ hiển thị message — không cần logic.

---

## 9. API bổ sung đề xuất — Quote trước khi thanh toán

Để FE **không tự tính** `totalAmount` nữa:

### `POST /payments/quote`

**Body:**
```json
{
  "planId": "rooms_10",
  "cycle": "monthly"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "kind": "upgrade",
    "planId": "rooms_10",
    "cycle": "monthly",
    "totalAmount": 769450,
    "breakdown": {
      "listPrice": 999000,
      "creditApplied": 299500,
      "vat": 69950,
      "remainingDays": 15,
      "totalDays": 30,
      "currentPlanId": "rooms_5",
      "periodExtension": null
    }
  }
}
```

| `kind` trong quote | `periodExtension` |
|---|---|
| `subscription` / `renew` | `{ "months": 1 }` hoặc `{ "months": 12 }` |
| `upgrade` | `null` (giữ period) |
| `downgrade` | `null` + `effectiveAt` |

**Flow mới:**
1. User chọn gói → FE gọi `POST /payments/quote`
2. FE hiển thị `totalAmount` + `breakdown` từ BE
3. User confirm → FE gọi `POST /payments/initiate` với `totalAmount` từ quote
4. BE validate `totalAmount` khớp quote (TTL quote 15 phút) → tạo session

> Nếu BE chưa kịp làm `/quote`: BE vẫn **tính lại** trong `initiate`, trả `totalAmount` thực trong session response; FE sẽ hiển thị số đó thay vì tự tính.

---

## 10. Profile fields — FE chỉ hiển thị

Bổ sung vào `GET /auth/profile` (và sync sau mark-paid / FCM `subscription_*`):

```json
{
  "subscriptionStatus": "active",
  "subscriptionPlanId": "rooms_10",
  "subscriptionCycle": "monthly",
  "subscriptionPriceOverride": null,
  "trialEndsAt": null,
  "currentPeriodStart": "2026-06-06T00:00:00.000Z",
  "currentPeriodEnd": "2026-07-06T00:00:00.000Z",
  "nextChargeAt": "2026-07-06T00:00:00.000Z",
  "pendingPlanId": null,
  "pendingCycle": null,
  "pendingEffectiveAt": null
}
```

| Field | FE hiển thị ở đâu |
|---|---|
| `currentPeriodEnd` | Subscription detail — "Hết hạn kỳ" / "Còn X ngày" |
| `nextChargeAt` | Đã có — "Thu phí tiếp" |
| `pendingPlanId` + `pendingEffectiveAt` | Banner "Gói Standard áp dụng từ ..." (downgrade deferred) |
| `breakdown` trong session | Order summary — từng dòng giá |

**FE không tự tính X ngày** — BE có thể thêm helper `remainingDays` (optional).

---

## 11. Mark-paid — BE side effects (tóm tắt)

| Trigger | BE làm |
|---|---|
| Admin `POST /admin/payments/:sessionId/mark-paid` | Apply logic theo `session.kind` (§4–7) |
| Auto webhook (tương lai) | Cùng logic |
| `POST /admin/users/:id/subscription/mark-paid` | Manual — `days?` override, vẫn ghi audit |

Sau mọi mark-paid thành công:
1. Cập nhật User subscription fields (§10)
2. Tạo Subscription period row (lịch sử — đã có spec A5)
3. Push notification `subscription_paid`
4. Audit `payment.session_mark_paid` + metadata `{ kind, creditApplied, periodEndBefore, periodEndAfter }`

---

## 12. Error codes BE cần trả

| Code | HTTP | Khi |
|---|---|---|
| `amountMismatch` | 400 | `totalAmount` FE gửi ≠ BE tính (±1%) |
| `noActiveSubscription` | 409 | `renew` khi `subscriptionStatus == none` |
| `subscriptionFrozen` | 409 | Mọi payment khi `frozen` |
| `downgradeScheduled` | 409 | Downgrade deferred — kèm `effectiveAt` |
| `cannotDowngradeInTrial` | 409 | (optional) Trial chưa hết mà muốn hạ gói |
| `planNotFound` | 404 | `planId` không tồn tại |
| `markPaidDuplicate` | 409 | Đã có — giữ nguyên |

---

## 13. Checklist BE

### P0 — Chặn billing sai

- [ ] `POST /payments/renew` → extend stack 1 kỳ, `kind=renew`
- [ ] `initiate` cùng plan+cycle → xử lý như renew (stack)
- [ ] `initiate` tier cao hơn → prorate (§5), `kind=upgrade`
- [ ] Validate `totalAmount` ±1%; trả `amountMismatch` nếu sai
- [ ] Dùng `subscriptionPriceOverride` khi tính giá
- [ ] Expose `currentPeriodEnd` trên `/auth/profile`
- [ ] Session response có `kind` + `breakdown`

### P1 — UX đầy đủ

- [ ] `POST /payments/quote` (§9)
- [ ] Downgrade deferred policy (§8) + `pendingPlanId` trên profile
- [ ] `GET /payments/history` trả đúng `kind` (`renew|upgrade|subscription`)
- [ ] FCM / push khi period extend hoặc plan đổi

### P2

- [ ] `remainingDays` helper trên profile
- [ ] Đổi cycle khi upgrade — `cycleChangeEffectiveAt`

---

## 14. FE sẽ làm gì sau khi BE xong (chỉ hiển thị)

| Việc | Mô tả |
|---|---|
| Gọi `POST /payments/quote` trước màn thanh toán | Hiển thị `breakdown` từ BE, bỏ `PlanPriceCalculator` ở UI |
| Render `breakdown` trong `OrderSummaryCard` | `listPrice`, `creditApplied`, `vat`, `totalAmount` |
| Hiển thị `currentPeriodEnd` | Metric "Hết hạn kỳ" / countdown |
| Hiển thị `pendingPlanId` | Banner downgrade scheduled |
| Renew button | Giữ nguyên — hiển thị `totalAmount` từ response `renew`, không tự tính |
| Handle 409 | Show `message` từ BE (`downgradeScheduled`, `subscriptionFrozen`, ...) |

**FE không implement:** prorate, extend period, tier compare, override price.

---

## 15. Test scenarios BE cần cover

| # | Scenario | Expected |
|---|---|---|
| T1 | Active Starter monthly, renew | `nextChargeAt` +1 tháng từ `currentPeriodEnd` |
| T2 | Active Starter, 15 ngày còn lại, upgrade Standard | Charge prorate; plan đổi ngay; period end giữ |
| T3 | Active Starter, initiate cùng Starter | Stack +1 tháng, `kind=renew` |
| T4 | Past_due, renew | Extend từ `now`, status `active` |
| T5 | Trial, renew | Policy documented; trial cleared |
| T6 | Override 1.200.000, renew monthly | Charge 1.320.000 (VAT 10%) |
| T7 | Downgrade Standard → Starter | 409 `downgradeScheduled` + `effectiveAt` |
| T8 | Frozen, mọi payment | 409 `subscriptionFrozen` |
| T9 | Mark-paid 2 lần 10s | 409 `markPaidDuplicate` |
| T10 | `starter_test` plan QA | 10.000đ, VAT 0% theo config plan |

---

*Tài liệu này là đề xuất FE → BE. BE confirm hoặc điều chỉnh policy (đặc biệt §6 cycle change, §8 downgrade) trước khi FE wire quote API.*
