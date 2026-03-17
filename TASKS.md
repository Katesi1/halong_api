# TASKS - Backend Code Review theo AI_CODING_STANDARDS

> Kết quả kiểm tra codebase backend theo tiêu chuẩn AI_CODING_STANDARDS.md
> Mỗi task là một vi phạm hoặc thiếu sót cần sửa. Làm từng task, test, rồi review.
>
> **Trạng thái: 25/25 tasks hoàn thành**
> **Unit tests: 7 suites, 46 tests — ALL PASS**
> **Integration tests: 44 API test cases — ALL PASS**
> **API Documentation: API_DOCUMENTATION.md**

---

## NHÓM A: BẢO MẬT (Security)

### Task A1: JwtStrategy dùng fallback secret
- **File:** `src/modules/auth/strategies/jwt.strategy.ts:16`
- **Vi phạm:** `secretOrKey: configService.get<string>('JWT_SECRET', 'fallback-secret')` — dùng secret mặc định, vi phạm mục 11.1 "Không dùng secret mặc định trong production"
- **Sửa:** Bỏ fallback, throw error nếu `JWT_SECRET` không có trong env
- **Test:**
  - [ ] Khi `JWT_SECRET` không set trong env → app phải throw error khi khởi động
  - [ ] Khi `JWT_SECRET` có trong env → app khởi động bình thường

### Task A2: Partner createBooking không validate DTO
- **File:** `src/modules/partner/partner.controller.ts:58`
- **Vi phạm:** `@Body() body: any` — không dùng DTO, vi phạm mục 3.2 "Luôn dùng class-validator decorators" và mục 7.2 "Validate input với DTO trước khi vào service"
- **Sửa:** Tạo `CreatePartnerBookingDto` với validation đầy đủ
- **Test:**
  - [ ] POST `/api/v1/partner/bookings` với body trống → trả 400 với message validation
  - [ ] POST với `roomId` trống → trả 400
  - [ ] POST với `checkinDate` không phải date format → trả 400
  - [ ] POST với data hợp lệ → trả 201

### Task A3: UpdateBookingDto cho phép thay đổi status trực tiếp
- **File:** `src/modules/bookings/dto/update-booking.dto.ts:24-26`
- **Vi phạm:** Field `status` trong UpdateBookingDto cho phép client bypass flow confirm/cancel. Mục 7.2: "Kiểm tra ownership trước khi UPDATE/DELETE"
- **Sửa:** Xoá field `status` khỏi UpdateBookingDto (đã có endpoint riêng cho confirm/cancel)
- **Test:**
  - [ ] PUT `/api/v1/bookings/:id` với `{ status: "CONFIRMED" }` → status không bị thay đổi
  - [ ] PUT với `{ customerName: "Test" }` → chỉ customerName thay đổi

### Task A4: Homestay findOne không filter isActive
- **File:** `src/modules/homestays/homestays.service.ts:35-48`
- **Vi phạm:** `findOne` trả về cả homestay đã bị soft-delete (isActive=false), vi phạm logic soft-delete mục 3.6
- **Sửa:** Thêm check `isActive` hoặc trả 404 nếu homestay đã bị xoá
- **Test:**
  - [ ] GET `/api/v1/homestays/:id` với id của homestay isActive=false → trả 404
  - [ ] GET với id homestay isActive=true → trả 200

### Task A5: Room findOne không filter isActive
- **File:** `src/modules/rooms/rooms.service.ts:43-57`
- **Vi phạm:** Tương tự A4, `findOne` trả về phòng đã bị soft-delete
- **Sửa:** Thêm check `isActive` hoặc trả 404
- **Test:**
  - [ ] GET `/api/v1/rooms/:id` với room isActive=false → trả 404
  - [ ] GET với room isActive=true → trả 200

### Task A6: Partner getRoomDetail leak thông tin homestay
- **File:** `src/modules/partner/partner.service.ts:42-44`
- **Vi phạm:** `include: { homestay: true }` — trả toàn bộ homestay bao gồm cả ownerId, vi phạm mục 3.5 "Chỉ select fields cần thiết"
- **Sửa:** Chỉ select các field cần thiết: `id, name, address`
- **Test:**
  - [ ] GET `/api/v1/partner/rooms/:id` → response không chứa `ownerId`
  - [ ] Response chứa `homestay.name`, `homestay.address`

---

## NHÓM B: RESPONSE FORMAT & ERROR HANDLING

