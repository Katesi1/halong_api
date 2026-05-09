# Staff Management — Backend Spec

> Frontend: Flutter (chưa implement, sẽ làm khi BE ready)
> Liên quan: [api-auth-google-spec.md](api-auth-google-spec.md)
> Mục đích: OWNER mời nhân viên (SALE) qua email, không cho self-register SALE

---

## 0. TL;DR — Việc BE cần làm

Flow business: chỉ OWNER mới có thể tạo SALE; SALE không tự đăng ký được.
OWNER mời qua email → SALE click link → đăng ký tạo account mới với role=SALE
+ ownerId tự động link với OWNER mời.

### Endpoints cần làm (5 cái)

| Method | Path | Role | Mục đích |
|---|---|---|---|
| POST | `/staff/invites` | OWNER | OWNER tạo invite — nhập email nhân viên |
| GET | `/staff/invites` | OWNER | List invite đã gửi (pending/accepted/expired) |
| DELETE | `/staff/invites/:id` | OWNER | Huỷ invite chưa accept |
| GET | `/staff/invites/verify/:token` | Public | Mobile app verify token + lấy thông tin OWNER trước khi accept |
| POST | `/staff/invites/accept` | Public | Accept invite — tạo account SALE mới |
| GET | `/staff` | OWNER | List SALE hiện tại của OWNER |
| DELETE | `/staff/:userId` | OWNER | Soft-delete SALE (set isActive=false) |

### Schema mới

```sql
CREATE TABLE staff_invites (
  id              UUID PRIMARY KEY,
  owner_id        UUID NOT NULL REFERENCES users(id),
  email           VARCHAR(255) NOT NULL,
  token           VARCHAR(64) UNIQUE NOT NULL,    -- random 32 bytes hex
  status          VARCHAR(20) DEFAULT 'pending',  -- pending|accepted|expired|cancelled
  expires_at      TIMESTAMP NOT NULL,             -- now + 7 ngày
  accepted_at     TIMESTAMP,
  accepted_user_id UUID REFERENCES users(id),
  created_at      TIMESTAMP DEFAULT NOW(),

  UNIQUE (owner_id, email, status)  -- 1 OWNER không invite cùng email 2 lần khi pending
);

CREATE INDEX idx_staff_invites_token ON staff_invites(token);
CREATE INDEX idx_staff_invites_owner ON staff_invites(owner_id, status);
```

```sql
-- Đảm bảo users.owner_id có sẵn (theo CLAUDE.md đã có)
-- ALTER TABLE users ADD COLUMN owner_id UUID REFERENCES users(id);
-- ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
```

### Email service

BE cần gửi email khi OWNER tạo invite. Đề xuất:
- **Phase 1 (MVP)**: SMTP qua Gmail/Sendgrid free tier
- **Phase 2 (production)**: AWS SES / Resend / Sendgrid paid

Template email — xem Section 4.

### Estimate effort

- ~1 ngày BE — schema migration + 5 endpoint + email template + 1 unit test mỗi endpoint
- + 0.5 ngày integrate email service nếu chưa có

---

## 1. Flow tổng quan

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase A: OWNER tạo invite                                            │
└─────────────────────────────────────────────────────────────────────┘

OWNER (đã KYC + active subscription)
   │
   ▼
[Mobile App] Dashboard → Quản lý nhân viên → "+ Mời nhân viên"
   │ Form: { email: "nv1@gmail.com" }
   ▼
[BE] POST /staff/invites
   │ - Verify OWNER có quyền (role=OWNER, isKycApproved, subscriptionActive)
   │ - Verify email chưa có account (hoặc có policy linh hoạt — xem Section 5)
   │ - Tạo staff_invites { token, expires_at = now + 7d, status='pending' }
   │ - Send email với link
   ▼
[Email Service] gửi email tới nv1@gmail.com
   │ Subject: "Bạn được mời làm nhân viên tại [OWNER name]"
   │ Body: chứa magic link `https://halong24h.com/staff/accept?token=xxx`
   │ + mã invite ngắn (vd `HL-7K3F9X`) để nhập tay nếu deep link fail


