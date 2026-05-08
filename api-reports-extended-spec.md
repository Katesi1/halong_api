# API Spec — Báo cáo mở rộng + Đánh giá khách (Reviews)

> **Ngày**: 2026-05-05
> **Audience**: Backend dev (Node/Express + Postgres) tại repo Halong24h API
> **Frontend**: 100% UI đã xong với mock data (xem `lib/features/reports/`).
> Khi backend implement đủ field/endpoint dưới, frontend tự switch sang real
> data — không cần đổi UI code.

---

## 1. Bối cảnh

### 1.1 Tại sao mở rộng

App hiện chỉ có report 4-KPI sơ sài (totalRooms, occupancy, totalBookings,
totalDeposit). Owner cần dashboard analytics đầy đủ để ra quyết định
business: pricing, promotion, cải thiện trải nghiệm.

Frontend đã build sẵn UI cho:
- **Period filter** (Hôm nay / Tuần / Tháng / Năm / Custom)
- **4 KPI mới với delta % so với kỳ trước** (Doanh thu, Lấp đầy, ADR, Booking)
- **Revenue trend line chart** (30 ngày)
- **Status donut** (booking status breakdown)
- **Top 5 phòng theo doanh thu**
- **Day-of-week occupancy heatmap** (T2-CN intensity)
- **Length of stay histogram** (1đ / 2-3 / 4-7 / 8+ đêm)
- **Đánh giá khách** — overview avg + 5★ distribution bars + 6 tiêu chí
- **Recent reviews** preview với customer avatar/comment

### 1.2 Quyết định kiến trúc rating

**Rating ở cấp Property (căn), KHÔNG cấp Room.**

| Cấp | Description | Lý do |
|---|---|---|
| **Property** (căn) | Khách rate listing họ book → mỗi căn có rating riêng | Khớp pattern Booking.com/Airbnb. Owner thấy căn nào tốt/tệ |
| **Owner profile** | Aggregate weighted avg theo số review của tất cả căn | "Superhost score" — khách dùng để đánh giá độ tin cậy |
| **Room** (phòng trong KS) | KHÔNG rate | KS 50 phòng cùng vị trí/tiện nghi → fragmentation vô nghĩa |

### 1.3 Tiêu chí 6 chiều (chuẩn Booking.com/Airbnb VN)

Mỗi review gồm 6 score riêng (1-5):

| # | Field | Vietnamese label |
|---|---|---|
| 1 | `cleanliness` | Sạch sẽ |
| 2 | `location` | Vị trí |
| 3 | `amenities` | Tiện nghi |
| 4 | `service` | Dịch vụ |
| 5 | `value` | Giá trị |
| 6 | `accuracy` | Đúng mô tả |

Overall rating = trung bình 6 chiều = `(c+l+a+s+v+ac) / 6`.

---

## 2. Database schema — bảng mới

