# CLAUDE.md — Halong24h Backend

> Quy trình, cấu trúc, quy tắc coding cho NestJS Backend.
> Mọi thay đổi code PHẢI tuân thủ file này.

---

## 1. KIẾN TRÚC TỔNG QUAN — MVC Pattern

```
src/
├── common/                          # Shared infrastructure (Cross-cutting concerns)
│   ├── decorators/                  # @CurrentUser, @Public, @Roles, @Lang
│   ├── guards/                      # JwtAuthGuard, RolesGuard, PartnerApiKeyGuard
│   ├── filters/                     # AllExceptionsFilter (global error handling)
│   ├── interceptors/                # ResponseInterceptor (wrap {success, message, data})
│   └── pipes/                       # ValidationPipe (global, auto DTO validation)
│
├── config/                          # External service configs
│   ├── cloudinary.service.ts        # Image upload (Cloudinary)
│   └── redis.service.ts             # Cache & hold management (Redis)
│
├── prisma/                          # Database layer (Model)
│   ├── prisma.service.ts            # Prisma Client wrapper
│   └── prisma.module.ts
│
├── i18n/                            # Internationalization
│   ├── en.ts                        # English messages
│   ├── vi.ts                        # Vietnamese messages
│   └── index.ts                     # Message resolver
│
└── modules/                         # Feature modules (MVC per module)
    ├── auth/                        # Authentication & Authorization
    ├── users/                       # User management (ADMIN only)
    ├── homestays/                   # Homestay CRUD
    ├── rooms/                       # Room CRUD + images + public listing
    ├── prices/                      # Room pricing
    ├── bookings/                    # Booking management + customer booking
    └── partner/                     # Partner API (external)
```

### MVC Mapping trong NestJS

| MVC Layer   | NestJS Component        | Trách nhiệm                              |
|-------------|-------------------------|-------------------------------------------|
| **Model**   | Prisma Schema + Service | Data access, business logic, validation   |
| **View**    | DTO + ResponseInterceptor | Request/response shaping, API docs      |
| **Controller** | Controller           | Route handling, decorator, delegate to Service |

---

## 2. HỆ THỐNG PHÂN QUYỀN (ROLE SYSTEM)

### 3 Roles

| Role       | Mô tả                     | Cách tạo          |
|------------|----------------------------|--------------------|
| `ADMIN`    | Quản trị toàn hệ thống    | Chỉ seed trong DB  |
| `STAFF`    | Nhân viên quản lý homestay | Tự đăng ký        |
| `CUSTOMER` | Khách hàng đặt phòng      | Tự đăng ký        |

### Bảng quyền

| Chức năng                  | ADMIN | STAFF | CUSTOMER |
|----------------------------|:-----:|:-----:|:--------:|
| Đăng nhập/Google           | V     | V     | V        |
| Đăng ký                    | X     | V     | V        |
| Quản lý users              | V     | X     | X        |
| Quản lý homestays          | V     | V     | X        |
| Quản lý rooms (nội bộ)     | V     | V     | X        |
| GET /rooms/public          | V     | V     | V        |
| Quản lý bookings (staff)   | V     | V     | X        |
| Customer đặt/xem/huỷ phòng | X     | X     | V        |

> ADMIN/STAFF có thể gọi endpoint Customer khi toggle "Xem như khách".

---

## 3. QUY TRÌNH THÊM TÍNH NĂNG MỚI

### Bước 1: Schema (nếu cần)
```
prisma/schema.prisma → thêm/sửa model, enum
→ npx prisma migrate dev --name <tên>
→ npx prisma generate
```

### Bước 2: i18n Messages
```
src/i18n/vi.ts → thêm messages tiếng Việt
src/i18n/en.ts → thêm messages tiếng Anh
src/i18n/index.ts → update type nếu cần
```

### Bước 3: DTO
```
src/modules/<module>/dto/ → tạo DTO với class-validator
- Mọi input PHẢI validate bằng decorator
- Dùng @ApiProperty() cho Swagger docs
```