┌─────────────────────────────────────────────────────────────────────┐
│ Phase B: Nhân viên accept invite                                     │
└─────────────────────────────────────────────────────────────────────┘

Nhân viên nhận email
   │
   ▼ (2 cách)
   │
   ├──── Cách 1: Click magic link trong email
   │           │
   │           ▼
   │    [Universal Link / Deep Link] mở app Halong24h
   │           │ token tự động gắn vào màn AcceptInvite
   │           ▼
   │    [Mobile App] màn "Bạn được mời..."
   │
   ├──── Cách 2: Mở app, bấm "Tôi có mã mời" → nhập mã `HL-7K3F9X`
   │           │
   │           ▼
   │    [Mobile App] màn "Bạn được mời..."
   │
   ▼
[BE] GET /staff/invites/verify/:token  (auto-call khi mở screen)
   │ Trả: { ownerName, ownerAvatar, email, status, expiresAt }
   │ App hiện UI: "Bạn được [Trần Văn A] mời làm nhân viên. Đăng ký để chấp nhận."
   ▼
Nhân viên chọn cách đăng ký:
   ├─── Google Sign-In → idToken
   └─── Email + password → tạo account thường
   ▼
[BE] POST /staff/invites/accept
   │ Body: { token, idToken? | password?, name?, phone? }
   │ - Verify token còn pending + chưa expire
   │ - Verify email từ idToken (hoặc body.email) === invite.email
   │ - Tạo user mới với role=SALE, owner_id=invite.owner_id, is_active=true
   │ - Update invite: status='accepted', accepted_user_id=newUser.id
   │ - Trả tokens (accessToken/refreshToken) + user → app login luôn
   ▼
[Mobile App] vào dashboard SALE
```

---

## 2. Endpoint #1 — POST /staff/invites (OWNER tạo invite)

### Request

```http
POST /staff/invites
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "email": "nv1@gmail.com"
}
```

### Validation

| Check | Logic | Lỗi nếu fail |
|---|---|---|
| Auth user.role | === OWNER | 403 "Chỉ OWNER được mời nhân viên" |
| Auth user.kycStatus | === 'approved' | 403 "Cần hoàn tất KYC trước khi mời nhân viên" |
| Auth user.subscriptionStatus | IN ('trial', 'active') | 403 "Cần subscription active" |
| email | valid format | 400 "Email không hợp lệ" |
| email | chưa có user trong DB | 409 "Email đã có tài khoản. Liên hệ chủ tài khoản đó." |
| email | chưa có invite pending từ cùng OWNER | 409 "Đã có lời mời chờ accept cho email này" |

### Logic

```ts
const token = crypto.randomBytes(32).toString('hex');  // 64 chars
const shortCode = generateShortCode();                  // vd "HL-7K3F9X"

const invite = await db.staffInvites.create({
  owner_id: req.user.id,
  email,
  token,
  short_code: shortCode,
  status: 'pending',
  expires_at: addDays(new Date(), 7),
});

await emailService.send({
  to: email,
  template: 'staff_invite',
  data: {
    ownerName: req.user.name,
    ownerEmail: req.user.email,
    inviteLink: `https://halong24h.com/staff/accept?token=${token}`,
    shortCode,
    expiresIn: '7 ngày',
  },
});

return { success: true, data: { invite } };
```

### Response — 201

```json
{
  "success": true,
  "message": "Đã gửi lời mời tới nv1@gmail.com",
  "data": {
    "invite": {
      "id": "uuid",
      "email": "nv1@gmail.com",
      "shortCode": "HL-7K3F9X",
      "status": "pending",
      "expiresAt": "2026-05-16T10:00:00Z",
      "createdAt": "2026-05-09T10:00:00Z"
    }
  }
}
```

---

## 3. Endpoint #2 — GET /staff/invites (OWNER list invite của mình)

### Request

```http
GET /staff/invites?status=pending&limit=20&page=1
Authorization: Bearer <OWNER_TOKEN>
```

Query params:
- `status` (optional): `pending|accepted|expired|cancelled|all` — default `all`
- Pagination chuẩn

### Response — 200

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "nv1@gmail.com",
      "shortCode": "HL-7K3F9X",
      "status": "pending",
      "expiresAt": "2026-05-16T10:00:00Z",
      "createdAt": "2026-05-09T10:00:00Z",
      "acceptedAt": null,
      "acceptedUserId": null
    },
    {
      "id": "uuid",
      "email": "nv2@gmail.com",
      "shortCode": "HL-2F8XQA",
      "status": "accepted",
      "expiresAt": "2026-05-15T10:00:00Z",
      "createdAt": "2026-05-08T08:00:00Z",
      "acceptedAt": "2026-05-08T15:30:00Z",
      "acceptedUserId": "uuid-of-new-sale"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 5 }
}
```