```sql
-- Reviews từ khách cho từng property
CREATE TABLE property_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id      UUID NOT NULL REFERENCES bookings(id),
  customer_id     UUID NOT NULL REFERENCES users(id),

  -- 6 score (1-5)
  cleanliness     SMALLINT NOT NULL CHECK (cleanliness BETWEEN 1 AND 5),
  location        SMALLINT NOT NULL CHECK (location BETWEEN 1 AND 5),
  amenities       SMALLINT NOT NULL CHECK (amenities BETWEEN 1 AND 5),
  service         SMALLINT NOT NULL CHECK (service BETWEEN 1 AND 5),
  value           SMALLINT NOT NULL CHECK (value BETWEEN 1 AND 5),
  accuracy        SMALLINT NOT NULL CHECK (accuracy BETWEEN 1 AND 5),

  -- Avg pre-computed cho query nhanh (= AVG 6 score)
  avg_rating      NUMERIC(3,2) GENERATED ALWAYS AS (
    (cleanliness + location + amenities + service + value + accuracy) / 6.0
  ) STORED,

  comment         TEXT,
  photos          JSONB,                -- ["url1", "url2", ...]

  -- Owner reply (optional, owner có thể reply review)
  owner_reply     TEXT,
  owner_reply_at  TIMESTAMPTZ,

  -- Hidden review (admin moderation — nội dung vi phạm)
  is_hidden       BOOLEAN DEFAULT false,
  hidden_reason   TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  -- 1 booking chỉ review được 1 lần
  CONSTRAINT one_review_per_booking UNIQUE (booking_id)
);

CREATE INDEX idx_reviews_property ON property_reviews(property_id);
CREATE INDEX idx_reviews_customer ON property_reviews(customer_id);
CREATE INDEX idx_reviews_visible_recent
  ON property_reviews(created_at DESC)
  WHERE is_hidden = false;

-- Materialized view cho aggregate per-property (refresh nightly hoặc on-write)
CREATE MATERIALIZED VIEW property_rating_aggregates AS
SELECT
  p.id AS property_id,
  COUNT(r.id) AS total_reviews,
  AVG(r.avg_rating) AS avg_rating,
  AVG(r.cleanliness) AS avg_cleanliness,
  AVG(r.location) AS avg_location,
  AVG(r.amenities) AS avg_amenities,
  AVG(r.service) AS avg_service,
  AVG(r.value) AS avg_value,
  AVG(r.accuracy) AS avg_accuracy,
  COUNT(*) FILTER (WHERE FLOOR(r.avg_rating) = 5) AS count_5_star,
  COUNT(*) FILTER (WHERE FLOOR(r.avg_rating) = 4) AS count_4_star,
  COUNT(*) FILTER (WHERE FLOOR(r.avg_rating) = 3) AS count_3_star,
  COUNT(*) FILTER (WHERE FLOOR(r.avg_rating) = 2) AS count_2_star,
  COUNT(*) FILTER (WHERE FLOOR(r.avg_rating) = 1) AS count_1_star
FROM properties p
LEFT JOIN property_reviews r
  ON r.property_id = p.id AND r.is_hidden = false
GROUP BY p.id;

CREATE UNIQUE INDEX idx_rating_agg_property
  ON property_rating_aggregates(property_id);
```

---

## 3. Endpoints mới

### 3.1 `POST /properties/:id/reviews` — Khách tạo review

**Auth**: Bearer token (CUSTOMER role).

**Eligibility check**: Khách chỉ review được khi:
- Có booking đã `completed` cho property này (đã check-out)
- Chưa review booking đó (`UNIQUE (booking_id)`)

**Request**:
```http
POST /properties/abc-uuid/reviews
Authorization: Bearer <CUSTOMER_TOKEN>
Content-Type: application/json

{
  "bookingId": "booking-uuid",
  "cleanliness": 5,
  "location": 4,
  "amenities": 5,
  "service": 5,
  "value": 4,
  "accuracy": 5,
  "comment": "Phòng sạch sẽ, view biển tuyệt vời...",
  "photos": ["https://res.cloudinary.com/.../photo1.jpg"]
}
```

**Validate**:
- 6 score đều integer 1-5 → `400 invalid_score`
- `bookingId` thuộc về `customer_id` (req.user) → `403 not_your_booking`
- Booking status = `completed` → `400 booking_not_completed`
- Booking đã review rồi → `409 already_reviewed`

**Response 201**:
```json
{
  "success": true,
  "message": "Đánh giá đã được gửi",
  "data": {
    "id": "review-uuid",
    "propertyId": "abc-uuid",
    "avgRating": 4.67,
    "createdAt": "2026-05-05T10:00:00Z"
  }
}
```

**Side effects**:
- `REFRESH MATERIALIZED VIEW CONCURRENTLY property_rating_aggregates` (async, hoặc trigger increment counter)
- Push FCM tới owner: `"Bạn vừa nhận review mới · ⭐ 4.7"`

### 3.2 `GET /properties/:id/reviews` — List reviews per property

**Auth**: Public (cho phép khách xem review trước khi book) + management.

**Request**:
```http
GET /properties/abc-uuid/reviews?page=1&pageSize=20&sort=newest
```

| Query | Default | Values |
|---|---|---|
| `page` | 1 | int ≥ 1 |
| `pageSize` | 20 | int 1-50 |
| `sort` | `newest` | `newest \| oldest \| highest \| lowest` |
| `minRating` | — | 1-5 (filter) |

