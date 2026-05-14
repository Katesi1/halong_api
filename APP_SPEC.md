# Halong24h Mobile App — Spec for Backend Team

> Mục đích: BE đọc tài liệu này để hiểu app gọi BE thế nào, business rules nào
> được mirror ở FE, edge case nào FE tự handle vs nào cần BE bảo vệ.
>
> **Đọc kèm**: [API.md](API.md) (BE endpoint reference), [CLAUDE.md](CLAUDE.md) (project rules).
>
> **Cập nhật**: 2026-05-10

---

## Mục lục

1. [Tech stack & overview](#1-tech-stack--overview)
2. [Architecture](#2-architecture)
3. [Roles & permissions](#3-roles--permissions)
4. [Authentication flows](#4-authentication-flows)
5. [Routes & navigation](#5-routes--navigation)
6. [Endpoint usage matrix](#6-endpoint-usage-matrix)
7. [KYC + Subscription state machine](#7-kyc--subscription-state-machine)
8. [Staff invite flow](#8-staff-invite-flow)
9. [Push notification flow](#9-push-notification-flow)
10. [Force-update flow](#10-force-update-flow)
11. [Edge cases & error contracts](#11-edge-cases--error-contracts)
12. [Models reference](#12-models-reference)
13. [Headers & request envelope](#13-headers--request-envelope)
14. [Hardcoded business rules](#14-hardcoded-business-rules)

---

## 1. Tech stack & overview

| Thành phần | Công nghệ |
|---|---|
| Framework | Flutter 3.41.7 (Dart 3.5+) |
| State management | `flutter_riverpod` 2.6 + `StateNotifier` |
| Navigation | `go_router` 14 + role-based guards |
| HTTP | `dio` 5 + `AuthInterceptor` (auto-refresh token) |
| Token storage | `flutter_secure_storage` (Keychain iOS / Keystore Android) |
| OAuth | `google_sign_in` 6.2 + `sign_in_with_apple` 6.1 |
| Push notifications | `firebase_messaging` 15.1 + `flutter_local_notifications` 17 |
| Crash reporting | `firebase_crashlytics` 4.1 |
| Camera + ML | `camera`, `google_mlkit_text_recognition`, `google_mlkit_face_detection` (KYC) |
| Code gen | `json_serializable` 6.9 + `riverpod_generator` 2.6 |
| Min SDK | iOS 15.5, Android 7+ (minSdk 24) |

**Base URL**: `https://api.halong24h.com` (override via `--dart-define=API_BASE_URL=...`)

**App phục vụ 4 vai trò**:
- **CUSTOMER**: tìm + đặt homestay/villa
- **OWNER**: chủ homestay, KYC + subscription, quản lý property/booking/staff
- **SALE**: nhân viên của OWNER, được mời qua email, scope dữ liệu theo `ownerId`
- **ADMIN**: backoffice, duyệt KYC, moderation, manage users (ít dùng app, chủ yếu web admin)

---

## 2. Architecture

```
lib/
├── core/                          # Framework
│   ├── constants/                 # api_constants.dart, app_constants.dart
│   ├── network/                   # ApiClient (Dio singleton + interceptor) + ApiResponse<T>
│   ├── storage/                   # SecureStorage (token, user)
│   ├── services/                  # PushNotificationService, DeviceIdService, AppVersionService
│   ├── monitoring/                # CrashReporter (Crashlytics wrapper)
│   ├── theme/                     # AppColors, AppSpacing, AppTheme
│   └── utils/                     # app_router.dart (50+ routes), helpers
├── data/                          # Global model + repository
│   ├── models/                    # UserModel, BookingModel, RoomModel, ...
│   └── repositories/              # AuthRepository, BookingRepository, ...
├── features/                      # MVC per feature (14 feature modules)
│   ├── auth/                      # login, register, role picker, splash
│   ├── customer/                  # search, my-bookings, account
│   ├── dashboard/
│   ├── properties/
│   ├── bookings/
│   ├── verify/                    # KYC + subscription flow
│   ├── staff/                     # invite + accept + management
│   ├── admin/                     # KYC queue, abuse reports, user CRUD
│   ├── reports/
│   ├── reviews/
│   ├── notifications/
│   ├── profile/                   # delete account, change password, privacy
│   └── ...
├── shared/                        # Cross-feature widgets + providers
└── main.dart                      # Init: Firebase → Crashlytics → FCM → AppVersion check → runApp
```

**Data flow**: `UI → event → Controller (Riverpod Notifier) → Repository → Dio → BE → ApiResponse<T> → state → UI rebuild`

---

## 3. Roles & permissions

### 3.1 Role enum (FE = BE)

```
0 = ADMIN     // seed only, không tự đăng ký
1 = OWNER     // chủ homestay, cần KYC + subscription
2 = SALE      // nhân viên, chỉ qua invite từ OWNER
3 = CUSTOMER  // khách hàng cuối, default cho user mới
```

### 3.2 Permission matrix (FE mirror BE)

| Hành động | ADMIN | OWNER | SALE (active) | CUSTOMER |
|---|:---:|:---:|:---:|:---:|
| Self-register email/password | ❌ (seed) | ✅ (anti-spam X-Device-Id) | ❌ (qua invite) | ✅ |
| Self-register Google/Apple | ❌ (403) | ✅ (role=1) | ❌ (403, "phải qua invite") | ✅ (role=3) |
| Login | ✅ | ✅ | ✅ | ✅ |
| `/properties` CRUD | ✅ all | ✅ own | ✅ scope `ownerId` (read+update only) | ❌ |
| `/properties/new` create | ✅ | ✅ (cần KYC approved + subscription active) | ❌ | ❌ |
| `/properties/:id/*` mutate | ✅ | ✅ (cần KYC approved) | ❌ (FE chặn, BE 403) | ❌ |
| `/bookings` (staff side) | ✅ | ✅ own | ✅ scope `ownerId` | ❌ |
| `/bookings/hold` (staff create) | ✅ | ✅ | ✅ | ❌ |
| `/bookings/customer-hold` | ❌ | ❌ | ❌ | ✅ |
| `/staff/invites` create | ❌ | ✅ (cần KYC + sub) | ❌ | ❌ |
| `DELETE /staff/:userId` | ❌ | ✅ own | ❌ | ❌ |
| `/admin/*` | ✅ | ❌ | ❌ | ❌ |
| `/admin/kyc/submissions/:id/approve\|reject` | ✅ | ❌ | ❌ | ❌ |
| `DELETE /users/me` (self-delete) | ✅ | ✅ | ✅ | ✅ |

### 3.3 Multi-tenant scoping cho SALE

SALE có `ownerId` trỏ về OWNER. Mọi list endpoint BE cần auto-scope:
- ADMIN: thấy tất cả
- OWNER: chỉ thấy của mình
- SALE: chỉ thấy của OWNER mình (`getEffectiveOwnerId()` helper bên BE)

FE đã có helper tương đương: `user.effectiveOwnerId` ([user_model.dart:135](lib/data/models/user_model.dart#L135)).

---

## 4. Authentication flows

### 4.1 Email/Password Register

```
[FE] RegisterScreen.submit
   │
   │ POST /auth/register
   │   headers: { X-Device-Id: <uuid> }
   │   body: { name, email, password, role: 1|3, phone? }
   ▼
[BE] - Anti-spam check (3 acc/24h/device, 10/24h/IP)
     - Reject role 0 (ADMIN) hoặc role 2 (SALE)
     - Hash password, create user
     - Return 200 { data: { accessToken, refreshToken, user } }
   ▼
[FE] - Save tokens to SecureStorage
     - Save user JSON
     - authState = { user, isLoggedIn: true }
     - Trigger _onAuthenticated():
         · register FCM token (POST /devices)
         · setUserId for Crashlytics
     - Router redirects → /home (CUSTOMER) hoặc /dashboard (OWNER)
     - OWNER: dashboard hiện banner "Hoàn tất KYC"
```

### 4.2 Email/Password Login

```
POST /auth/login
  body: { email, password }   # Field tên 'email' (KHÔNG phải identifier)
→ 200 { accessToken, refreshToken, user }
```

→ FE flow giống Register.

### 4.3 Google Sign-In với role picker

```
[FE] User taps "Đăng nhập với Google"
   │
   │ google_sign_in.signIn() → idToken (TTL 1h)
   ▼
[FE] POST /auth/google
   │   headers: { X-Device-Id }
   │   body: { idToken, role?: null }
   ▼
[BE] verify idToken (audience = WEB_CLIENT_ID)
     - Lookup user by googleSub → fallback email
     │
     ├─ User EXISTS (active):
     │    return 200 { accessToken, refreshToken, user }
     │
     ├─ User EXISTS but isActive=false:
     │    return 403 "Tài khoản đã bị vô hiệu hoá"
     │
     ├─ User NEW + role hợp lệ (1 hoặc 3):
     │    create user, return 200 { accessToken, refreshToken, user }
     │
     ├─ User NEW + thiếu role:
     │    return 200 { isNewUser: true, googleProfile: { email, name, avatar, sub } }
     │      ← FE detect → push /auth/role-picker
     │
     ├─ role=0 (ADMIN): 403
     ├─ role=2 (SALE): 403 "phải accept invite"
     └─ idToken sai/hết hạn: 401
```

**FE handling 4 outcome** (sealed class `GoogleSignInOutcome`):
- `GoogleSignInSuccess(user)` → router auto-redirect
- `GoogleSignInNeedsRole(idToken, profile)` → push `/auth/role-picker` với extra
- `GoogleSignInCancelled()` → user huỷ pop-up, không show error
- `GoogleSignInFailure(message)` → snackbar đỏ

**Role picker flow tiếp theo**:
```
[FE] User chọn "Khách đặt phòng" (role=3) hoặc "Chủ homestay" (role=1)
   │
   ▼
POST /auth/google { idToken (cũ), role: 3 }
   │
   ▼
BE create user → return tokens + user → FE login
```

⚠️ idToken có TTL 1 giờ. Nếu user mở role picker rồi để 1 tiếng mới chọn → idToken expire → BE trả 401 → FE phải re-trigger Google flow.

### 4.4 Apple Sign-In (iOS only — Apple Guideline 4.8)

```
POST /auth/apple
  headers: { X-Device-Id }
  body: {
    idToken,
    role?: 1|3,
    email?: string,    // Apple chỉ trả lần đầu user authorize
    name?: string,     // Apple chỉ trả lần đầu user authorize
    authorizationCode?: string,
    platform: "ios"
  }
```

Logic giống Google nhưng note:
- Apple chỉ trả `email + fullName` ở **lần đầu** user accept consent. Lần sau chỉ trả `idToken` + `userIdentifier`.
- BE phải lưu `email + name` lần đầu — không thể recover từ idToken.
- Nếu user revoke consent ở Apple settings → lần login lại sẽ là lần đầu lần nữa, có email/name mới.

### 4.5 Token refresh (auto)

Mọi API call đi qua `_AuthInterceptor`:
```
1. Request có Authorization: Bearer {accessToken}
2. Server trả 401
3. Interceptor catch:
     POST /auth/refresh { refreshToken }
     → { accessToken, refreshToken } (rotation)
4. Save tokens mới, retry original request
5. Nếu refresh cũng fail (refreshToken expired):
     - Clear SecureStorage
     - Broadcast onForceLogout
     - AuthNotifier reset state → router redirect /login
     - Login screen hiện snackbar "Phiên hết hạn"
```

**BE implication**: `/auth/refresh` phải invalidate token cũ sau khi cấp token mới (rotation). Nếu user login trên 2 device, login mới sẽ kick device cũ ra ≤ 15 phút (sau khi access token cũ expire).

### 4.6 Logout

```
[FE] - DELETE /devices/{fcmToken}     (best-effort, Bearer còn valid)
     - POST /auth/logout               (clear refresh token DB)
     - SecureStorage.clear()
     - googleSignIn.signOut() + Apple revoke (best-effort)
     - CrashReporter.setUserId(null)
     - authState = AuthState() (default)
     - Router → /login
```

### 4.7 Self-delete account (App Store Guideline 5.1.1(v))

```
[FE] DeleteAccountScreen
   - User nhập "XOA" + tick checkbox
   - Optional reason field (max 200 chars)
   - DELETE /users/me { reason? }
[BE] soft-delete (deletedAt = now), hash email để cho phép re-register sau 30 ngày
[FE] - Auto logout (clear tokens, FCM unregister)
     - Router → /login
```

⚠️ **BE cần add endpoint `DELETE /users/me`** — hiện API.md chỉ có `DELETE /users/:id` cho ADMIN. Self-delete là yêu cầu compliance Apple/Google/GDPR.

---

## 5. Routes & navigation

### 5.1 Public routes (không cần auth)

| Path | Screen | Use case |
|---|---|---|
| `/splash` | SplashScreen | Auto-restore session từ SecureStorage |
| `/login` | LoginScreen | Email/password + Google + Apple (iOS) + entry "Tôi có mã mời" |
| `/register` | RegisterScreen | Form OWNER (CUSTOMER vào Login → Google) |
| `/forgot-password` | ForgotPasswordScreen | Reset password flow |
| `/auth/role-picker` | RolePickerScreen | Sau Google/Apple new user, args qua `state.extra` |
| `/staff/accept?token=XXX` | InviteAcceptScreen | Deep link từ email invite |

### 5.2 Customer routes (`role=3` hoặc OWNER/ADMIN ở mode khách)

| Path | Screen |
|---|---|
| `/home` | CustomerHomeScreen — search + featured properties |
| `/search` | SearchRoomScreen — filter by date/guests/price |
| `/my-bookings` | MyBookingsScreen — tabs: tất cả / hold / confirmed / cancelled |
| `/account` | AccountScreen — profile, toggle quản lý, dark mode, logout |

### 5.3 Management routes (ADMIN/OWNER/SALE)

| Path | Screen | Role guard |
|---|---|---|
| `/dashboard` | DashboardScreen | All management roles |
| `/rooms`, `/rooms/:id`, `/rooms/:id/calendar` | Room CRUD + calendar | Mgmt |
| `/calendar` | OwnerCalendarScreen | Mgmt |
| `/bookings`, `/bookings/:id` | Booking list + detail | Mgmt |
| `/properties` | PropertyManagementScreen (list) | Mgmt |
| `/properties/new` | PropertyAddScreen | OWNER (KYC+sub) hoặc ADMIN |
| `/properties/:id/*` | Edit images/pricing/amenities/rules/info/location/services/cancellation | OWNER (KYC) hoặc ADMIN |
| `/reports` | ReportScreen | Mgmt |
| `/staff/manage` | StaffManagementScreen (mời + danh sách) | **OWNER only** |
| `/admin/*` | Admin hub + nested screens | **ADMIN only** |
| `/profile`, `/profile/help`, `/profile/change-password`, `/profile/data-request`, `/profile/consent`, `/profile/delete-account`, `/profile/privacy-policy` | Profile screens | All authed |
| `/notifications`, `/notifications/:id` | NotificationScreen | All authed |

### 5.4 Verify (KYC + subscription) routes

| Path | Step | Trigger |
|---|---|---|
| `/verify/cccd-front` | 1 | OWNER có `needsKyc` truy cập property mutate |
| `/verify/cccd-back` | 2 | Sau upload CCCD front |
| `/verify/selfie` | 3 | Sau upload CCCD back |
| `/verify/select-plan` | 4 | Sau selfie verified |
| `/verify/payment` | 5 | Sau chọn plan |
| `/verify/pending` | 6 | Sau payment, chờ admin approve |
| `/verify/approved` | 7 | KYC approved → trial active |
| `/verify/rejected` | 7' | KYC rejected → option resubmit hoặc refund |
| `/verify/subscription-detail` | n/a | OWNER xem chi tiết subscription |
| `/verify/payment-history` | n/a | List payment history |

### 5.5 Route guard logic ([app_router.dart:73-212](lib/core/utils/app_router.dart#L73-L212))

```
1. isLoading=true → no redirect (preserve route)
2. !isLoggedIn && !isPublic → redirect /login
3. isLoggedIn && isPublic → redirect /home (CUSTOMER) hoặc /dashboard (mgmt)
4. CUSTOMER mode + management path → /home
5. Mgmt mode + customer path → /dashboard
6. !ADMIN && !OWNER + /admin/* → /dashboard
7. !OWNER + /staff/manage → /dashboard
8. SALE !active membership → restrict tới /dashboard, /profile, /notifications
9. SALE + /properties/new hoặc /properties/:id/* → /dashboard (FE block, BE cũng 403)
10. !ADMIN + admin user form → /admin (block edit users)
11. OWNER needsKyc + /properties/:id mutate → /verify/cccd-front
```

---

## 6. Endpoint usage matrix

Liệt kê tất cả endpoint FE đang gọi, ai gọi, khi nào.

### 6.1 Auth

| Method | Path | Caller (FE) | Khi nào |
|---|---|---|---|
| POST | `/auth/register` | LoginScreen → AuthRepository | Email/password registration với X-Device-Id |
| POST | `/auth/login` | LoginScreen | Email + password |
| POST | `/auth/google` | LoginScreen + RegisterScreen + RolePickerScreen | 2 lần: lần 1 không role, lần 2 với role |
| POST | `/auth/apple` | LoginScreen (iOS) + RolePickerScreen | Tương tự Google, +1 field `platform` |
| POST | `/auth/refresh` | ApiClient interceptor | Auto-call khi 401 |
| POST | `/auth/logout` | AuthNotifier.logout | User tap logout |
| GET | `/auth/profile` | AuthNotifier._init + refreshProfile + app resume | Khôi phục session + lifecycle resume |
| POST | `/auth/forgot-password` | ForgotPasswordScreen | User submit email |
| POST | `/auth/reset-password` | ResetPasswordScreen | Sau khi nhập token từ email |
| POST | `/auth/change-password` | ChangePasswordScreen | User logged in đổi pass |

### 6.2 Devices (push notification)

| Method | Path | Khi nào |
|---|---|---|
| POST | `/devices` | Sau mọi login + token refresh (idempotent upsert) |
| DELETE | `/devices/:token` | Trước logout (best-effort) |

### 6.3 Users

| Method | Path | Caller |
|---|---|---|
| GET | `/users` | Admin user list (ADMIN only) |
| GET | `/users/:id` | Admin / OWNER xem detail |
| GET | `/users/my-staff` | OWNER list SALE đã add (legacy, song song với `/staff/*`) |
| POST | `/users/my-staff` | OWNER add SALE đã có account vào team |
| DELETE | `/users/my-staff/:id` | OWNER gỡ SALE khỏi team |
| PUT | `/users/:id` | Self update (name, phone, email, gender, dob) |
| POST | `/users` | ADMIN create user |
| DELETE | `/users/:id` | ADMIN soft-delete |
| **DELETE** | **`/users/me`** | **🆕 Self-delete cho compliance — BE cần add** |
| PATCH | `/users/:id/kyc-bypass` | ADMIN bypass KYC cho OWNER |

### 6.4 Properties

| Method | Path | Caller |
|---|---|---|
| GET | `/properties/public` | Customer public listing |
| GET | `/properties/share/:id` | Public share link (no price) |
| GET | `/properties` | Mgmt list (auto-scope theo role) |
| GET | `/properties/:id` | Detail |
| POST | `/properties` | Create (OWNER cần KYC approved + sub active) |
| PATCH | `/properties/:id` | Edit |
| DELETE | `/properties/:id` | Soft delete (OWNER/ADMIN) |
| GET/POST/DELETE/PATCH | `/properties/:id/images*` | Upload, set cover, delete |
| GET/PATCH | `/properties/:id/prices` | Price calendar |

### 6.5 Bookings

| Method | Path | Caller |
|---|---|---|
| GET | `/bookings?propertyId=` | Mgmt list (auto-scope) |
| GET | `/bookings/:id` | Detail |
| POST | `/bookings/hold` | Mgmt tạo hold cho khách offline |
| POST | `/bookings/customer-hold` | CUSTOMER đặt phòng từ app |
| PATCH | `/bookings/:id/confirm` | Mgmt xác nhận thanh toán |
| PATCH | `/bookings/:id/cancel` | Mgmt huỷ |
| PATCH | `/bookings/:id/customer-cancel` | CUSTOMER tự huỷ |
| GET | `/bookings/calendar/:propertyId?year=&month=` | Calendar grid |
| GET | `/bookings/my-bookings` | CUSTOMER list booking của mình |

### 6.6 Calendar (lock/unlock)

| Method | Path |
|---|---|
| GET | `/calendar/grid` (mgmt) hoặc `/calendar/public-grid` |
| POST/DELETE | `/calendar/lock` |
| PATCH | `/calendar/sold` |

### 6.7 KYC (verify)

| Method | Path | Khi nào |
|---|---|---|
| POST | `/kyc/upload-cccd-front` | Multipart + JSON OCR result |
| POST | `/kyc/upload-cccd-back` | Multipart |
| POST | `/kyc/upload-selfie` | Multipart + face match liveness |
| POST | `/kyc/submit` | Sau khi upload đủ 3 file |
| GET | `/kyc/status` | Poll trên PendingApprovalScreen |
| POST | `/kyc/submissions/:id/resubmit` | Sau rejected |

### 6.8 Billing & Payment

| Method | Path |
|---|---|
| GET | `/billing/plans` |
| POST | `/payments/initiate` (kèm planId, cycle) |
| GET | `/payments/:sessionId/status` |
| POST | `/payments/:sessionId/refund` |
| GET | `/payments/history?cursor=&limit=` |

### 6.9 Staff invite

| Method | Path | Auth |
|---|---|---|
| POST | `/staff/invites` | OWNER (Bearer) |
| GET | `/staff/invites?status=` | OWNER |
| DELETE | `/staff/invites/:id` | OWNER |
| GET | `/staff/invites/verify/:token` | **Public** (no auth) — rate limit 10/min/IP |
| POST | `/staff/invites/accept` | **Public** — body có idToken hoặc password |
| GET | `/staff?isActive=` | OWNER |
| DELETE | `/staff/:userId` | OWNER |

### 6.10 Notifications

| Method | Path |
|---|---|
| GET | `/notifications` |
| GET | `/notifications/unread-count` |
| PATCH | `/notifications/:id/read` |
| PATCH | `/notifications/read-all` |

### 6.11 Reviews

| Method | Path | Caller |
|---|---|---|
| GET | `/properties/:id/reviews` | Public |
| POST | `/properties/:id/reviews` | CUSTOMER (sau booking completed) |
| POST | `/properties/:propertyId/reviews/:reviewId/reply` | OWNER reply |
| DELETE | `/admin/reviews/:reviewId` | ADMIN hide |

### 6.12 Admin

| Method | Path |
|---|---|
| GET | `/admin/kyc/queue` |
| POST | `/admin/kyc/submissions/:id/approve` |
| POST | `/admin/kyc/submissions/:id/reject` |
| GET | `/admin/abuse-reports` (xem danh sách) |
| ... | Moderation audit endpoints |

### 6.13 Misc

| Method | Path | Khi nào |
|---|---|---|
| GET | `/dashboard/stats` | Dashboard load + pull-to-refresh |
| GET | `/reports` | ReportScreen |
| GET | **`/app/version?platform=&currentVersion=`** | **🆕 Force-update check ở app launch — BE cần add** |
| GET/POST | `/partner/*` | Đối tác B2B (header `X-Partner-Key`) |

### 6.14 Endpoint cần BE bổ sung

| Endpoint | Lý do |
|---|---|
| `DELETE /users/me` | Self-delete account (compliance Apple/Google/GDPR). FE đã call, chờ BE expose. |
| `GET /app/version` | Force-update check. Schema response: `{ data: { latestVersion, minSupportedVersion, releaseNotes, storeUrl: { ios, android } } }` |

---

## 7. KYC + Subscription state machine

### 7.1 KYC status (string enum, ở `users.kycStatus`)

```
none ──upload+submit──> pending ──admin approve──> approved
                          │
                          └─admin reject─> rejected ──resubmit──> pending
```

| Status | UI behavior |
|---|---|
| `none` | OWNER dashboard hiện banner "Hoàn tất xác minh CCCD". Tap → `/verify/cccd-front`. Property mutate routes redirect đây. |
| `pending` | Banner "Đang chờ duyệt". Property mutate vẫn block. |
| `approved` | Property mutate unlock. Subscription banner thay thế nếu chưa active. |
| `rejected` | Banner "Hồ sơ bị từ chối, liên hệ support". Tap → `/verify/rejected` |

### 7.2 KYC submission status (BE chi tiết hơn — `kyc_submissions.status`)

```
draft → kyc_submitted → payment_pending → awaiting_approval ──> approved → trial → active
                                                              └─> rejected → (resubmit | refunded)
```

FE chỉ care về `users.kycStatus` (4 state) cho route guard. Detail status dùng cho VerifyFlowController state machine ở `/verify/*` screens.

### 7.3 Subscription status

```
none ──trial start──> trial (7d) ──auto-charge──> active ──fail charge──> past_due
                                       └────cancel────> cancelled
```

| Status | Dashboard banner |
|---|---|
| `none` | Hidden (chưa qua KYC) |
| `trial` | "Trial còn X ngày" — green |
| `active` | Hidden |
| `past_due` | "Subscription quá hạn — gia hạn ngay" — red |
| `cancelled` | "Subscription đã huỷ — đăng ký lại" — gray |

### 7.4 KYC + Subscription flow (BE-driven)

```
1. OWNER register (role=1) → user created với kycStatus='none', subscriptionStatus='none'
2. OWNER tap "Tạo phòng" → paywall modal → start verify flow
3. Upload CCCD front → POST /kyc/upload-cccd-front (image + OCR result)
4. Upload CCCD back → POST /kyc/upload-cccd-back
5. Upload selfie → POST /kyc/upload-selfie (face match validation BE-side)
6. Submit → POST /kyc/submit → BE set kycStatus='pending'
7. Hiện màn pending. FE poll GET /kyc/status mỗi 30s.
8. Admin approve/reject:
     - Approve: kycStatus='approved' + subscription start trial 7d
       BE push: type='kyc_approved' → FE deepLink '/dashboard'
     - Reject: kycStatus='rejected' + message
       BE push: type='kyc_rejected' → FE deepLink '/verify/rejected'
9. Trial start → user.subscriptionStatus='trial', trialEndsAt=now+7d
10. Day 4: BE optional push 'subscription_warning'
11. Day 7: BE auto-charge subscription (cron job)
       - Charge OK: subscriptionStatus='active'
       - Charge fail: subscriptionStatus='past_due' + push payment_failed
```

### 7.5 Sequence: VerifyFlowController hydrate

Khi OWNER mở verify flow lần 2 (vd app crash giữa upload), FE gọi:
```
GET /kyc/status
→ { status, currentStep, cccdFrontUploaded, cccdBackUploaded, selfieUploaded, ... }
```

FE dùng để xác định resume từ step nào (vd đã upload CCCD front, skip màn này).

---

## 8. Staff invite flow

### 8.1 OWNER tạo invite

```
OWNER (KYC approved + sub active) → Dashboard → Quản lý nhân viên
   │
   ▼
[Form] Nhập email nhân viên → Submit
   │
   │ POST /staff/invites { email }
   │   Bearer: OWNER's accessToken
   ▼
[BE] Validate:
     - role=OWNER + kycStatus='approved' + subscriptionStatus IN ('trial', 'active')
     - email không duplicate trong users (deletedAt=null)
     - Không có invite pending từ OWNER này tới email này
     - Generate token (64 hex) + shortCode (HL-XXXXXX)
     - Insert staff_invites { email, ownerId, token, status='pending', expiresAt=now+7d }
     - Send email (SMTP best-effort)
     - Response 201 { invite, inviteLink, emailSent }
   ▼
[FE] Hiện toast "Đã gửi lời mời"
     OWNER có thể copy inviteLink + shortCode để gửi qua Zalo/SMS thủ công nếu cần
```

### 8.2 SALE accept invite

**Cách 1: Click magic link trong email**

```
Nhân viên nhận email (có inviteLink + shortCode)
   │
   │ Click https://app.halong24h.com/staff/accept?token=<TOKEN>
   ▼
[FE] Universal/App link → mở app vào InviteAcceptScreen với prefilled token
   │ GET /staff/invites/verify/<token>     (public, rate limit 10/min/IP)
   ▼
[BE] return { email, owner: { name, avatar, homestayName }, expiresAt, status }
   ▼
[FE] Hiện preview "Anh A mời bạn làm nhân viên..."
     - Button: "Đăng nhập với Google"
     - Button: "Đăng ký bằng email/password"
```

**Cách 2: Nhập short code thủ công**

```
User mở app → LoginScreen → tap "Tôi có mã mời nhân viên"
→ InviteAcceptScreen (token chưa prefilled)
→ User nhập "HL-7K3F9X" → Tiếp tục
→ FE gọi GET /staff/invites/verify/HL-7K3F9X (BE auto-detect short code)
```

**Sau verify, accept với Google**:

```
[FE] Tap "Đăng nhập với Google" → google_sign_in.signIn() → idToken
   │
   │ POST /staff/invites/accept
   │   body: { token, method: 'google', idToken }
   │   (no Bearer — public endpoint)
   ▼
[BE] - verify idToken (audience = WEB_CLIENT_ID)
     - Check Google email === invite.email (case-insensitive)
     - Check email chưa có account trong DB
     - Create user { role=2, ownerId=invite.ownerId, isActive=true, googleSub, emailVerified=true }
     - Update invite { status='accepted', acceptedAt, acceptedUserId }
     - Push notification 'staff_invite_accepted' tới OWNER
     - Return 200 { accessToken, refreshToken, user }
   ▼
[FE] - Save tokens
     - applyExternalLogin(user)   ← auth state update without re-login
     - Router redirects → /dashboard (SALE view)
```

**Sau verify, accept với email/password**:

```
POST /staff/invites/accept
  body: {
    token, method: 'password',
    name, password (>=8), phone? (10 digit, start 0)
  }
→ same response shape
```

### 8.3 OWNER manage staff

```
GET /staff?isActive=true  → list SALE đã accept
DELETE /staff/:userId     → soft-delete + revoke session
                            BE push 'staff_removed' tới SALE
                            FE detect push → force logout SALE
```

---

## 9. Push notification flow

### 9.1 Setup (per-device, once)

```
App launch:
1. Firebase.initializeApp()
2. PushNotificationService.initialize():
     - Set background message handler (top-level fn)
     - Init flutter_local_notifications + Android channel "halong24h_default"
     - Listen FirebaseMessaging.onMessage (foreground)
     - Listen FirebaseMessaging.onMessageOpenedApp (tap from background/terminated)
     - getInitialMessage() (cold-start from tap)
3. CrashReporter.init() (after Firebase)
```

### 9.2 Token registration (per-login)

```
After every authenticated state change (login, register, app restore):
1. requestPermission(alert, badge, sound)
2. _fcm.getToken() → FCM token (per device)
3. POST /devices { fcmToken, platform: 'ios'|'android', locale: 'vi' }
   Bearer: current accessToken
4. _fcm.onTokenRefresh.listen() → re-call POST /devices on rotation

Before logout:
1. DELETE /devices/{fcmToken}    (best-effort)
2. _fcm.deleteToken()             (clear local)
```

### 9.3 Push payload format BE phải gửi

```json
{
  "notification": { "title": "...", "body": "..." },
  "data": {
    "type": "booking_created",
    "deepLink": "/bookings/uuid-xyz",
    "targetId": "uuid-xyz"
  },
  "android": { "priority": "high", "notification": { "sound": "default", "channel_id": "halong24h_default" } },
  "apns": { "payload": { "aps": { "sound": "default", "badge": 1 } } }
}
```

### 9.4 9 push types (xem [API.md Section 6.4](API.md))

| Type | Trigger | Receiver | deepLink |
|---|---|---|---|
| `booking_created` | Booking new | OWNER | `/bookings/:id` |
| `booking_confirmed` | Confirm | OWNER + CUSTOMER | OWNER `/bookings/:id`, CUSTOMER `/my-bookings` |
| `booking_cancelled` | Cancel | OWNER + CUSTOMER | tương tự |
| `payment_succeeded` | KYC/renew paid | User | `/my-bookings` |
| `payment_failed` | VNPay fail | User | `/my-bookings` |
| `kyc_approved` | Admin approve | OWNER | `/dashboard` |
| `kyc_rejected` | Admin reject | OWNER | `/verify/rejected` |
| `staff_invite_accepted` | SALE accept | OWNER | `/staff/manage` |
| `staff_removed` | OWNER remove SALE | SALE | `/login` (force logout) |

### 9.5 FE foreground/background handling

- **Foreground**: `_onForegroundMessage()` → flutter_local_notifications hiện banner trong app
- **Background**: OS tự hiện banner native (FCM payload có `notification`)
- **Tap**: `_onOpenedApp()` parse `data.deepLink` → `router.go(deepLink)`
- **Cold start**: `getInitialMessage()` lấy message từ killed state, defer 500ms cho router init xong

---

## 10. Force-update flow

### 10.1 FE call

App launch (after `runApp()`):
```
GET /app/version?platform=ios&currentVersion=1.0.2
Headers: { Authorization: null }   (public, no auth)
Timeout: 5s
```

### 10.2 BE response

```json
{
  "data": {
    "latestVersion": "1.2.0",
    "minSupportedVersion": "1.0.0",
    "releaseNotes": "- Fix bug X\n- Cải thiện performance",
    "storeUrl": {
      "ios": "https://apps.apple.com/app/idXXXX",
      "android": "https://play.google.com/store/apps/details?id=com.halongtravel.halong24h"
    }
  }
}
```

### 10.3 FE logic

```
compare(current, minSupported):
  current < min  → status='forceUpdate'  → blocking dialog (no skip, no back button)
  current < latest → status='softUpdate' → dismissible dialog với "Để sau"
  else → upToDate → no dialog

Network error → status='unknown' → silent (đừng block app vì BE down)
```

### 10.4 BE responsibility

- Endpoint **public** (no auth) — vì user chưa login cũng cần check version
- Trả nhanh (< 500ms target) — block app launch quá lâu là UX kém
- Không return 4xx/5xx khi không có data; trả `200 { data: { latestVersion: null, ... } }` để FE coi như upToDate
- `storeUrl` là deep link store, không phải web fallback

---

## 11. Edge cases & error contracts

### 11.1 Error response shape (BE → FE)

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Email không hợp lệ",
  "errors": null,          // optional, validation field errors
  "path": "/auth/register",
  "timestamp": "2026-05-10T10:00:00.000Z"
}
```

FE extract `message` để show trong snackbar/dialog. Nếu thiếu `message` → fallback "Lỗi không xác định".

### 11.2 HTTP code → FE behavior

| Code | FE behavior |
|---|---|
| 200/201 | Success path |
| 400 | Show `message` (validation error) |
| 401 | Auto-refresh token (interceptor). Nếu refresh fail → force logout. |
| 403 | Show `message`. Đa số tự nhiên (vd KYC chưa approved → BE 403, FE sẵn route guard nên ít gặp) |
| 404 | "Không tìm thấy" — show in screen empty state |
| 409 | Show `message` ("Email đã tồn tại"...) |
| 410 | "Mã/link đã hết hạn" (invite token...) |
| 429 | Retry with exponential backoff + `retry-after` header |
| 5xx | "Lỗi máy chủ" — show retry button |
| Network/timeout | "Không kết nối được — kiểm tra mạng" |

### 11.3 Race conditions FE handle

| Case | FE handling |
|---|---|
| User mở 2 tab cùng login → token rotation invalidate token cũ | Interceptor catch 401 → refresh → retry |
| User logout giữa lúc đang upload KYC | abort upload, clear state |
| Push notification tới khi app đang ở foreground = same screen | Hiện local banner, KHÔNG navigate (user đang xem rồi) |
| Force-update dialog hiện khi user đang flow critical | Block tất cả (force) hoặc cho dismiss (soft) |

### 11.4 Edge cases BE phải bảo vệ (FE không đáng tin)

- BE phải re-validate KYC + subscription mỗi `POST/PATCH/DELETE /properties*` — FE chặn nhưng có thể bypass bằng manual API call
- BE phải verify SALE.ownerId === target_property.ownerId trước khi cho phép update
- BE phải rate-limit `/auth/register`, `/auth/google`, `/auth/apple` (FE gửi X-Device-Id best-effort)
- BE phải verify Google idToken audience = WEB_CLIENT_ID, KHÔNG phải iOS/Android client ID
- BE phải hash refresh token, rotation
- BE phải reject body với role=0 (ADMIN) hoặc role=2 (SALE) ở `/auth/google` và `/auth/apple`

---

## 12. Models reference

### 12.1 UserModel (xem [user_model.dart](lib/data/models/user_model.dart))

Tất cả 3 endpoint auth + `/auth/profile` + `/staff/*` cần trả cùng shape:

```typescript
{
  id: string;                    // UUID
  name: string;
  phone: string;                 // VN format "0xxxxxxxxx" (10 digit)
  email: string | null;
  avatar: string | null;         // URL
  role: 0 | 1 | 2 | 3;
  ownerId: string | null;        // chỉ SALE có
  isActive: boolean;
  emailVerified: boolean;
  gender?: 0 | 1 | 2;
  dateOfBirth?: string;          // ISO 8601 date
  saleMembershipStatus?: 'invited' | 'active' | 'suspended' | 'unassigned';

  // KYC
  kycStatus: 'none' | 'pending' | 'approved' | 'rejected';
  kycSubmissionId?: string;

  // Subscription
  subscriptionStatus: 'none' | 'trial' | 'active' | 'past_due' | 'cancelled';
  subscriptionPlanId?: string;
  subscriptionCycle?: 'monthly' | 'yearly';
  trialEndsAt?: string;          // ISO 8601 datetime
  nextChargeAt?: string;
}
```

`/auth/profile` thêm: `kycBypass`, `permissions[]`.

### 12.2 BookingModel

```typescript
{
  id: string;
  propertyId: string;
  saleId: string | null;          // null nếu CUSTOMER tự đặt
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  checkinDate: string;            // ISO date
  checkoutDate: string;
  status: 0 | 1 | 2 | 3;          // HOLD | CONFIRMED | CANCELLED | COMPLETED
  holdExpireAt?: string;
  holdRemainingSeconds?: number;
  guestCount: number;
  depositAmount: number;
  notes: string;
  property?: HomestayModel;       // optional embedded
  sale?: { id, name };
}
```

### 12.3 StaffInvite

```typescript
{
  id: string;
  email: string;
  shortCode: string;             // "HL-XXXXXX"
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  acceptedUserId?: string;
  inviteLink?: string;           // chỉ trả ở POST response, không trong list
}
```

### 12.4 NotificationModel

```typescript
{
  id: string;
  type: 'booking' | 'payment' | 'system';
  title: string;
  body: string;
  targetType?: string;           // discriminator
  targetId?: string;
  isRead: boolean;
  createdAt: string;
}
```

---

## 13. Headers & request envelope

### 13.1 Request headers chuẩn

| Header | Required khi | Format |
|---|---|---|
| `Authorization` | Endpoint protected | `Bearer <accessToken>` |
| `Content-Type` | POST/PUT/PATCH | `application/json` |
| `Accept-Language` | Optional | `vi` (default) hoặc `en` |
| `X-Device-Id` | `/auth/register`, `/auth/google`, `/auth/apple` | UUID stable per device |
| `X-Partner-Key` | `/partner/*` | API key đối tác |

### 13.2 Response success envelope

```json
{
  "success": true,
  "message": "...",
  "data": <T>
}
```

FE extract `data` (cho 1 object) hoặc `data` cho list.

### 13.3 Pagination

Endpoints có pagination dùng cursor-based:
```
GET /payments/history?limit=20&cursor=<base64>
→ { data: { items: [...], nextCursor: '<base64>' | null } }
```

Page-based (vd `/staff/invites`):
```
GET /staff/invites?page=1&limit=20
→ { data: [...], meta: { page, limit, total } }
```

### 13.4 File upload (KYC)

Multipart/form-data:
```
POST /kyc/upload-cccd-front
Content-Type: multipart/form-data
Body:
  - file: <binary> (jpeg/png, max 5MB)
  - ocrResult: <JSON string>   (optional, kết quả OCR client-side)
```

---

## 14. Hardcoded business rules (FE mirror BE)

Quan trọng vì FE block trước, BE phải re-check.

### 14.1 KYC + property

```
OWNER + needsKyc (kycStatus !== 'approved') →
  - FE chặn: /properties/new, /properties/:id/* mutations
  - FE redirect tới /verify/cccd-front
  - BE 403 nếu user vẫn cố call API
```

### 14.2 Subscription gating

```
OWNER + isKycApproved + !isSubscriptionActive →
  - FE: dashboard banner + paywall modal khi tap "Tạo phòng"
  - BE: 402/403 khi POST /properties (tuỳ implementation)
```

### 14.3 SALE membership

```
SALE + !isSaleMembershipActive (invited/suspended/unassigned) →
  - FE: chỉ access /dashboard, /profile, /notifications
  - FE: dashboard hiện banner "Chưa được gán/tạm khoá"
  - BE: 403 cho mọi mutate endpoint
```

### 14.4 Anti-spam (BE primary, FE assist)

- `/auth/register`: 3 acc/24h/device, 10/24h/IP
- `/auth/google`, `/auth/apple`: cùng rate
- `/staff/invites/verify/:token`: 10 req/min/IP
- `/auth/forgot-password`: 5/h/email

FE gửi `X-Device-Id` (best-effort). BE primary tracking.

### 14.5 Role creation restrictions

```
POST /auth/register, /auth/google, /auth/apple:
  - role=0 (ADMIN): 403 always
  - role=2 (SALE): 403 "phải accept invite"
  - role=1 (OWNER), role=3 (CUSTOMER): OK
  - role missing + new user: 200 isNewUser response cho Google/Apple
  - role missing + existing user: bỏ qua role, login với role hiện có
```

### 14.6 Email/Phone format

- Email: standard regex `^[\w.-]+@[\w.-]+\.\w+$`
- Phone VN: 10 digit bắt đầu `0` (regex `^0\d{9}$`)
  - Helper: `PhoneInput.formatters` + `PhoneInput.validate` ([phone_input.dart](lib/core/utils/phone_input.dart))
  - Auto-strip `+84` / `84` prefix → convert thành `0xxxxxxxxx`

---

## 15. Sequence diagrams cho 3 flow critical

### 15.1 Customer book a property

```
[Customer App] /home → /search → tap property → /rooms/:id
                                                    │
                                                    │ GET /properties/:id (or /properties/share/:id)
                                                    ▼
                                            Property detail screen
                                                    │
                                                    │ User chọn ngày + số khách + tap "Đặt phòng"
                                                    ▼
                                            POST /bookings/customer-hold
                                              { propertyId, checkinDate, checkoutDate, guestCount, ... }
                                                    │
                                                    ▼ 201 Created
                                            Booking với status=HOLD, holdExpireAt=now+15min
                                                    │
                                                    │ FE redirects /my-bookings
                                                    │
                                                    │ BE push 'booking_created' → OWNER
                                                    │
                                                    │ User pay (BE handle qua VNPay)
                                                    │
                                                    │ Webhook → BE confirm booking → status=CONFIRMED
                                                    │ BE push 'booking_confirmed' → OWNER + CUSTOMER
```

### 15.2 OWNER hold + confirm offline booking

```
[OWNER App] /dashboard → tap "Booking" → BookingListScreen
                                              │
                                              │ Tap "+" → /bookings/hold
                                              ▼
                                      HoldRoomScreen
                                              │
                                              │ Form: property, dates, customer info
                                              │ POST /bookings/hold
                                              │   { propertyId, customerName, customerPhone, ... }
                                              ▼
                                      Created HOLD booking
                                              │
                                              │ Customer thanh toán qua kênh khác (cash, transfer)
                                              │
                                              │ OWNER quay lại app → tap booking → "Xác nhận"
                                              │ PATCH /bookings/:id/confirm
                                              ▼
                                      Booking CONFIRMED
                                      BE push 'booking_confirmed' tới CUSTOMER (nếu có account)
```

### 15.3 OWNER mời SALE + SALE accept

(Đã chi tiết ở Section 8 — đây là sequence diagram cô đọng)

```
OWNER → POST /staff/invites { email } → BE
                                          │ Send email với inviteLink + shortCode
                                          ▼
                                       SALE inbox
                                          │ Click link / open app + nhập short code
                                          ▼
                                       /staff/accept?token=
                                          │ GET /staff/invites/verify/:token (public)
                                          ▼
                                       Preview screen
                                          │ Tap "Đăng nhập với Google"
                                          │ google_sign_in.signIn() → idToken
                                          ▼
                                       POST /staff/invites/accept
                                         { token, method: 'google', idToken }
                                          ▼
                                       BE create user role=SALE, ownerId
                                       Return tokens + user
                                          │
                                          │ FE applyExternalLogin
                                          │ BE push 'staff_invite_accepted' → OWNER
                                          ▼
                                       SALE vào dashboard scope theo OWNER
```

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **OWNER** | Chủ homestay/villa, role=1 |
| **SALE** | Nhân viên của OWNER, role=2, có `ownerId` |
| **CUSTOMER** | Khách đặt phòng, role=3 |
| **KYC** | Know Your Customer, verify CCCD + selfie |
| **Subscription** | Gói trả phí giúp OWNER mở khoá tính năng quản lý |
| **Hold** | Booking tạm giữ phòng 15 phút chờ thanh toán |
| **Invite** | Lời mời nhân viên qua email với token + shortCode |
| **shortCode** | Mã 8 ký tự `HL-XXXXXX`, dùng nhập tay khi không click được link |
| **Effective owner ID** | `OWNER.id` nếu user là OWNER, `SALE.ownerId` nếu là SALE — dùng scope query |
| **needsKyc** | OWNER chưa được approve KYC → bị chặn property mutate |
| **Force-update** | Phiên bản app < `minSupportedVersion` → block UI tới khi user update |

---

## 17. Quick reference — checklist BE phải làm

Tổng hợp các điểm BE phải implement/verify để FE chạy trơn tru:

- [ ] `/auth/login` body field tên `email` (KHÔNG `identifier`)
- [ ] `/auth/google` + `/auth/apple` support 4 case (existing/new+role/new-no-role/error)
- [ ] `/auth/google` `/auth/apple` reject role=0 (403), role=2 (403)
- [ ] `/auth/google` audience verify = WEB_CLIENT_ID
- [ ] `/auth/apple` cache email/name lần đầu (sau không trả lại)
- [ ] `/auth/refresh` rotation invalidate token cũ
- [ ] `X-Device-Id` anti-spam tracking ở 3 endpoint auth
- [ ] **`DELETE /users/me`** — self-delete cho user hiện tại (compliance)
- [ ] **`GET /app/version`** — public, trả version metadata
- [ ] `/devices` POST upsert (cùng token đổi user → update user_id)
- [ ] `/devices` DELETE idempotent
- [ ] Push payload có `data.deepLink` cho FE routing
- [ ] `/staff/invites/verify/:token` public, rate limit 10/min/IP
- [ ] `/staff/invites/accept` public, support method=google + method=password
- [ ] Property/booking endpoints auto-scope theo `getEffectiveOwnerId(user)`
- [ ] OWNER mutate property cần `kycStatus='approved'` (re-check ngoài FE guard)
- [ ] OWNER tạo invite cần KYC + subscription active
- [ ] Soft-delete user (`deletedAt` + revoke refresh token)
- [ ] FCM Admin SDK gửi push qua Service Account JSON

---

**Kết**: Tài liệu này được tạo bằng cách audit toàn bộ source code Flutter app.
Mọi route path, endpoint, model field đều EXACT theo code thực tế tại
`2026-05-10`. Khi có thay đổi BE, FE sẽ update tài liệu này.

Liên hệ FE team nếu có thắc mắc/clarification.