---

## 4. Endpoint #3 — DELETE /staff/invites/:id (OWNER huỷ invite)

### Request

```http
DELETE /staff/invites/abc-123-uuid
Authorization: Bearer <OWNER_TOKEN>
```

### Validation
- Invite phải thuộc OWNER hiện tại (owner_id match)
- Status === 'pending' (không huỷ được invite đã accept)

### Response — 200

```json
{ "success": true, "message": "Đã huỷ lời mời" }
```

Logic: set `status='cancelled'`. KHÔNG hard delete — giữ audit trail.

---

## 5. Endpoint #4 — GET /staff/invites/verify/:token (PUBLIC, app verify token)

### Mục đích

App mobile gọi endpoint này khi mở màn "Accept invite" để hiện thông tin OWNER
trước khi user accept. **Không cần auth** vì user chưa login.

### Request

```http
GET /staff/invites/verify/HL-7K3F9X
```

(Path param có thể là token đầy đủ 64 chars HOẶC short code 8 chars — BE detect)

### Response — 200 (token hợp lệ)

```json
{
  "success": true,
  "data": {
    "email": "nv1@gmail.com",
    "owner": {
      "name": "Trần Văn A",
      "avatar": "https://...",
      "homestayName": "Halong Bay Villa"
    },
    "expiresAt": "2026-05-16T10:00:00Z",
    "status": "pending"
  }
}
```

### Response — 4xx

| HTTP | Khi nào | Body |
|---|---|---|
| 404 | Token không tồn tại | `{ "success": false, "message": "Mã mời không hợp lệ" }` |
| 410 | Token đã expire | `{ "success": false, "message": "Mã mời đã hết hạn. Đề nghị OWNER gửi lại." }` |
| 410 | Status === 'accepted' | `{ "success": false, "message": "Mã mời đã được sử dụng" }` |
| 410 | Status === 'cancelled' | `{ "success": false, "message": "Mã mời đã bị huỷ" }` |

### Security note

- Endpoint này public → có thể bị abuse (brute force token). Mitigation:
  - Rate limit per IP: 10 requests / phút
  - Token đủ dài (32 bytes random) = 2^256 entropy — không brute được
  - Short code 8 chars = đủ cho UX nhưng cũng đủ entropy nếu có rate limit

---

## 6. Endpoint #5 — POST /staff/invites/accept (PUBLIC, tạo account SALE)

### Request — Cách A: Đăng ký với Google

```http
POST /staff/invites/accept
Content-Type: application/json

{
  "token": "HL-7K3F9X",
  "method": "google",
  "idToken": "eyJ..."
}
```

### Request — Cách B: Đăng ký với email/password

```http
POST /staff/invites/accept
Content-Type: application/json

{
  "token": "HL-7K3F9X",
  "method": "password",
  "password": "MatKhau123!",
  "name": "Nguyen Van B",
  "phone": "0901234567"
}
```

### Validation chung

| Check | Logic | Lỗi nếu fail |
|---|---|---|
| token | Tồn tại + status='pending' + chưa expire | 410 (xem Section 5) |
| method | === 'google' OR 'password' | 400 "method không hợp lệ" |

### Validation method='google'