**Response 200**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "avgRating": 4.7,
      "totalReviews": 28,
      "distribution": { "5": 17, "4": 6, "3": 2, "2": 0, "1": 0 },
      "breakdown": {
        "cleanliness": 4.8,
        "location": 4.7,
        "amenities": 4.5,
        "service": 4.9,
        "value": 4.6,
        "accuracy": 4.7
      }
    },
    "items": [
      {
        "id": "review-uuid",
        "customer": {
          "id": "user-uuid",
          "name": "Nguyễn Minh Anh",
          "avatar": "https://res.cloudinary.com/.../avatar.jpg"
        },
        "cleanliness": 5,
        "location": 5,
        "amenities": 5,
        "service": 5,
        "value": 4,
        "accuracy": 5,
        "avgRating": 4.83,
        "comment": "Phòng sạch sẽ, view biển tuyệt vời...",
        "photos": [],
        "ownerReply": null,
        "ownerReplyAt": null,
        "createdAt": "2026-05-04T10:00:00Z"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 28
  }
}
```

### 3.3 `POST /properties/:id/reviews/:reviewId/reply` — Owner reply

**Auth**: Bearer token, OWNER của property hoặc ADMIN.

**Request**:
```json
{ "reply": "Cảm ơn bạn đã trải nghiệm! Hẹn gặp lại lần sau." }
```

**Response**: cập nhật `owner_reply` + `owner_reply_at`. 1 review chỉ reply
1 lần (subsequent calls override hoặc 409 — chốt với team UX).

### 3.4 `DELETE /admin/reviews/:reviewId` — ADMIN ẩn review

**Auth**: ADMIN only.

**Body**: `{ reason: "Nội dung không phù hợp" }`

→ Set `is_hidden = true` + lưu `hidden_reason`. KHÔNG xoá row (audit trail).

---

## 4. Endpoint extend — `GET /reports`

### 4.1 Đổi query params

**Trước**: `?month=&year=`
**Sau** (giữ legacy, thêm field mới):

```http
GET /reports?period=month&from=2026-05-01&to=2026-05-31
Authorization: Bearer <OWNER_TOKEN>
```

| Query | Values |
|---|---|
| `period` | `today \| week \| month \| year \| custom` |
| `from` | ISO date `YYYY-MM-DD` (chỉ dùng với `custom`) |
| `to` | ISO date `YYYY-MM-DD` (chỉ dùng với `custom`) |
| `month` | Legacy (1-12), tương đương `period=month` + month/year |
| `year` | Legacy (2024+), tương đương `period=year` |

Backend tự suy ra date range:
- `today` → 00:00 - 23:59 hôm nay
- `week` → từ T2 đầu tuần đến CN cuối tuần
- `month` → ngày 1 → ngày cuối tháng (theo `month`/`year` hoặc tháng hiện tại)
- `year` → 1/1 → 31/12 (theo `year` hoặc năm hiện tại)
- `custom` → bắt buộc `from` + `to`

### 4.2 Response shape mở rộng

Giữ tất cả field cũ (backward-compat), thêm 7 nhóm field mới:

```json
{
  "success": true,
  "data": {
    // ── Existing fields (giữ nguyên) ──
    "totalRooms": 12,
    "activeRooms": 10,
    "totalBookings": 42,
    "thisMonthBookings": 15,
    "holdCount": 8,
    "confirmedCount": 24,
    "cancelledCount": 2,
    "completedCount": 8,
    "totalDeposit": 35000000,
    "occupancyRate": 72,
    "roomsWithCover": 10,
    "roomsWithPrice": 12,
    "recentBookings": [...],

    // ── NEW: Currency-first KPIs ──
    "revenue": 102500000,        // VND, doanh thu thực (không phải chỉ deposit)
    "adr": 1500000,              // Average Daily Rate (revenue / room-nights sold)

    // ── NEW: Trend data (line chart) ──
    "revenueByDay": [
      { "date": "2026-05-01", "revenue": 2800000, "bookings": 2, "occupancy": 0.55 },
      { "date": "2026-05-02", "revenue": 4500000, "bookings": 4, "occupancy": 0.85 },
      ...
    ],

    // ── NEW: Top 5 phòng theo doanh thu ──
    "topRooms": [
      {
        "roomId": "uuid",
        "name": "Villa Sunset · 3 phòng ngủ",
        "coverImage": "https://res.cloudinary.com/.../cover.jpg",
        "revenue": 33200000,
        "bookings": 25,
        "occupancy": 0.85
      },
      ...
    ],

    // ── NEW: So sánh với kỳ trước ──
    "previousPeriod": {
      "revenue": 90200000,
      "bookings": 38,
      "occupancy": 67.7,
      "adr": 1425000
    },

    // ── NEW: Property ratings (aggregate per căn) ──
    "propertyRatings": [
      {
        "propertyId": "uuid",
        "propertyName": "Villa Sunset · 3 phòng ngủ",
        "coverImage": "https://...",
        "avgRating": 4.9,
        "totalReviews": 28,
        "distribution": { "5": 17, "4": 7, "3": 3, "2": 1, "1": 0 },
        "breakdown": {
          "cleanliness": 5.0,
          "location": 4.95,
          "amenities": 4.8,
          "service": 5.0,
          "value": 4.85,
          "accuracy": 4.9
        }
      },
      ...
    ],

    // ── NEW: Recent reviews preview (5 items mới nhất) ──
    "recentReviews": [
      {
        "id": "uuid",
        "propertyId": "uuid",
        "propertyName": "Villa Sunset",
        "customerName": "Nguyễn Minh Anh",
        "customerAvatar": "https://...",
        "rating": 5,                // = avgRating
        "comment": "Phòng sạch sẽ...",
        "createdAt": "2026-05-04T10:00:00Z",
        "photos": []
      },
      ...
    ],

    // ── NEW: Length of stay histogram ──
    "lengthOfStay": {
      "oneNight": 19,
      "twoToThree": 14,
      "fourToSeven": 6,
      "eightPlus": 3
    },

    // ── NEW: Day-of-week occupancy ──
    "dayOfWeekOccupancy": {
      "values": [0.45, 0.50, 0.55, 0.60, 0.85, 0.92, 0.78]
      // index 0=T2, 6=CN. Value 0..1
    }
  }
}
```

---

## 5. SQL queries gợi ý cho backend

### 5.1 `revenue` — doanh thu trong period

```sql
SELECT COALESCE(SUM(b.total_price), 0) AS revenue
FROM bookings b
JOIN properties p ON b.property_id = p.id
WHERE p.owner_id = $owner_id
  AND b.status IN ('confirmed', 'completed')
  AND b.checkin_date >= $from
  AND b.checkin_date < $to;
