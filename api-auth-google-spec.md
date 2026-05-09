# Google Sign-In — Backend Spec (`POST /auth/google`)

> Frontend: Flutter `google_sign_in: ^6.2.2`
> Endpoint: `POST {baseUrl}/auth/google`
> Project Google Cloud: **Halong24h Workspace** (mới, thay thế project cá nhân cũ)

---

## 0. TL;DR — Việc BE cần làm (đọc trong 30s)

Frontend đã update xong phía mobile (Web/iOS Client ID mới). Endpoint
`/auth/google` đã có sẵn, cần **3 thay đổi nhỏ** + **1 logic mới** cho role
picker khi user mới:

> **Liên quan**: SALE không được phép tự đăng ký qua Google (xem
> [api-staff-management-spec.md](api-staff-management-spec.md)). Chỉ
> CUSTOMER và OWNER được tạo qua `/auth/google`.

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

### Logic mới cần thêm — Role picker khi user mới

Khi user mới login Google nhưng FE chưa biết role (vd bấm Google ở Login screen),
BE cần:

```
IF không có user trong DB AND request.role IS NULL:
   return 200 { isNewUser: true, googleProfile: { email, name, avatar, sub } }
   // KHÔNG tạo user, KHÔNG trả tokens. Chờ FE hỏi role rồi gọi lại.

IF không có user AND request.role IN (1=OWNER, 3=CUSTOMER):
   tạo user mới với role đó → trả tokens

IF không có user AND request.role === 2 (SALE):
   return 403 "SALE phải accept invite từ OWNER, không tự đăng ký được"
   // SALE flow đi qua /staff/invites/accept (xem api-staff-management-spec.md)

IF không có user AND request.role === 0 (ADMIN):
   return 403 "Không thể đăng ký role admin qua Google"

IF có user trong DB:
   ignore request.role → login với role hiện có trong DB → trả tokens
```

### Estimate effort

- ~30 phút nếu endpoint đã verify idToken sẵn (chỉ đổi audience + ENV + thêm logic role picker)
- ~3 giờ nếu chưa có endpoint, phải implement từ đầu (xem Section 5 cho logic)

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
    IF user.is_active === false:
        return 403 { message: "Tài khoản đã bị vô hiệu hoá" }
    return 200 { tokens, user }

ELSE:
    // First-time signup via Google → cần role
    IF request.role IS NULL:
        // Trả profile để FE hiện role picker
        return 200 {
          isNewUser: true,
          googleProfile: {
            email: payload.email,
            name: payload.name,
            avatar: payload.picture,
            sub: payload.sub,
          }
        }
        // FE sẽ gọi lại endpoint với { idToken, role } sau khi user chọn role

    IF request.role === 0:           // ADMIN
        return 403 { message: "Không thể đăng ký role admin qua Google" }

    IF request.role === 2:           // SALE
        return 403 {
          message: "Nhân viên (SALE) phải accept invite từ chủ homestay,
                    không thể tự đăng ký. Liên hệ chủ homestay của bạn để được mời."
        }

    // Chỉ accept role IN (1=OWNER, 3=CUSTOMER)
    IF request.role NOT IN (1, 3):
        return 400 { message: "Role không hợp lệ" }

    user = db.users.create({
        email,
        googleSub,
        name: payload.name,
        avatar: payload.picture,
        role: request.role,                              // 1=OWNER, 3=CUSTOMER
        emailVerified: true,                             // Google đã verify
        password_hash: null,                             // Login qua Google only
        is_active: true,
        owner_id: null,                                  // OWNER/CUSTOMER không có owner_id
        kycStatus: request.role === 1 ? 'none' : null,   // OWNER cần KYC sau
    })
    return 200 { tokens, user }