| Check | Logic | Lỗi |
|---|---|---|
| idToken | Verify được (xem [api-auth-google-spec.md](api-auth-google-spec.md) Section 4) | 401 |
| idToken.email | === invite.email (case-insensitive) | 403 "Email Google không khớp với email được mời" |
| idToken.email_verified | === true | 403 "Email Google chưa verify" |

### Validation method='password'

| Check | Logic | Lỗi |
|---|---|---|
| password | length >= 8 | 400 "Mật khẩu tối thiểu 8 ký tự" |
| name | not empty | 400 "Cần điền họ tên" |
| phone | valid VN format (10 số, bắt đầu 0) | 400 |

### Logic

```ts
const invite = await db.staffInvites.findOne({ where: { token, status: 'pending' } });
if (!invite) return error(410, 'Mã mời không hợp lệ');
if (invite.expires_at < new Date()) return error(410, 'Mã mời đã hết hạn');

let user;

if (method === 'google') {
  const payload = await verifyGoogleIdToken(idToken);  // dùng WEB_CLIENT_ID
  if (payload.email.toLowerCase() !== invite.email.toLowerCase()) {
    return error(403, 'Email Google không khớp với email được mời');
  }

  // Verify email chưa có account
  const existing = await db.users.findOne({ where: { email: payload.email } });
  if (existing) {
    return error(409, 'Email đã có tài khoản, không thể accept invite');
  }

  user = await db.users.create({
    email: payload.email,
    name: payload.name,
    avatar: payload.picture,
    google_sub: payload.sub,
    email_verified: true,
    role: 2,                  // SALE
    owner_id: invite.owner_id,
    is_active: true,
    password_hash: null,      // Google login only
  });

} else if (method === 'password') {
  const existing = await db.users.findOne({ where: { email: invite.email } });
  if (existing) return error(409, 'Email đã có tài khoản');

  user = await db.users.create({
    email: invite.email,
    name,
    phone,
    role: 2,
    owner_id: invite.owner_id,
    is_active: true,
    password_hash: await hash(password),
    email_verified: false,    // chưa verify email — gửi email xác nhận sau
  });
}

// Update invite
await db.staffInvites.update(invite.id, {
  status: 'accepted',
  accepted_at: new Date(),
  accepted_user_id: user.id,
});

// Generate tokens — login luôn
const accessToken = generateAccessToken(user);
const refreshToken = generateRefreshToken(user);

return {
  success: true,
  message: 'Chấp nhận lời mời thành công',
  data: { accessToken, refreshToken, user },
};
```

### Response — 200

Format khớp với `/auth/login` để FE reuse logic:

```json
{
  "success": true,
  "message": "Chấp nhận lời mời thành công",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": {
      "id": "uuid",
      "email": "nv1@gmail.com",
      "name": "Nguyen Van B",
      "role": 2,
      "ownerId": "uuid-of-owner",
      "isActive": true,
      "...": "..."
    }
  }
}
```

---

## 7. Endpoint #6 — GET /staff (OWNER list nhân viên hiện tại)

```http
GET /staff?isActive=true&page=1&limit=20
Authorization: Bearer <OWNER_TOKEN>
```

Filter:
- `isActive` (optional): true | false | all — default `true`

Response trả list user role=SALE, owner_id=current_owner.id.

---

## 8. Endpoint #7 — DELETE /staff/:userId (OWNER xoá nhân viên)

```http
DELETE /staff/uuid-of-sale
Authorization: Bearer <OWNER_TOKEN>
```

Validation:
- Target user phải có role=SALE và owner_id=current_owner.id
- Không được xoá chính mình

Logic: soft delete — `is_active=false`. KHÔNG hard delete để giữ history bookings.
Set `is_active=false` đồng thời revoke tất cả refresh token của user đó (logout).

---

## 9. Email template — `staff_invite`

### Tiếng Việt