```

### 5.2 `adr` — Average Daily Rate

```sql
WITH stats AS (
  SELECT
    SUM(b.total_price) AS revenue,
    SUM((b.checkout_date - b.checkin_date)) AS room_nights
  FROM bookings b
  JOIN properties p ON b.property_id = p.id
  WHERE p.owner_id = $owner_id
    AND b.status IN ('confirmed', 'completed')
    AND b.checkin_date >= $from AND b.checkin_date < $to
)
SELECT CASE WHEN room_nights > 0 THEN revenue / room_nights ELSE 0 END AS adr
FROM stats;
```

### 5.3 `revenueByDay` — trend chart 30 ngày

```sql
SELECT
  d::date AS date,
  COALESCE(SUM(b.total_price), 0) AS revenue,
  COUNT(b.id) AS bookings,
  -- occupancy = room-nights sold / total room-nights available trên ngày đó
  CASE WHEN active_rooms > 0
    THEN COUNT(b.id)::float / active_rooms ELSE 0
  END AS occupancy
FROM generate_series($from::date, $to::date, '1 day') AS d
LEFT JOIN bookings b
  ON b.checkin_date <= d AND b.checkout_date > d
  AND b.status IN ('confirmed', 'completed')
  AND b.property_id IN (SELECT id FROM properties WHERE owner_id = $owner_id)
CROSS JOIN (
  SELECT COUNT(*) AS active_rooms
  FROM properties WHERE owner_id = $owner_id AND is_active = true
) AS r
GROUP BY d::date, active_rooms
ORDER BY d::date;
```

### 5.4 `topRooms` — top 5 phòng

```sql
SELECT
  p.id AS room_id,
  p.name,
  p.cover_image,
  COALESCE(SUM(b.total_price), 0) AS revenue,
  COUNT(b.id) AS bookings,
  CASE WHEN $period_days > 0
    THEN SUM(b.checkout_date - b.checkin_date)::float / $period_days
    ELSE 0
  END AS occupancy
