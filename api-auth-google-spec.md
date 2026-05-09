# Google Sign-In — Backend Spec (`POST /auth/google`)

> Frontend: Flutter `google_sign_in: ^6.2.2`
> Endpoint: `POST {baseUrl}/auth/google`
> Project Google Cloud: **Halong24h Workspace** (mới, thay thế project cá nhân cũ)

---

## 0. TL;DR — Việc BE cần làm (đọc trong 30s)

Frontend đã update xong toàn bộ phía mobile. Endpoint `/auth/google` đã có sẵn,
chỉ cần **3 thay đổi nhỏ** để hoạt động với Google Cloud project mới:

### Thay đổi #1 — Audience verify idToken

```diff
- audience: '1097115636577-r04cfgplsrd4ql3dtr1d6qcrveb4lidh.apps.googleusercontent.com'
+ audience: process.env.GOOGLE_OAUTH_WEB_CLIENT_ID
```

ENV mới (production + staging + dev):
```
GOOGLE_OAUTH_WEB_CLIENT_ID=832659566372-25rp2ch2s7nqiho1057i1ho1g2i1ffmc.apps.googleusercontent.com
```

### Thay đổi #2 — Multi-audience trong giai đoạn migration (nếu có user mobile cũ)

Nếu có version mobile đang chạy production dùng project cũ, cần whitelist cả 2:

```ts
audience: [
  process.env.GOOGLE_OAUTH_WEB_CLIENT_ID,         // mới
  process.env.GOOGLE_OAUTH_WEB_CLIENT_ID_LEGACY,  // cũ — xoá sau 4 tuần kể từ ngày release mobile mới
].filter(Boolean)
```

Nếu app chưa có user thật → bỏ qua, dùng audience đơn.

### Thay đổi #3 — Verify schema `users` có cột `google_sub`

Nếu chưa có, thêm migration:
```sql
ALTER TABLE users ADD COLUMN google_sub VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;  -- user Google login không có password
```

### Estimate effort

- ~30 phút nếu endpoint đã verify idToken sẵn (chỉ đổi audience + ENV)
- ~2-3 giờ nếu chưa có endpoint, phải implement từ đầu (xem Section 5 cho logic)

### Out of scope (BE không cần làm)

- ❌ Không cần dùng Web Client Secret
- ❌ Không cần redirect URI (mobile flow không dùng OAuth code exchange)
- ❌ Không cần tạo Google account ở BE — Google đã handle, BE chỉ verify token

→ Chi tiết flow / response / error / test cases ở Section 1-12 dưới.

---

## 1. OAuth credentials cần đổi

| Loại | Client ID mới | Dùng để |
|---|---|---|
| **Web** | `832659566372-25rp2ch2s7nqiho1057i1ho1g2i1ffmc.apps.googleusercontent.com` | **Audience verify idToken** ở backend |
| iOS | `832659566372-2tl5gv5vrr1ivo7coss5e913kcsc5q78.apps.googleusercontent.com` | iOS app native sign-in (chỉ FE dùng) |
| Android | `832659566372-u4d0so9ta27ue89rt3qpk4d3b1peikvl.apps.googleusercontent.com` | Android app native sign-in (FE không hardcode, chỉ cần SHA-1 đăng ký) |

Client ID cũ cần **deprecate** (project cá nhân, không còn dùng):
- `1097115636577-r04cfgplsrd4ql3dtr1d6qcrveb4lidh.apps.googleusercontent.com`

> **Web Client Secret** được Google cấp cùng Web Client ID. App mobile **không dùng** secret này. Backend chỉ cần dùng nếu có server-side OAuth flow (web app riêng) — KHÔNG cần khi chỉ verify idToken từ mobile.

---

## 2. Flow tổng quan

```
[Mobile App] → google_sign_in.signIn() → idToken (JWT)
[Mobile App] → POST /auth/google { idToken, role? } → [Backend]
[Backend]    → google-auth-library.verifyIdToken({ idToken, audience: WEB_CLIENT_ID })
[Backend]    → trả { accessToken, refreshToken, user }
```

---

## 3. Request

```http
POST /auth/google
Content-Type: application/json

{
  "idToken": "eyJhbGciOiJSUzI1NiIs...",
  "role": 3   // optional — chỉ gửi khi user mới đăng ký lần đầu (1=OWNER, 2=SALE, 3=CUSTOMER)
}
```