### Task B1: getRoomCalendar hardcode message tiếng Việt
- **File:** `src/modules/bookings/bookings.service.ts:256`
- **Vi phạm:** `return { message: 'Lấy dữ liệu lịch thành công', data: result }` — hardcode string thay vì dùng i18n, không nhất quán với toàn bộ codebase
- **Sửa:** Thêm key `calendarSuccess` vào i18n và dùng `msg.bookings.calendarSuccess` (key đã có trong i18n nhưng chưa dùng)
- **Test:**
  - [ ] GET `/api/v1/bookings/calendar/:roomId` với `Accept-Language: en` → message bằng tiếng Anh
  - [ ] GET với `Accept-Language: vi` → message bằng tiếng Việt

### Task B2: PartnerApiKeyGuard hardcode message thay vì dùng i18n
- **File:** `src/common/guards/partner-api-key.guard.ts:16,23`
- **Vi phạm:** Hardcode `'API key bị thiếu'` và `'API key không hợp lệ'`, trong khi đã có key `apiKey.missing` và `apiKey.invalid` trong i18n
- **Sửa:** Inject i18n vào guard hoặc dùng message tiếng Anh mặc định (guard không có access request language dễ dàng, nên dùng English mặc định)
- **Test:**
  - [ ] Request không có header `X-Partner-Key` → trả 401 với message rõ ràng
  - [ ] Request có key sai → trả 401

### Task B3: AppController + AppService không dùng, gây confuse
- **File:** `src/app.controller.ts`, `src/app.service.ts`
- **Vi phạm:** Không được dùng, `getHello()` không có route nào gọi, `app.controller.spec.ts` test method không tồn tại trên controller
- **Sửa:** Xoá AppController, AppService, và file spec tương ứng (hoặc cleanup)
- **Test:**
  - [ ] `npx tsc --noEmit` pass sau khi xoá
  - [ ] App khởi động bình thường

---

## NHÓM C: PHÂN QUYỀN (Authorization)

### Task C1: Booking findAll - OWNER không filter theo homestay mình sở hữu đúng cách
- **File:** `src/modules/bookings/bookings.service.ts:33-35`
- **Hiện tại:** OWNER filter `room.homestay.ownerId` — đúng
- **Tuy nhiên:** Booking `findOne` (line 64-91) cần kiểm tra OWNER access cho booking thuộc phòng của mình
- **Vi phạm:** `checkBookingAccess` chỉ check SALE, không check OWNER
- **Sửa:** Thêm logic check OWNER trong `checkBookingAccess`: OWNER chỉ xem booking thuộc phòng trong homestay của mình
- **Test:**
  - [ ] OWNER A gọi GET `/api/v1/bookings/:id` booking thuộc homestay B → trả 403
  - [ ] OWNER A gọi GET booking thuộc homestay A → trả 200
  - [ ] SALE gọi GET booking của SALE khác → trả 403

### Task C2: Booking update không check OWNER access
- **File:** `src/modules/bookings/bookings.service.ts:215-226`
- **Vi phạm:** `checkBookingAccess` chỉ check SALE, OWNER có thể update bất kỳ booking nào. Vi phạm mục 2 "Owner chỉ được thao tác với dữ liệu của mình"
- **Sửa:** Mở rộng `checkBookingAccess` để check OWNER tương tự C1
- **Test:**
  - [ ] OWNER update booking thuộc homestay khác → trả 403
  - [ ] OWNER update booking thuộc homestay mình → trả 200

### Task C3: SALE role không nên có trong @Roles cho homestays
- **File:** `src/modules/homestays/homestays.controller.ts`
- **Hiện tại:** Không có `@Roles` trên `findAll` và `findOne` → SALE có thể xem
- **Kiểm tra chuẩn:** Theo mục 2, SALE "Xem phòng" nhưng không nói xem homestay — tuy nhiên điều này có vẻ hợp lý vì SALE cần xem homestay để chọn phòng. **Không cần sửa, chỉ ghi nhận.**

---

## NHÓM D: VALIDATION & DTO

### Task D1: UpdateHomestayDto thiếu ApiProperty decorators
- **File:** `src/modules/homestays/dto/update-homestay.dto.ts`
- **Vi phạm:** Không có `@ApiPropertyOptional()` → Swagger UI không hiển thị fields
- **Sửa:** Thêm `@ApiPropertyOptional()` cho tất cả fields
- **Test:**
  - [ ] Swagger UI hiển thị đầy đủ fields cho PUT `/api/v1/homestays/:id`