```

### 5.1 Bảo mật — verify idToken cùng sub khi user gửi role lần 2

Sau khi FE hiện role picker và user chọn xong, FE sẽ POST lại `/auth/google` với
`{ idToken, role }`. **idToken có TTL 1 giờ và FE không nên cache** — FE sẽ gọi
`googleSignIn.signIn()` lại để lấy token mới rồi gửi kèm role.

→ BE không cần lưu state giữa 2 request. Chỉ verify idToken như Section 4 mỗi lần.

---

## 6. Response — success (200)

### 6.1 Login thành công (existing user) hoặc đã có role (new user)

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

### 6.2 User mới, thiếu role — FE cần hiện role picker

```json
{
  "success": true,
  "message": "Vui lòng chọn vai trò",
  "data": {
    "isNewUser": true,
    "googleProfile": {
      "email": "user@gmail.com",
      "name": "Nguyen Van A",
      "avatar": "https://lh3.googleusercontent.com/...",
      "sub": "1234567890"
    }
  }
}
```

→ FE detect `isNewUser=true` → push màn `RolePickerScreen` với 2 options:
- "Tôi là khách đặt phòng" → role=3 (CUSTOMER)
- "Tôi là chủ homestay" → role=1 (OWNER) → kèm flow KYC sau khi tạo

→ FE gọi lại `POST /auth/google` với `{ idToken (mới), role }` → nhận tokens.

---

## 7. Response — error

| HTTP | Khi nào | Body |
|---|---|---|
| 400 | Thiếu `idToken` | `{ "success": false, "message": "Thiếu idToken" }` |
| 400 | `role` không thuộc {1, 3} (khi có) | `{ "success": false, "message": "Role không hợp lệ" }` |
| 401 | idToken sai/hết hạn/audience không khớp | `{ "success": false, "message": "Token Google không hợp lệ" }` |
| 403 | Cố tạo role ADMIN (role=0) | `{ "success": false, "message": "Không thể đăng ký role admin qua Google" }` |
| 403 | Cố tạo role SALE (role=2) | `{ "success": false, "message": "Nhân viên phải accept invite từ chủ homestay" }` |
| 403 | Account bị disable | `{ "success": false, "message": "Tài khoản đã bị vô hiệu hoá" }` |
| 409 | Email đã có account local password (nếu policy không cho auto-link) | `{ "success": false, "message": "Email đã đăng ký. Vui lòng đăng nhập bằng mật khẩu." }` |
| 500 | Lỗi server | `{ "success": false, "message": "Lỗi máy chủ" }` |

> **User mới + thiếu role KHÔNG còn là 400** — giờ trả 200 với `isNewUser=true`
> để FE hiện role picker (xem Section 6.2).

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
| `is_active` | boolean DEFAULT true | required | Soft-delete / disable account flag |
| `owner_id` | UUID NULLABLE FK → users(id) | optional | Chỉ SALE có giá trị — link với OWNER |

→ Migration cần thêm `google_sub`, `is_active`, `owner_id` nếu chưa có.

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

### Test 3 — User mới, thiếu role (role picker flow)
- POST `/auth/google` với idToken, không có `role`
- ✅ Expect: 200 `{ isNewUser: true, googleProfile: {...} }`, KHÔNG tạo user, KHÔNG trả tokens

### Test 3b — User mới, sau role picker
- POST `/auth/google` với idToken + `role=1`
- ✅ Expect: 200, tạo user role=OWNER, kycStatus='none', trả tokens

### Test 4 — Token hết hạn
- POST với idToken cũ > 1 giờ
- ✅ Expect: 401 "Token Google không hợp lệ"

### Test 5 — Token sai audience
- POST với idToken được generate từ Web Client ID khác
- ✅ Expect: 401 "Token Google không hợp lệ"

### Test 6 — Cố tạo admin
- POST với idToken + `role=0`
- ✅ Expect: 403 "Không thể đăng ký role admin"

### Test 7 — Cố tự đăng ký SALE
- POST với idToken (email chưa có account) + `role=2`
- ✅ Expect: 403 "Nhân viên phải accept invite từ chủ homestay"

### Test 8 — Existing user bị disable
- DB có user `is_active=false`
- POST `/auth/google` với idToken match user đó
- ✅ Expect: 403 "Tài khoản đã bị vô hiệu hoá"

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
- [ ] Reject role=2 (SALE) qua Google — phải đi qua invite flow ([api-staff-management-spec.md](api-staff-management-spec.md))
- [ ] Implement role picker response (200 + `isNewUser: true`) khi user mới thiếu role
- [ ] Set `email_verified=true` khi login Google thành công
- [ ] Block login với `is_active=false`
- [ ] Unit test 8 test cases ở Section 10
- [ ] Logging idToken **bị tắt** trong prod
- [ ] Multi-audience whitelist trong giai đoạn migration (Section 11)
- [ ] Document deprecation timeline cho client ID cũ