FROM properties p
LEFT JOIN bookings b
  ON b.property_id = p.id
  AND b.status IN ('confirmed', 'completed')
  AND b.checkin_date >= $from AND b.checkin_date < $to
WHERE p.owner_id = $owner_id
GROUP BY p.id, p.name, p.cover_image
ORDER BY revenue DESC
LIMIT 5;
```

### 5.5 `previousPeriod` — kỳ trước cùng độ dài

```js
// Pseudo-code: tính range kỳ trước
const periodLength = to.diff(from, 'days');
const prevTo = from;
const prevFrom = from.subtract(periodLength, 'days');
// Run 5.1, 5.2 với prevFrom/prevTo
```

### 5.6 `propertyRatings` — aggregate từ materialized view

```sql
SELECT
  p.id AS property_id,
  p.name AS property_name,
  p.cover_image,
  agg.avg_rating,
  agg.total_reviews,
  jsonb_build_object(
    '5', agg.count_5_star,
    '4', agg.count_4_star,
    '3', agg.count_3_star,
    '2', agg.count_2_star,
    '1', agg.count_1_star
  ) AS distribution,
  jsonb_build_object(
    'cleanliness', agg.avg_cleanliness,
    'location', agg.avg_location,
    'amenities', agg.avg_amenities,
    'service', agg.avg_service,
    'value', agg.avg_value,
    'accuracy', agg.avg_accuracy
  ) AS breakdown
FROM properties p
LEFT JOIN property_rating_aggregates agg ON agg.property_id = p.id
WHERE p.owner_id = $owner_id
  AND agg.total_reviews > 0
ORDER BY agg.avg_rating DESC;
```

### 5.7 `recentReviews` — 5 review mới nhất tất cả căn của owner

```sql
SELECT
  r.id, r.property_id, p.name AS property_name,
  u.name AS customer_name, u.avatar AS customer_avatar,
  r.avg_rating AS rating, r.comment, r.photos, r.created_at
FROM property_reviews r
JOIN properties p ON p.id = r.property_id
JOIN users u ON u.id = r.customer_id
WHERE p.owner_id = $owner_id
  AND r.is_hidden = false
ORDER BY r.created_at DESC
LIMIT 5;
```

### 5.8 `lengthOfStay` — histogram

```sql
SELECT
  COUNT(*) FILTER (WHERE nights = 1) AS one_night,
  COUNT(*) FILTER (WHERE nights BETWEEN 2 AND 3) AS two_to_three,
  COUNT(*) FILTER (WHERE nights BETWEEN 4 AND 7) AS four_to_seven,
  COUNT(*) FILTER (WHERE nights >= 8) AS eight_plus
FROM (
  SELECT (checkout_date - checkin_date) AS nights
  FROM bookings b
  JOIN properties p ON b.property_id = p.id
  WHERE p.owner_id = $owner_id
    AND b.status IN ('confirmed', 'completed')
    AND b.checkin_date >= $from AND b.checkin_date < $to
) AS t;
```

### 5.9 `dayOfWeekOccupancy` — 7 ngày trong tuần

```sql
WITH active_rooms AS (
  SELECT COUNT(*) AS n FROM properties
  WHERE owner_id = $owner_id AND is_active = true
)
SELECT
  EXTRACT(ISODOW FROM d)::int - 1 AS dow_index,  -- 0=T2, 6=CN
  CASE WHEN n > 0
    THEN COUNT(b.id)::float / NULLIF(n * COUNT(DISTINCT d), 0)
    ELSE 0
  END AS occupancy
FROM generate_series($from::date, $to::date, '1 day') AS d
LEFT JOIN bookings b
  ON b.checkin_date <= d AND b.checkout_date > d
  AND b.status IN ('confirmed', 'completed')
  AND b.property_id IN (SELECT id FROM properties WHERE owner_id = $owner_id)