```
Subject: Bạn được mời làm nhân viên tại [OWNER name] — Halong24h

Xin chào,

[OWNER name] (chủ homestay [Homestay name]) đã mời bạn làm nhân viên
quản lý booking trên Halong24h.

Để chấp nhận lời mời:

  ▶ Trên điện thoại: bấm vào link sau
    [Accept Invitation Button] → https://halong24h.com/staff/accept?token=<TOKEN>

  ▶ Hoặc mở app Halong24h → Đăng nhập → "Tôi có mã mời" → nhập mã:
    HL-7K3F9X

Lời mời hết hạn sau 7 ngày (vào ngày DD/MM/YYYY).

Nếu bạn không biết người gửi hoặc không muốn tham gia, có thể bỏ qua email này.

— Halong24h Team
```

### Sender

- From: `noreply@halong24h.com` (hoặc tên người gửi do Workspace cấu hình)
- Reply-to: `support@halong24h.com`

---

## 10. Edge cases

| Case | Xử lý |
|---|---|
| OWNER mời email của chính mình | 400 "Không thể tự mời chính mình" |
| OWNER mời email của OWNER khác | 409 "Email đã có tài khoản" |
| Invite expire khi user click link | App hiện thông báo + nút "Yêu cầu lời mời mới" → email OWNER (BE chưa cần làm flow này, chỉ hiện hint) |
| User accept Google nhưng google email khác invite email | 403 — bắt user dùng đúng Google account khớp email |
| OWNER bị xoá / suspend account khi invite còn pending | Tất cả invite của OWNER đó → status='cancelled' (cron job hoặc trigger khi soft-delete OWNER) |
| 2 invite từ 2 OWNER khác nhau cho cùng email | OK — accept invite nào trước thắng. Invite còn lại → fail 409 khi accept. |
| OWNER hết subscription | Không tạo được invite mới (Section 2 validation), nhưng SALE đã accept rồi vẫn dùng app được (chỉ giới hạn theo subscription của OWNER) |

---

## 11. Test cases

1. ✅ OWNER có KYC + sub active → tạo invite → email gửi → DB có record
2. ✅ Email mời đã có account → 409
3. ✅ OWNER mời email valid 2 lần khi pending → lần 2 = 409 "đã có invite pending"
4. ✅ OWNER huỷ invite → status='cancelled'
5. ✅ User accept với Google đúng email → tạo SALE thành công + return tokens
6. ✅ User accept với Google email khác invite email → 403
7. ✅ Token expired → 410
8. ✅ User accept với email/password → tạo SALE thành công
9. ✅ OWNER list staff → chỉ thấy SALE của mình
10. ✅ OWNER A không list/xoá được SALE của OWNER B
11. ✅ Soft delete SALE → user.is_active=false, refresh tokens revoked
12. ✅ Verify endpoint trả thông tin OWNER chính xác (name, avatar, homestay)

---

## 12. Migration plan & rollout

### Sprint 1 — MVP
- [ ] Schema migration `staff_invites` table
- [ ] 5 endpoint CRUD invite + verify + accept
- [ ] Email template + SMTP integration (Gmail App Password đủ cho dev/staging)
- [ ] Unit tests Section 11

### Sprint 2 — Polish
- [ ] Endpoint `GET /staff` + `DELETE /staff/:id` (quản lý SALE đã accept)
- [ ] Email template HTML đẹp + logo
- [ ] Rate limit endpoint verify
- [ ] Email retry / queue (nếu SMTP fail)

### Sprint 3 — Scale (sau)
- [ ] Chuyển SMTP sang AWS SES / Resend
- [ ] Universal link iOS + App Link Android (file `apple-app-site-association` + `assetlinks.json` host trên domain) → click email mở thẳng app
- [ ] FCM push notification cho OWNER khi SALE accept

---

## 13. Checklist tổng

- [ ] Migration `staff_invites` + thêm `is_active`/`owner_id` vào `users` (nếu chưa có)
- [ ] Seed `staff_invite` email template trong system
- [ ] SMTP config trong ENV (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- [ ] 7 endpoint Section 2-8 + auth middleware
- [ ] Validation + error messages tiếng Việt
- [ ] Rate limit `GET /staff/invites/verify/:token` (10 req/phút/IP)
- [ ] Soft delete behavior: SALE bị disable thì revoke refresh token
- [ ] Test cases Section 11
- [ ] Tài liệu API trong Swagger/Postman cho FE