### Bước 4: Service (Business Logic)
```
src/modules/<module>/<module>.service.ts
- Kiểm tra quyền role trong service
- Return { message: msg.xxx, data: ... }
- Dùng NestJS exceptions (NotFoundException, ForbiddenException, etc.)
- Select chỉ fields cần thiết (tránh leak password, refreshToken)
- Soft delete bằng isActive = false
```

### Bước 5: Controller (Routes)
```
src/modules/<module>/<module>.controller.ts
- Gắn @Roles() decorator theo bảng quyền
- Dùng @Public() cho route không cần auth
- Dùng @CurrentUser() để lấy user từ JWT
- Dùng @Lang() để lấy i18n messages
```

### Bước 6: Module Registration
```
- Export service nếu module khác cần dùng
- Import vào app.module.ts nếu là module mới
```

### Bước 7: Test
```
- Chạy: npm run test
- Chạy: npx tsc --noEmit (TypeScript check)
- Fix mọi lỗi trước khi báo hoàn thành
```

---

## 4. CẤU TRÚC MỖI MODULE (Template)

```
modules/<tên>/
├── dto/
│   ├── create-<tên>.dto.ts     # Input validation cho POST
│   └── update-<tên>.dto.ts     # Input validation cho PUT/PATCH
├── <tên>.controller.ts          # Route definitions + decorators
├── <tên>.service.ts             # Business logic + DB access
├── <tên>.service.spec.ts        # Unit tests
└── <tên>.module.ts              # Module declaration
```

---

## 5. QUY TẮC CODE BẮT BUỘC

### 5.1 Response Format
```typescript
// Service LUÔN return format này:
return { message: msg.xxx.xxxSuccess, data: result };

// ResponseInterceptor tự wrap thành:
// { success: true, message: "...", data: { ... } }
```

### 5.2 Error Handling
```typescript
// Dùng NestJS built-in exceptions
throw new NotFoundException(msg.xxx.notFound);
throw new ForbiddenException(msg.xxx.forbidden);
throw new ConflictException(msg.xxx.duplicate);
throw new BadRequestException(msg.xxx.invalid);

// KHÔNG throw new Error('...')
```

### 5.3 Database Access
```typescript
// LUÔN select fields cụ thể cho user (tránh leak password/token)
select: { id: true, name: true, phone: true, email: true, role: true, isActive: true }

// KHÔNG: findUnique({ where: { id } }) rồi return hết
```

### 5.4 Roles & Auth
```typescript
// Route cần auth (mặc định tất cả):
@UseGuards(JwtAuthGuard, RolesGuard)

// Route public (login, register, refresh):
@Public()

// Route giới hạn role:
@Roles(Role.ADMIN)
@Roles(Role.ADMIN, Role.STAFF)
```

### 5.5 Soft Delete
```typescript
// ĐÚNG: isActive = false
await this.prisma.xxx.update({ where: { id }, data: { isActive: false } });

// SAI: Hard delete
await this.prisma.xxx.delete({ where: { id } });
```

### 5.6 Booking Hold Logic
```
- Staff hold: 30 phút → holdExpireAt = now + 30min, dùng Redis
- Customer hold: 24 giờ → holdExpireAt = now + 24h
- Cron job mỗi phút check và auto-cancel expired holds
- holdRemainingSeconds = max(0, holdExpireAt - now) tính bằng giây
```

---

## 6. API ENDPOINTS TỔNG HỢP

### Public (không cần auth)
| Method | Endpoint               | Mô tả                         |
|--------|------------------------|--------------------------------|
| POST   | /auth/login            | Đăng nhập                     |
| POST   | /auth/register         | Đăng ký (STAFF/CUSTOMER)      |
| POST   | /auth/google           | Đăng nhập Google              |
| POST   | /auth/refresh          | Refresh token                 |
| POST   | /auth/forgot-password  | Quên mật khẩu                |
| POST   | /auth/reset-password   | Đặt lại mật khẩu             |