| Field | Type | Required | Note |
|---|---|---|---|
| `idToken` | string (JWT) | ✅ | Google idToken từ FE — TTL ~1 giờ |
| `role` | int | ❌ | Có nếu là user mới (chưa có account trong DB). Existing user thì bỏ qua hoặc backend ignore. ADMIN (0) KHÔNG được phép tạo qua flow này |

---

## 4. Verify idToken — yêu cầu bắt buộc

### 4.1 Audience phải khớp **Web Client ID**

```ts
// Node.js example (google-auth-library)
import { OAuth2Client } from 'google-auth-library';

const WEB_CLIENT_ID =
  '832659566372-25rp2ch2s7nqiho1057i1ho1g2i1ffmc.apps.googleusercontent.com';

const client = new OAuth2Client();

const ticket = await client.verifyIdToken({
  idToken,
  audience: WEB_CLIENT_ID,    // ← bắt buộc đúng. Sai = 401
});

const payload = ticket.getPayload();
// payload: { sub, email, email_verified, name, picture, aud, iss, exp, ... }
```

### 4.2 Validation rules

| Check | Logic |
|---|---|
| `aud` | === `WEB_CLIENT_ID` (google-auth-library tự verify) |
| `iss` | === `https://accounts.google.com` hoặc `accounts.google.com` |
| `exp` | > now (token chưa hết hạn) |
| `email_verified` | === `true` (reject nếu false) |
| `email` | exists, valid format |

→ Reject với HTTP 401 + `{ "success": false, "message": "Token Google không hợp lệ" }` nếu fail bất kỳ check nào.

### 4.3 Lưu ý quan trọng

- **KHÔNG verify token bằng cách decode JWT thủ công** — phải dùng google-auth-library / equivalent (Java: `GoogleIdTokenVerifier`, Python: `google.oauth2.id_token.verify_oauth2_token`, Go: `idtoken.Validate`)
- **KHÔNG cache `aud` value** — phải đọc từ ENV để dễ rotate khi đổi project
- **Không nên log `idToken`** vào file/monitoring — token có thể bị reuse trong 1 giờ

---

## 5. Logic xử lý sau verify

```
payload = verify(idToken)
email   = payload.email
googleSub = payload.sub  // Google's stable user ID (string)

user = db.users.findOne({ googleSub })   // ưu tiên match qua googleSub
       OR db.users.findOne({ email })    // fallback match qua email (link account)

IF user EXISTS:
    // Login existing user
    IF user.googleSub IS NULL:
        user.googleSub = googleSub  // link Google to existing email account
        user.save()
    return tokens(user)

ELSE:
    // First-time signup via Google
    IF request.role IS NULL:
        return 400 { message: "Thiếu role cho user mới" }
    IF request.role == 0:    // ADMIN
        return 403 { message: "Không thể đăng ký role admin qua Google" }

    user = db.users.create({
        email,
        googleSub,
        name: payload.name,
        avatar: payload.picture,
        role: request.role,
        emailVerified: true,         // Google đã verify email
        password: null,              // Không có password — login qua Google only
        kycStatus: role == 1 ? 'none' : null,   // OWNER cần KYC sau
    })
    return tokens(user)
```

---

## 6. Response — success (200)

Format khớp với existing `/auth/login` và `/auth/register`:

```json
{
  "success": true,
  "message": "Đăng nhập thành công",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": {
      "id": "uuid",
      "email": "user@gmail.com",
      "name": "Nguyen Van A",
      "avatar": "https://lh3.googleusercontent.com/...",
      "phone": null,
      "role": 3,
      "emailVerified": true,
      "kycStatus": "none",
      "subscriptionStatus": null,
      "trialEndsAt": null,
      "createdAt": "2026-05-09T10:00:00Z",
      "updatedAt": "2026-05-09T10:00:00Z"
    }
  }
}
```

---

## 7. Response — error

