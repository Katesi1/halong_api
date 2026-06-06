# BE Response — Endpoint cho App iOS (Halong24h)

> **Gửi:** team Mobile (FE iOS)
> **Từ:** team Backend
> **Ngày:** 2026-06-06
> **Bối cảnh:** Phản hồi `docs/BE_REQUEST.md`. Tất cả 5 endpoint thiếu đã được implement. Permissions endpoint đã có sẵn, confirm shape bên dưới.
>
> **Base URL (sau khi deploy dev):** `https://api.halong24h.com`
> **Auth:** Bearer token. Response wrap chuẩn `{ success, message, data }`.
> Chi tiết đầy đủ ở `docs/API_SPEC_FULL.md` §24.

---

## 1. Support Tickets — DONE

| Method | Path | Status |
|---|---|---|
| POST | `/support/tickets` | DONE |
| GET | `/support/tickets?status&page&limit` | DONE — Shape A |
| GET | `/support/tickets/:id` | DONE — trả kèm `messages[]` |
| POST | `/support/tickets/:id/reply` | DONE |

- `code` ticket có format `HT-XXXXXX` (6 chữ số).
- `category`: `account | payment | technical | other`
- `status`: `open | in_progress | resolved | closed`
- ADMIN xem được tất cả tickets; user thường chỉ xem ticket của chính mình.
- ADMIN reply trên ticket `open` → BE tự bump `in_progress`.

---

## 2. Feedback — DONE

| Method | Path | Status |
|---|---|---|
| POST | `/feedback` | DONE |

- Rate-limit: **10 requests / giờ / user**.
- Body: `{ category, message, contact?, deviceInfo?, attachments? }`.
- Response: `data: { id }`.

---

## 3. Data Export (GDPR) — DONE

| Method | Path | Status |
|---|---|---|
| POST | `/users/me/data-export` | DONE |
| GET | `/users/me/data-export` | DONE |

- POST: nếu user đang có request `pending` hoặc `processing` → trả lại request cũ (không tạo trùng).
- GET: tự động chuyển `ready` → `expired` nếu quá `expiresAt`.
- Status enum: `pending | processing | ready | expired`.
- **Lưu ý:** việc thực sự xuất ZIP/JSON do worker chạy nền (sẽ làm sau ở backlog). Hiện endpoint trả `status=pending` và admin operator sẽ xử lý thủ công.

---

## 4. Consents — DONE

| Method | Path | Status |
|---|---|---|
| GET | `/users/me/consents` | DONE |
| PUT | `/users/me/consents` | DONE |

- GET tạo record mặc định (`kyc=true`, `marketing=false`) nếu user chưa có.
- PUT body chỉ chấp nhận `{ marketing: boolean }`.
- **`kyc` là server-locked** — mọi nỗ lực sửa từ client sẽ bị ignore, không trả error.

---

## 5. Notification Preferences — DONE

| Method | Path | Status |
|---|---|---|
| GET | `/users/me/notification-preferences` | DONE |
| PUT | `/users/me/notification-preferences` | DONE |

- Default: `booking=true, payment=true, system=true, quietHours=false, quietFrom="22:00", quietTo="07:00"`.
- PUT: tất cả fields optional (partial update).
- `quietFrom`/`quietTo` validate regex `^([01]\d|2[0-3]):[0-5]\d$` (format HH:MM 24h).

---

## 6. Permissions — CONFIRMED EXISTING

Endpoint `GET/PUT /permissions/:userId` đã có sẵn từ trước, ADMIN-only.

**Module whitelist:** `properties | bookings | calendar | reviews`.

**GET response:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "name": "Nguyễn A", "role": 1 },
    "permissions": [
      { "module": "properties", "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false },
      { "module": "bookings",   "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false },
      { "module": "calendar",   "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false },
      { "module": "reviews",    "canCreate": false, "canRead": true, "canUpdate": false, "canDelete": false }
    ]
  }
}
```

**PUT body:**
```json
{
  "permissions": [
    { "module": "properties", "canCreate": true, "canRead": true, "canUpdate": true, "canDelete": false }
  ]
}
```
Bulk upsert. Mỗi field CRUD optional (giữ giá trị cũ nếu không gửi).

---

## Triển khai

- Migration mới: `add_mobile_profile_modules` — BE sẽ chạy `npx prisma migrate dev` trên dev DB.
- Sau khi deploy lên dev, base URL không đổi: `https://api.halong24h.com`.
- FE iOS có thể bắt đầu integrate ngay sau khi BE thông báo deploy xong.
- Mọi thắc mắc về shape: xem `docs/API_SPEC_FULL.md` §24.