### Auth required
| Method | Endpoint                            | Roles           |
|--------|-------------------------------------|-----------------|
| POST   | /auth/logout                        | All             |
| GET    | /auth/profile                       | All             |
| GET    | /users                              | ADMIN           |
| GET    | /users/:id                          | ADMIN           |
| POST   | /users                              | ADMIN           |
| PUT    | /users/:id                          | ADMIN           |
| DELETE | /users/:id                          | ADMIN           |
| GET    | /homestays                          | ADMIN, STAFF    |
| GET    | /homestays/:id                      | ADMIN, STAFF    |
| POST   | /homestays                          | ADMIN, STAFF    |
| PUT    | /homestays/:id                      | ADMIN, STAFF    |
| DELETE | /homestays/:id                      | ADMIN, STAFF    |
| GET    | /rooms                              | ADMIN, STAFF    |
| GET    | /rooms/public                       | All             |
| GET    | /rooms/:id                          | ADMIN, STAFF    |
| POST   | /rooms                              | ADMIN, STAFF    |
| PUT    | /rooms/:id                          | ADMIN, STAFF    |
| DELETE | /rooms/:id                          | ADMIN, STAFF    |
| POST   | /rooms/:id/images                   | ADMIN, STAFF    |
| DELETE | /rooms/:id/images/:imgId            | ADMIN, STAFF    |
| PATCH  | /rooms/:id/images/:imgId/cover      | ADMIN, STAFF    |
| PUT    | /rooms/:id/prices                   | ADMIN, STAFF    |
| GET    | /bookings                           | ADMIN, STAFF    |
| GET    | /bookings/calendar/:roomId          | ADMIN, STAFF    |
| POST   | /bookings/hold                      | ADMIN, STAFF    |
| PATCH  | /bookings/:id/confirm               | ADMIN, STAFF    |
| PATCH  | /bookings/:id/cancel                | ADMIN, STAFF    |
| PUT    | /bookings/:id                       | ADMIN, STAFF    |
| POST   | /bookings/customer-hold             | CUSTOMER (+ALL) |
| GET    | /bookings/my                        | CUSTOMER (+ALL) |
| PATCH  | /bookings/:id/customer-cancel       | CUSTOMER (+ALL) |

---

## 7. CHECKLIST TRƯỚC KHI HOÀN THÀNH

- [ ] `npx tsc --noEmit` — không TypeScript error
- [ ] `npm run test` — tất cả tests pass
- [ ] DTO validate đầy đủ input
- [ ] Service kiểm tra quyền role
- [ ] Response đúng format { message, data }
- [ ] Không có console.log debug
- [ ] Không leak password/refreshToken trong response
- [ ] i18n messages đầy đủ (en + vi)
- [ ] Swagger decorators đầy đủ

---

## 8. TECH STACK

| Component      | Technology                |
|----------------|---------------------------|
| Framework      | NestJS 11                 |
| Language       | TypeScript 5.7            |
| Database       | PostgreSQL + Prisma ORM   |
| Cache          | Redis (ioredis)           |
| Auth           | JWT + Passport            |
| File Upload    | Cloudinary                |
| Validation     | class-validator           |
| API Docs       | Swagger (@nestjs/swagger) |
| Rate Limiting  | @nestjs/throttler         |
| Cron Jobs      | @nestjs/schedule          |
| Testing        | Jest + Supertest          |

---

## 9. SCRIPTS

```bash
npm run start:dev     # Development mode (watch)
npm run build         # Compile TypeScript
npm run test          # Unit tests
npm run test:e2e      # E2E tests
npm run lint          # ESLint
npx tsc --noEmit      # Type check
npm run db:migrate    # Run Prisma migrations
npm run db:generate   # Regenerate Prisma client
npm run db:seed       # Seed database
npm run db:studio     # Prisma Studio UI
```