| HTTP | Khi nào | Body |
|---|---|---|
| 400 | Thiếu `idToken` | `{ "success": false, "message": "Thiếu idToken" }` |
| 400 | User mới + thiếu `role` | `{ "success": false, "message": "Thiếu role cho user mới" }` |
| 401 | idToken sai/hết hạn/audience không khớp | `{ "success": false, "message": "Token Google không hợp lệ" }` |
| 403 | Cố tạo role ADMIN | `{ "success": false, "message": "Không thể đăng ký role admin qua Google" }` |
| 409 | Email đã có account local password (nếu policy không cho auto-link) | `{ "success": false, "message": "Email đã đăng ký. Vui lòng đăng nhập bằng mật khẩu." }` |
| 500 | Lỗi server | `{ "success": false, "message": "Lỗi máy chủ" }` |

Auto-link policy (409 vs auto-link): khuyến nghị **auto-link** (set `googleSub` cho existing user) để UX mượt — chỉ block nếu có yêu cầu bảo mật cụ thể.

---

## 8. ENV vars cần thêm

```bash
# .env.production
GOOGLE_OAUTH_WEB_CLIENT_ID=832659566372-25rp2ch2s7nqiho1057i1ho1g2i1ffmc.apps.googleusercontent.com

# .env.development (nếu có project Google Cloud riêng cho dev)
GOOGLE_OAUTH_WEB_CLIENT_ID=...
```

Không hardcode trong source code. Không commit vào git.

---

## 9. DB schema — fields cần có

Bảng `users`:

| Column | Type | Required | Note |
|---|---|---|---|
| `google_sub` | varchar(255) UNIQUE NULLABLE | optional | Google's `sub` claim — stable ID |
| `email_verified` | boolean DEFAULT false | required | Set true khi login qua Google |
| `password_hash` | varchar NULLABLE | optional | NULL nếu user chỉ login Google |

→ Migration cần thêm `google_sub` nếu chưa có.

---

## 10. Test cases

### Test 1 — Existing email user, lần đầu Google login
- DB có user `email=a@gmail.com`, `password_hash=...`, `google_sub=NULL`
- POST `/auth/google` với idToken của `a@gmail.com`
- ✅ Expect: link `google_sub`, return tokens, không tạo user mới

### Test 2 — User mới, có role
- DB không có user
- POST `/auth/google` với idToken + `role=3`
- ✅ Expect: tạo user mới với role=CUSTOMER, return tokens

### Test 3 — User mới, thiếu role
- POST `/auth/google` với idToken, không có `role`
- ✅ Expect: 400 "Thiếu role cho user mới"

### Test 4 — Token hết hạn
- POST với idToken cũ > 1 giờ
- ✅ Expect: 401 "Token Google không hợp lệ"

### Test 5 — Token sai audience
- POST với idToken được generate từ Web Client ID khác
- ✅ Expect: 401 "Token Google không hợp lệ"

### Test 6 — Cố tạo admin
- POST với idToken + `role=0`
- ✅ Expect: 403

---

## 11. Migration plan

1. **Trước khi BE deploy thay đổi audience**: client mobile cũ vẫn gửi token từ project cũ → BE phải verify được CẢ 2 audience (whitelist 2 client ID) trong khoảng giao thoa. Sau khi mobile force-update + sunset client cũ → bỏ client ID cũ khỏi whitelist.

2. **Code support multi-audience**:
   ```ts
   await client.verifyIdToken({
     idToken,
     audience: [
       process.env.GOOGLE_OAUTH_WEB_CLIENT_ID,           // mới
       process.env.GOOGLE_OAUTH_WEB_CLIENT_ID_LEGACY,    // cũ — xoá sau N tuần
     ].filter(Boolean),
   });
   ```

3. **Sunset timeline đề xuất**: 4 tuần kể từ ngày mobile release version mới → xoá `GOOGLE_OAUTH_WEB_CLIENT_ID_LEGACY` khỏi env.

---

## 12. Checklist

- [ ] Add `GOOGLE_OAUTH_WEB_CLIENT_ID` vào ENV (prod/staging/dev)
- [ ] Update `/auth/google` controller dùng audience từ ENV
- [ ] Add migration `users.google_sub` (nếu chưa có)
- [ ] Verify auto-link policy (link Google vào existing email user)
- [ ] Reject role=0 (ADMIN) qua Google
- [ ] Set `email_verified=true` khi login Google thành công
- [ ] Unit test 6 test cases ở Section 10
- [ ] Logging idToken **bị tắt** trong prod
- [ ] Multi-audience whitelist trong giai đoạn migration (Section 11)
- [ ] Document deprecation timeline cho client ID cũ