CROSS JOIN active_rooms
GROUP BY dow_index, n
ORDER BY dow_index;
```

→ Frontend nhận `values: [<7 numbers>]`. Backend ensure đủ 7 phần tử (fill 0
nếu không có data ngày nào).

---

## 6. Test cases

### 6.1 Reviews

- [ ] Khách chưa book → POST review → 403 `not_your_booking`
- [ ] Booking status `hold` → POST review → 400 `booking_not_completed`
- [ ] Booking đã review → POST review lần 2 → 409 `already_reviewed`
- [ ] Score 0 hoặc 6 → 400 `invalid_score`
- [ ] Score thiếu 1 trong 6 → 400 `missing_score`
- [ ] Owner POST `/reply` → cập nhật + push FCM khách
- [ ] ADMIN DELETE review → `is_hidden = true`, list không hiển thị

### 6.2 Reports — period filter

- [ ] `?period=today` → `from = today 00:00, to = today 23:59`
- [ ] `?period=week` → từ T2 đầu tuần
- [ ] `?period=month` → ngày 1 → cuối tháng hiện tại
- [ ] `?period=year` → 1/1 → 31/12 năm hiện tại
- [ ] `?period=custom&from=2026-04-01&to=2026-04-30` → range tự định nghĩa
- [ ] `?period=custom` thiếu `from`/`to` → 400 `missing_date_range`
- [ ] `?from > to` → 400 `invalid_date_range`

### 6.3 Reports — `revenue`/`adr` correctness

- [ ] 1 property + 5 booking confirmed (mỗi cái 2 đêm × 1tr) → revenue = 10tr,
  adr = 10tr/10 đêm = 1tr
- [ ] Booking `cancelled` không tính → revenue đúng
- [ ] Booking nằm 1 nửa trong period → tính phần trong period (advanced)
  hoặc tính theo `checkin_date` trong period (đơn giản)

### 6.4 Reports — `previousPeriod`

- [ ] `period=month` Tháng 5/2026 → `previousPeriod` là 4/2026
- [ ] `period=custom` 1/4 → 30/4 → `previousPeriod` 1/3 → 31/3 (cùng độ dài)

### 6.5 Reports — ratings aggregation

- [ ] Owner có 3 căn, mỗi căn 5 review → response `propertyRatings.length = 3`
- [ ] Căn không có review → KHÔNG nằm trong `propertyRatings`
  (frontend cần filter `totalReviews > 0`, hoặc backend filter sẵn)
- [ ] `breakdown` per căn = AVG 6 score thật, KHÔNG tính review hidden
- [ ] Owner profile rating tổng = weighted avg theo review count (frontend
  tự tính từ array)

---

## 7. Migration & rollout

1. `CREATE TABLE property_reviews` + indexes (Section 2)
2. `CREATE MATERIALIZED VIEW property_rating_aggregates`
3. Trigger refresh aggregate khi review mới (option A: pg_trigger,
   option B: scheduled cron 5 phút, option C: refresh on POST review)
4. Add 3 endpoint reviews (Section 3.1-3.3)
5. Extend `GET /reports` với 7 nhóm field mới (Section 4.2)
6. Optional: backfill review giả (5-10 review per property) cho production demo
7. Add admin endpoint DELETE review (Section 3.4)

Frontend không cần đổi gì — `ReportData.fromJson` đã handle backend chưa
trả field mới (fallback mock). Khi backend trả real data, mock không kích
hoạt → real data render tự nhiên.

---

## 8. PROMPT cho AI implement backend

```
Bạn là backend engineer làm việc trên repo Halong24h API (Node/Express +
Postgres, base URL http://103.183.118.148:3000). Implement extended reports
+ reviews theo spec dưới.

YÊU CẦU:

1. MIGRATION
   - CREATE TABLE property_reviews (id, property_id FK, booking_id FK UNIQUE,
     customer_id FK, 6 score (cleanliness/location/amenities/service/value/
     accuracy) CHECK BETWEEN 1 AND 5, avg_rating GENERATED, comment, photos
     JSONB, owner_reply, owner_reply_at, is_hidden, hidden_reason, created_at,
     updated_at)
   - Index: property_id, customer_id, partial visible+recent
   - CREATE MATERIALIZED VIEW property_rating_aggregates (avg + 6 chiều avg +
     distribution count theo sao, group by property_id)

2. ENDPOINTS REVIEWS
   - POST /properties/:id/reviews — CUSTOMER role; validate booking thuộc
     customer + status=completed + UNIQUE booking_id; trả review id +
     avgRating; refresh materialized view + push FCM owner
   - GET /properties/:id/reviews — public; query page/pageSize/sort/
     minRating; response { summary{avgRating, totalReviews, distribution,
     breakdown}, items[], page, pageSize, total }
   - POST /properties/:id/reviews/:reviewId/reply — OWNER role (chỉ owner
     của property); cập nhật owner_reply + owner_reply_at
   - DELETE /admin/reviews/:reviewId — ADMIN role; set is_hidden=true +
     hidden_reason

3. EXTEND GET /reports
   - Query: period (today|week|month|year|custom) + from/to (ISO date,
     bắt buộc khi custom)
   - Backward-compat: month/year vẫn hoạt động (tương đương period=month)
   - Auto-derive date range theo period
   - Response thêm 7 nhóm field mới (KHÔNG đổi field cũ):
     * revenue (int VND, doanh thu thực không chỉ deposit)
     * adr (int VND, revenue / room-nights sold)
     * revenueByDay (array { date, revenue, bookings, occupancy })
     * topRooms (top 5, mỗi item { roomId, name, coverImage, revenue,
       bookings, occupancy })
     * previousPeriod ({ revenue, bookings, occupancy, adr })
     * propertyRatings (array { propertyId, propertyName, coverImage,
       avgRating, totalReviews, distribution{5,4,3,2,1}, breakdown{6 chiều} })
     * recentReviews (array, 5 newest, { id, propertyId, propertyName,
       customerName, customerAvatar, rating, comment, photos, createdAt })
     * lengthOfStay ({ oneNight, twoToThree, fourToSeven, eightPlus })
     * dayOfWeekOccupancy ({ values: [<7 number>] }, index 0=T2, 6=CN)
   - SQL queries gợi ý xem section 5 spec

4. SCOPE THEO OWNER
   - Tất cả query trong /reports phải filter `WHERE owner_id =
     req.effectiveOwnerId` (xem `api-staff-owner-scope-spec.md`)
   - SALE chưa gán → 403 staff_unassigned (middleware đã có)

5. ERROR CODES
   - 400 invalid_score / missing_score / booking_not_completed /
     missing_date_range / invalid_date_range
   - 403 not_your_booking / forbidden
   - 409 already_reviewed
   - 404 review_not_found / property_not_found

6. PERFORMANCE
   - Materialized view refresh CONCURRENTLY (không block read)
   - Trigger sau INSERT review: NOTIFY refresh_review_agg → worker pick up
   - HOẶC simpler: refresh inline sau POST review (acceptable nếu < 100k review)

7. TEST
   Viết integration test 4 nhóm (xem section 6 spec):
   - Reviews CRUD + eligibility
   - Period filter date range
   - Revenue/ADR correctness
   - Ratings aggregation per property + owner-scope

8. KHÔNG ĐƯỢC LÀM
   - Đổi format response chung của codebase
   - Đổi tên field cũ trong /reports (backward-compat)
   - Skip eligibility check khi POST review (chống spam fake review)
   - Public POST review (CUSTOMER role required)
   - Tính rating ở cấp Room — chỉ Property level

OUTPUT:
- Diff các file: routes, controllers, services, models, migrations
- Migration SQL files (table + materialized view + indexes)
- Test files (jest hoặc framework đang dùng)
- Update Swagger docs cho các endpoint mới
- Brief PR description tiếng Việt: tóm tắt thay đổi, dependencies (nếu cần
  cron/queue cho refresh), env var mới (nếu có)
```

---

## 9. Frontend follow-up sau khi backend xong

- [ ] Sau khi backend deploy: test thử mở `/reports` screen → xem real data
  có render đúng không (fields mock sẽ không kích hoạt nữa)
- [ ] Nếu backend trả `propertyRatings: []` rỗng (chưa có review nào trong
  hệ thống) → UI tự fallback empty state "Chưa có đánh giá" (đã có sẵn
  trong `PropertyRatingsSection`)
- [ ] Tạo screen mới `lib/features/reviews/views/property_reviews_screen.dart`
  để khách xem full reviews list (Section 3.2 GET) — cho khách book → search
  → tap room → "Xem 28 đánh giá"
- [ ] Tạo screen `lib/features/reviews/views/write_review_screen.dart` cho
  customer post review sau check-out (Section 3.1 POST) — entry point từ
  `/my-bookings` → completed booking → button "Viết đánh giá"
- [ ] Owner reply review: thêm modal trong owner ratings detail screen
- [ ] Optional: notification screen show "Bạn nhận review mới" khi backend
  push FCM