### Task D2: UpdateUserDto thiếu ApiProperty decorators
- **File:** `src/modules/users/dto/update-user.dto.ts`
- **Vi phạm:** Tương tự D1
- **Sửa:** Thêm `@ApiPropertyOptional()` cho tất cả fields
- **Test:**
  - [ ] Swagger UI hiển thị đầy đủ fields cho PUT `/api/v1/users/:id`

### Task D3: UpdateRoomDto thiếu ApiProperty decorators
- **File:** `src/modules/rooms/dto/update-room.dto.ts`
- **Vi phạm:** Tương tự D1
- **Sửa:** Thêm `@ApiPropertyOptional()` cho tất cả fields
- **Test:**
  - [ ] Swagger UI hiển thị đầy đủ fields cho PUT `/api/v1/rooms/:id`

### Task D4: UpdateBookingDto thiếu ApiProperty decorators
- **File:** `src/modules/bookings/dto/update-booking.dto.ts`
- **Vi phạm:** Tương tự D1
- **Sửa:** Thêm `@ApiPropertyOptional()` cho tất cả fields
- **Test:**
  - [ ] Swagger UI hiển thị đầy đủ fields cho PUT `/api/v1/bookings/:id`

### Task D5: Users service update dùng `data: any`
- **File:** `src/modules/users/users.service.ts:71`
- **Vi phạm:** `const data: any = { ...dto }` — dùng `any` type, không type-safe
- **Sửa:** Dùng Prisma type hoặc tạo interface rõ ràng
- **Test:**
  - [ ] Update user với password → password được hash
  - [ ] Update user không có password → các field khác update đúng

---

## NHÓM E: CODE QUALITY

### Task E1: Homestays findAll không filter SALE theo đúng logic
- **File:** `src/modules/homestays/homestays.service.ts:16-21`
- **Hiện tại:** SALE thấy tất cả homestay active (giống ADMIN) — theo standards mục 2, SALE "Xem phòng" nên đây có vẻ hợp lý
- **Tuy nhiên:** Nên đảm bảo nhất quán — SALE xem rooms trực tiếp, nhưng cũng cần xem homestay để navigate. **Không cần sửa, ghi nhận.**

### Task E2: Partner module không bypass JWT đúng cách
- **File:** `src/modules/partner/partner.controller.ts`
- **Vi phạm:** Không có `@Public()` decorator nhưng dùng `PartnerApiKeyGuard`. Global `JwtAuthGuard` sẽ chặn trước khi `PartnerApiKeyGuard` chạy → Partner API không hoạt động nếu không có JWT
- **Sửa:** Thêm `@Public()` cho PartnerController để bypass JwtAuthGuard, chỉ dùng PartnerApiKeyGuard
- **Test:**
  - [ ] Request với header `X-Partner-Key` hợp lệ (không có JWT) → trả 200
  - [ ] Request không có cả JWT lẫn `X-Partner-Key` → trả 401

### Task E3: Booking holdRoom - HOLD cùng phòng nhưng khác ngày không check overlap
- **File:** `src/modules/bookings/bookings.service.ts:109-119`
- **Hiện tại:** Check Redis hold theo roomId → 1 room chỉ có 1 hold tại 1 thời điểm, kể cả ngày khác nhau
- **Vấn đề:** 2 SALE khác nhau không thể hold cùng room cho 2 khoảng ngày khác nhau
- **Sửa:** Cân nhắc thay đổi key Redis thành `hold:{roomId}:{checkin}-{checkout}` hoặc giữ nguyên nếu business logic yêu cầu chỉ 1 hold/room
- **Test:**
  - [ ] Ghi nhận behavior hiện tại: SALE A hold room ngày 20-22, SALE B hold room ngày 25-27 → bị chặn (document rõ)

### Task E4: Console.log trong main.ts
- **File:** `src/main.ts:50`
- **Vi phạm:** `console.log('🚀 Server running...')` — mục 10 "Không có console.log debug trong code"
- **Sửa:** Dùng NestJS Logger thay thế
- **Test:**
  - [ ] App khởi động → log qua NestJS Logger, không dùng console.log

### Task E5: Seed file log credentials ra console
- **File:** `prisma/seed.ts:27`
- **Vi phạm:** `console.log(` Password : ${adminPassword}`)` — mục 7.1 "Không log password ra console"
- **Sửa:** Bỏ log password, chỉ log "Admin created successfully"
- **Test:**
  - [ ] Chạy `npm run db:seed` → không thấy password trong output

---

## NHÓM F: UNIT TEST (Thiếu hoàn toàn)

### Task F1: Tạo test cho AuthService
- **Vi phạm:** Mục 10 checklist — không có test nào ngoài app.controller.spec.ts mẫu
- **Test cần viết:**
  - [ ] `login()` — credentials đúng → trả tokens
  - [ ] `login()` — credentials sai → throw UnauthorizedException
  - [ ] `login()` — user inactive → throw UnauthorizedException
  - [ ] `refreshToken()` — token hợp lệ → trả tokens mới
  - [ ] `refreshToken()` — token hết hạn → throw ForbiddenException
  - [ ] `logout()` → refreshToken bị xoá
  - [ ] `getProfile()` → trả user không có password

### Task F2: Tạo test cho UsersService
- **Test cần viết:**
  - [ ] `findAll()` — trả danh sách user không có password
  - [ ] `create()` — phone trùng → throw ConflictException
  - [ ] `create()` — thành công → password được hash
  - [ ] `update()` — user không tồn tại → throw NotFoundException
  - [ ] `remove()` — xoá chính mình → throw BadRequestException
  - [ ] `remove()` — soft delete → isActive = false

### Task F3: Tạo test cho BookingsService
- **Test cần viết:**
  - [ ] `holdRoom()` — checkin >= checkout → throw BadRequestException
  - [ ] `holdRoom()` — checkin trong quá khứ → throw BadRequestException
  - [ ] `holdRoom()` — phòng đã confirmed trong khoảng ngày → throw BadRequestException
  - [ ] `holdRoom()` — thành công → status = HOLD, Redis set
  - [ ] `confirmBooking()` — status != HOLD → throw BadRequestException
  - [ ] `confirmBooking()` — OWNER khác homestay → throw ForbiddenException
  - [ ] `cancelBooking()` — đã cancel → throw BadRequestException
  - [ ] `expireHoldBookings()` — booking hết hạn → status = CANCELLED

### Task F4: Tạo test cho RoomsService
- **Test cần viết:**
  - [ ] `create()` — code trùng → throw ConflictException
  - [ ] `create()` — OWNER thêm phòng vào homestay người khác → throw ForbiddenException
  - [ ] `uploadImages()` — vượt 20 ảnh → throw ConflictException
  - [ ] `deleteImage()` — xoá ảnh cover → ảnh khác tự thành cover
  - [ ] `setCoverImage()` — thành công → chỉ 1 ảnh isCover=true

### Task F5: Tạo test cho HomestaysService
- **Test cần viết:**
  - [ ] `findAll()` — OWNER chỉ thấy homestay của mình
  - [ ] `create()` — ADMIN chỉ định ownerId không tồn tại → throw NotFoundException
  - [ ] `update()` — OWNER update homestay người khác → throw ForbiddenException
  - [ ] `remove()` — soft delete → isActive = false

### Task F6: Tạo test cho PricesService
- **Test cần viết:**
  - [ ] `getPrice()` — chưa có giá → throw NotFoundException
  - [ ] `upsertPrice()` — OWNER cập nhật phòng người khác → throw ForbiddenException
  - [ ] `calculateTotalPrice()` — tính giá đúng theo ngày trong tuần

### Task F7: Tạo test cho PartnerService
- **Test cần viết:**
  - [ ] `getRooms()` — pagination đúng
  - [ ] `createBooking()` — phòng đã booked → throw BadRequestException
  - [ ] `cancelBooking()` — đã cancel → throw BadRequestException

---

## THỨ TỰ THỰC HIỆN (Khuyến nghị)

1. **A1** → Security critical: bỏ fallback secret
2. **E2** → Partner API không hoạt động: thêm @Public()
3. **A2** → Security: tạo DTO cho partner booking
4. **A3** → Security: xoá status khỏi UpdateBookingDto
5. **A4, A5** → Soft delete consistency
6. **A6** → Data leak prevention
7. **B1, B2** → i18n consistency
8. **B3** → Cleanup unused code
9. **C1, C2** → Authorization holes
10. **D1-D5** → Swagger & type safety
11. **E3, E4, E5** → Code quality
12. **F1-F7** → Unit tests

---

*Tổng: 25 tasks | Được phân nhóm: Security (6), Response (3), Authorization (2+1 noted), Validation (5), Code Quality (4+1 noted), Tests (7)*
