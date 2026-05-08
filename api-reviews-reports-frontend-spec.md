# API Spec cho App — Reviews + Extended Reports

> **Ngay**: 2026-05-08
> **Audience**: Flutter dev (mobile app)
> **Backend**: Da deploy, base URL `http://103.183.118.148:3000/api/v1`
> **Swagger**: `http://103.183.118.148:3000/api`

---

## 1. Tong quan thay doi

Backend da implement xong 2 nhom tinh nang:

### A. Reviews (Danh gia khach)
- Rating o cap **Property** (can), KHONG phai Room
- Moi review gom **6 tieu chi** (1-5 sao): cleanliness, location, amenities, service, value, accuracy
- Overall rating = trung binh 6 tieu chi
- 1 booking chi review duoc 1 lan (sau khi completed)

### B. Extended Reports (`GET /reports`)
- Them **period filter** (today/week/month/year/custom)
- Them **9 nhom field moi** (giu nguyen field cu, backward-compat)
- Them **ratingSummary** — tong hop owner-level (weighted avg tat ca can)

---

## 2. Endpoints Reviews

### 2.1 `POST /properties/:id/reviews` — Khach tao review

**Auth**: Bearer token, role CUSTOMER.

**Dieu kien**:
- Co booking da `completed` (status=3) cho property nay
- Chua review booking do (1 booking = 1 review)

**Request**:
```http
POST /properties/{propertyId}/reviews
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
  "comment": "Phong sach se, view bien tuyet voi...",
  "photos": ["https://res.cloudinary.com/.../photo1.jpg"]
}
```

| Field | Type | Required | Validate |
|-------|------|----------|----------|
| bookingId | UUID | Yes | Booking thuoc customer, status=3 (COMPLETED) |
| cleanliness | int | Yes | 1-5 |
| location | int | Yes | 1-5 |
| amenities | int | Yes | 1-5 |
| service | int | Yes | 1-5 |
| value | int | Yes | 1-5 |
| accuracy | int | Yes | 1-5 |
| comment | string | No | Text tu do |
| photos | string[] | No | Array URL anh |

**Response 201**:
```json
{
  "success": true,
  "message": "Danh gia da duoc gui",
  "data": {
    "id": "review-uuid",
    "propertyId": "property-uuid",
    "avgRating": 4.67,
    "createdAt": "2026-05-08T10:00:00.000Z"
  }
}
```

**Errors**:
| Status | Message | Khi nao |
|--------|---------|---------|
| 400 | booking_not_completed | Booking chua completed |
| 400 | Validation error | Score ngoai 1-5, thieu field |
| 403 | not_your_booking | Booking khong phai cua customer nay |
| 404 | property_not_found | Property khong ton tai |
| 409 | already_reviewed | Booking da review roi |

**Entry point trong app**: `/my-bookings` -> booking completed -> button "Viet danh gia"

---

### 2.2 `GET /properties/:id/reviews` — Xem reviews cua 1 property

**Auth**: Public (khong can token). Khach xem review truoc khi book.

**Request**:
```http
GET /properties/{propertyId}/reviews?page=1&pageSize=20&sort=newest&minRating=4
```

| Query | Default | Values |
|-------|---------|--------|
| page | 1 | int >= 1 |
| pageSize | 20 | int 1-50 |
| sort | newest | `newest` / `oldest` / `highest` / `lowest` |
| minRating | — | 1-5 (filter chi hien review >= X sao) |

**Response 200**:
```json
{
  "success": true,
  "message": "Lay danh sach danh gia thanh cong",
  "data": {
    "summary": {
      "avgRating": 4.7,
      "totalReviews": 28,
      "distribution": { "5": 17, "4": 6, "3": 3, "2": 2, "1": 0 },
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
          "name": "Nguyen Minh Anh",
          "avatar": null
        },
        "cleanliness": 5,
        "location": 5,
        "amenities": 5,
        "service": 5,
        "value": 4,
        "accuracy": 5,
        "avgRating": 4.83,
        "comment": "Phong sach se, view bien tuyet voi...",
        "photos": [],
        "ownerReply": "Cam on ban!",
        "ownerReplyAt": "2026-05-07T15:00:00.000Z",
        "createdAt": "2026-05-06T10:00:00.000Z"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 28
  }
}
```

**Luu y cho app**:
- `summary` luon tinh tren **tat ca** review visible cua property (khong bi anh huong boi minRating filter)
- `total` la so review match filter (dung cho pagination)
- `customer.avatar` hien tai tra `null` (chua co avatar trong User model)
- `distribution` key la string `"5"`, `"4"`, ... (JSON key luon la string)

**Entry point trong app**: Search -> tap property -> "Xem 28 danh gia"

---

### 2.3 `POST /properties/:id/reviews/:reviewId/reply` — Owner tra loi review

**Auth**: Bearer token, role OWNER (cua property do) hoac ADMIN.

**Request**:
```json
{ "reply": "Cam on ban da trai nghiem! Hen gap lai lan sau." }
```

**Response 200**:
```json
{ "success": true, "message": "Da tra loi danh gia", "data": null }
```

- Goi lai se **ghi de** reply cu (khong loi 409)
- Sau khi reply, `ownerReply` va `ownerReplyAt` se co gia tri trong GET reviews

---

### 2.4 `DELETE /admin/reviews/:reviewId` — Admin an review

**Auth**: Bearer token, role ADMIN.

**Request**:
```json
{ "reason": "Noi dung khong phu hop" }
```

**Response 200**:
```json
{ "success": true, "message": "Da an danh gia", "data": null }
```

- Khong xoa row, chi set `is_hidden = true`
- Review an se khong hien trong GET list va khong tinh vao aggregate

---

## 3. Extended Reports — `GET /reports`

### 3.1 Query params moi

```http
GET /reports?period=month&from=2026-05-01&to=2026-05-31
Authorization: Bearer <OWNER_TOKEN>
```

| Query | Values | Mo ta |
|-------|--------|-------|
| period | `today` / `week` / `month` / `year` / `custom` | Ky bao cao |
| from | `YYYY-MM-DD` | Bat buoc khi period=custom |
| to | `YYYY-MM-DD` | Bat buoc khi period=custom |
| month | 1-12 | **Legacy** — tuong duong period=month |
| year | 2024+ | **Legacy** — tuong duong period=year |

**Auto date range**:
- `today` -> 00:00 - 23:59 hom nay
- `week` -> T2 dau tuan -> CN cuoi tuan
- `month` -> ngay 1 -> cuoi thang hien tai
- `year` -> 1/1 -> 31/12 nam hien tai
- `custom` -> bat buoc `from` + `to`, loi 400 neu thieu
- Khong truyen gi -> mac dinh `month` (thang hien tai)

**Errors**:
| Status | Message | Khi nao |
|--------|---------|---------|
| 400 | missing_date_range | period=custom ma thieu from/to |
| 400 | invalid_date_range | from >= to |

---

### 3.2 Response shape day du

```json
{
  "success": true,
  "message": "Lay du lieu bao cao thanh cong",
  "data": {

    // ========== FIELD CU (giu nguyen, backward-compat) ==========
    "totalRooms": 12,
    "activeRooms": 10,
    "totalBookings": 42,
    "thisMonthBookings": 15,
    "holdCount": 8,
    "confirmedCount": 24,
    "cancelledCount": 2,
    "completedCount": 8,
    "totalDeposit": 35000000,
    "occupancyRate": 72.5,
    "roomsWithCover": 10,
    "roomsWithPrice": 12,
    "recentBookings": [],

    // ========== FIELD MOI ==========

    // --- 1. Currency KPIs ---
    "revenue": 102500000,
    "adr": 1500000,

    // --- 2. Revenue trend (line chart) ---
    "revenueByDay": [
      {
        "date": "2026-05-01",
        "revenue": 2800000,
        "bookings": 2,
        "occupancy": 0.55
      },
      {
        "date": "2026-05-02",
        "revenue": 4500000,
        "bookings": 4,
        "occupancy": 0.85
      }
    ],

    // --- 3. Top 5 property theo doanh thu ---
    "topRooms": [
      {
        "roomId": "property-uuid",
        "name": "Villa Sunset - 3 phong ngu",
        "coverImage": "https://res.cloudinary.com/.../cover.jpg",
        "revenue": 33200000,
        "bookings": 25,
        "occupancy": 0.85
      }
    ],

    // --- 4. So sanh ky truoc ---
    "previousPeriod": {
      "revenue": 90200000,
      "bookings": 38,
      "occupancy": 67.7,
      "adr": 1425000
    },

    // --- 5. TONG HOP DANH GIA OWNER (moi - weighted avg) ---
    "ratingSummary": {
      "avgRating": 4.58,
      "totalReviews": 15,
      "totalProperties": 3,
      "distribution": { "5": 8, "4": 4, "3": 2, "2": 1, "1": 0 },
      "breakdown": {
        "cleanliness": 4.75,
        "location": 4.5,
        "amenities": 4.25,
        "service": 4.75,
        "value": 4.5,
        "accuracy": 4.6
      }
    },

    // --- 6. DANH GIA THEO TUNG CAN ---
    "propertyRatings": [
      {
        "propertyId": "uuid-1",
        "propertyName": "Villa Sunset - 3PN",
        "coverImage": "https://...",
        "avgRating": 4.83,
        "totalReviews": 8,
        "distribution": { "5": 6, "4": 2, "3": 0, "2": 0, "1": 0 },
        "breakdown": {
          "cleanliness": 5.0,
          "location": 4.75,
          "amenities": 4.5,
          "service": 5.0,
          "value": 4.75,
          "accuracy": 5.0
        }
      },
      {
        "propertyId": "uuid-2",
        "propertyName": "Homestay Ocean View",
        "coverImage": "https://...",
        "avgRating": 4.2,
        "totalReviews": 5,
        "distribution": { "5": 1, "4": 2, "3": 2, "2": 0, "1": 0 },
        "breakdown": {
          "cleanliness": 4.4,
          "location": 4.2,
          "amenities": 4.0,
          "service": 4.4,
          "value": 4.0,
          "accuracy": 4.2
        }
      }
    ],

    // --- 7. 5 REVIEW GAN NHAT (tat ca can) ---
    "recentReviews": [
      {
        "id": "review-uuid",
        "propertyId": "uuid-1",
        "propertyName": "Villa Sunset - 3PN",
        "customerName": "Nguyen Minh Anh",
        "customerAvatar": null,
        "rating": 4.83,
        "comment": "Phong sach se, view bien tuyet voi...",
        "photos": [],
        "createdAt": "2026-05-07T10:00:00.000Z"
      }
    ],

    // --- 8. Length of stay histogram ---
    "lengthOfStay": {
      "oneNight": 19,
      "twoToThree": 14,
      "fourToSeven": 6,
      "eightPlus": 3
    },

    // --- 9. Day-of-week occupancy ---
    "dayOfWeekOccupancy": {
      "values": [0.45, 0.50, 0.55, 0.60, 0.85, 0.92, 0.78]
    }
  }
}
```

---

## 4. Cach hien thi Danh gia trong Report Screen

### 4.1 Cau truc 3 tang

```
+-------------------------------------------------------+
| TONG QUAN DANH GIA (ratingSummary)                     |
| ===================================================== |
| 4.58 / 5.0    15 danh gia    3 can                    |
|                                                        |
| ***** 8   ================================ 53%         |
| ****  4   ================  27%                        |
| ***   2   ========  13%                                |
| **    1   ====  7%                                     |
| *     0                                                |
|                                                        |
| Sach se   4.75  ==============================         |
| Vi tri    4.50  ============================           |
| Tien nghi 4.25  ==========================             |
| Dich vu   4.75  ==============================         |
| Gia tri   4.50  ============================           |
| Dung mo ta 4.60 =============================          |
+-------------------------------------------------------+

+-------------------------------------------------------+
| DANH GIA THEO CAN (propertyRatings[])                  |
| ===================================================== |
| [Anh cover] Villa Sunset - 3PN                         |
|             4.83 (8 danh gia)                          |
|             Sach se 5.0 | Vi tri 4.75 | ...            |
|                                                        |
| [Anh cover] Homestay Ocean View                        |
|             4.2 (5 danh gia)                           |
|             Sach se 4.4 | Vi tri 4.2 | ...             |
+-------------------------------------------------------+

+-------------------------------------------------------+
| DANH GIA GAN DAY (recentReviews[])                     |
| ===================================================== |
| Nguyen Minh Anh          4.83    Villa Sunset - 3PN    |
| "Phong sach se, view bien tuyet voi..."                |
| 07/05/2026                                             |
|                                                        |
| Tran Van B               4.2     Homestay Ocean View   |
| "Vi tri dep nhung tien nghi con thieu..."              |
| 05/05/2026                                             |
+-------------------------------------------------------+
```

### 4.2 Logic xu ly data

```dart
// ratingSummary co the rong (owner chua co review nao)
if (ratingSummary.totalReviews == 0) {
  // Hien empty state: "Chua co danh gia"
  return;
}

// Tinh % cho distribution bar
final total = ratingSummary.totalReviews;
final pct5 = (ratingSummary.distribution['5']! / total * 100).round();
final pct4 = (ratingSummary.distribution['4']! / total * 100).round();
// ...

// propertyRatings da sort theo avgRating DESC (can tot nhat len truoc)
// Chi hien can co review (backend da filter totalReviews > 0)

// recentReviews: moi review co propertyName -> hien ben canh ten khach
// rating la avgRating (so thap phan), KHONG phai so nguyen
```

### 4.3 Delta % so voi ky truoc (KPI cards)

```dart
// Tinh delta tu previousPeriod
final revenueDelta = previousPeriod.revenue > 0
    ? ((revenue - previousPeriod.revenue) / previousPeriod.revenue * 100).round()
    : 0;
// revenueDelta = +13% -> hien xanh, -5% -> hien do

final bookingsDelta = previousPeriod.bookings > 0
    ? ((thisMonthBookings - previousPeriod.bookings) / previousPeriod.bookings * 100).round()
    : 0;

final occupancyDelta = (occupancyRate - previousPeriod.occupancy).round();
// occupancyDelta = +4.8 (percentage point)

final adrDelta = previousPeriod.adr > 0
    ? ((adr - previousPeriod.adr) / previousPeriod.adr * 100).round()
    : 0;
```

---

## 5. Mo ta tung field moi trong Reports

| Field | Type | Mo ta |
|-------|------|-------|
| `revenue` | int (VND) | Tong doanh thu thuc (deposit) cua booking confirmed/completed trong period |
| `adr` | int (VND) | Average Daily Rate = revenue / tong so dem da ban |
| `revenueByDay` | array | Moi ngay trong period: `{ date, revenue, bookings, occupancy }`. Dung cho **line chart** |
| `revenueByDay[].occupancy` | float 0-1 | = so booking active ngay do / activeRooms |
| `topRooms` | array (max 5) | Top 5 property theo revenue. `{ roomId, name, coverImage, revenue, bookings, occupancy }` |
| `topRooms[].occupancy` | float 0-1 | = so dem ban / so ngay trong period |
| `previousPeriod` | object | Cung chi so nhung cua **ky truoc** (cung do dai). Dung de tinh delta % |
| `ratingSummary` | object | **TONG HOP OWNER**: weighted avg tat ca can theo so review |
| `ratingSummary.totalProperties` | int | So can co review (khong phai tong so can) |
| `ratingSummary.distribution` | object | Gop tat ca can: `{ "5": 8, "4": 4, ... }` |
| `ratingSummary.breakdown` | object | Weighted avg 6 tieu chi: `{ cleanliness, location, ... }` |
| `propertyRatings` | array | **TUNG CAN**: sort theo avgRating DESC. Chi hien can co review |
| `propertyRatings[].distribution` | object | Per-property: `{ "5": 6, "4": 2, ... }` |
| `propertyRatings[].breakdown` | object | Per-property avg 6 tieu chi |
| `recentReviews` | array (max 5) | 5 review moi nhat cua **tat ca can** cua owner |
| `recentReviews[].propertyName` | string | **TEN CAN** de app hien ben canh ten khach |
| `recentReviews[].rating` | float | avgRating cua review do (vd: 4.83) |
| `lengthOfStay` | object | Histogram: `{ oneNight, twoToThree, fourToSeven, eightPlus }` |
| `dayOfWeekOccupancy` | object | `{ values: [7 so] }` — index 0=T2, 6=CN, gia tri 0.0-1.0 |

---

## 6. Model Dart goi y

### 6.1 RatingSummary

```dart
class RatingSummary {
  final double avgRating;
  final int totalReviews;
  final int totalProperties;
  final Map<String, int> distribution; // {"5": 8, "4": 4, ...}
  final RatingBreakdown breakdown;

  bool get isEmpty => totalReviews == 0;

  factory RatingSummary.fromJson(Map<String, dynamic>? json) {
    if (json == null) return RatingSummary.empty();
    return RatingSummary(
      avgRating: (json['avgRating'] as num).toDouble(),
      totalReviews: json['totalReviews'] as int,
      totalProperties: json['totalProperties'] as int,
      distribution: Map<String, int>.from(json['distribution']),
      breakdown: RatingBreakdown.fromJson(json['breakdown']),
    );
  }
}
```

### 6.2 PropertyRating

```dart
class PropertyRating {
  final String propertyId;
  final String propertyName;
  final String? coverImage;
  final double avgRating;
  final int totalReviews;
  final Map<String, int> distribution;
  final RatingBreakdown breakdown;

  factory PropertyRating.fromJson(Map<String, dynamic> json) {
    return PropertyRating(
      propertyId: json['propertyId'],
      propertyName: json['propertyName'],
      coverImage: json['coverImage'],
      avgRating: (json['avgRating'] as num).toDouble(),
      totalReviews: json['totalReviews'] as int,
      distribution: Map<String, int>.from(json['distribution']),
      breakdown: RatingBreakdown.fromJson(json['breakdown']),
    );
  }
}
```

### 6.3 RatingBreakdown (dung chung)

```dart
class RatingBreakdown {
  final double cleanliness;
  final double location;
  final double amenities;
  final double service;
  final double value;
  final double accuracy;

  List<MapEntry<String, double>> get entries => [
    MapEntry('Sach se', cleanliness),
    MapEntry('Vi tri', location),
    MapEntry('Tien nghi', amenities),
    MapEntry('Dich vu', service),
    MapEntry('Gia tri', value),
    MapEntry('Dung mo ta', accuracy),
  ];

  factory RatingBreakdown.fromJson(Map<String, dynamic> json) {
    return RatingBreakdown(
      cleanliness: (json['cleanliness'] as num).toDouble(),
      location: (json['location'] as num).toDouble(),
      amenities: (json['amenities'] as num).toDouble(),
      service: (json['service'] as num).toDouble(),
      value: (json['value'] as num).toDouble(),
      accuracy: (json['accuracy'] as num).toDouble(),
    );
  }
}
```

### 6.4 RecentReview

```dart
class RecentReview {
  final String id;
  final String propertyId;
  final String propertyName;  // << QUAN TRONG: ten can
  final String customerName;
  final String? customerAvatar;
  final double rating;         // avgRating, vd 4.83
  final String? comment;
  final List<String> photos;
  final DateTime createdAt;

  factory RecentReview.fromJson(Map<String, dynamic> json) {
    return RecentReview(
      id: json['id'],
      propertyId: json['propertyId'],
      propertyName: json['propertyName'],
      customerName: json['customerName'],
      customerAvatar: json['customerAvatar'],
      rating: (json['rating'] as num).toDouble(),
      comment: json['comment'],
      photos: List<String>.from(json['photos'] ?? []),
      createdAt: DateTime.parse(json['createdAt']),
    );
  }
}
```

---

## 7. Fallback khi chua co data

| Field | Khi rong | App xu ly |
|-------|----------|-----------|
| `ratingSummary.totalReviews == 0` | Owner chua co review nao | Hien "Chua co danh gia nao" |
| `propertyRatings` la `[]` | Khong can nao co review | An section "Danh gia theo can" |
| `recentReviews` la `[]` | Chua co review | An section "Danh gia gan day" |
| `revenueByDay` la `[]` | Period khong co booking | Line chart hien duong bang 0 |
| `topRooms` la `[]` | Khong co property | An section top rooms |
| `previousPeriod.revenue == 0` | Ky truoc khong co data | Delta hien "—" thay vi % |
| `lengthOfStay` tat ca = 0 | Khong co booking | Histogram hien empty |
| `dayOfWeekOccupancy.values` tat ca = 0 | Khong co booking | Heatmap hien mau nhat nhat |

---

## 8. Vi du kich ban thuc te

### Owner co 3 can, 4 khach review cho 3 can khac nhau

```
Khach A review Villa Sunset:       5/5/4/5/4/5 -> avg 4.67
Khach B review Villa Sunset:       5/5/5/5/5/5 -> avg 5.00
Khach C review Homestay Ocean:     4/4/3/4/4/4 -> avg 3.83
Khach D review Khach san Bai Chay: 4/3/4/4/3/4 -> avg 3.67
```

**ratingSummary** (weighted avg):
```json
{
  "avgRating": 4.29,    // (4.67 + 5.00 + 3.83 + 3.67) / 4
  "totalReviews": 4,
  "totalProperties": 3,
  "distribution": { "5": 1, "4": 1, "3": 2, "2": 0, "1": 0 },
  "breakdown": {
    "cleanliness": 4.5,  // (5+5+4+4)/4
    "location": 4.25,    // (5+5+4+3)/4
    "amenities": 4.0,    // (4+5+3+4)/4
    "service": 4.5,      // (5+5+4+4)/4
    "value": 4.0,        // (4+5+4+3)/4
    "accuracy": 4.5      // (5+5+4+4)/4
  }
}
```

**propertyRatings** (sort theo avgRating DESC):
```json
[
  {
    "propertyName": "Villa Sunset",
    "avgRating": 4.84,     // (4.67+5.00)/2
    "totalReviews": 2,
    "distribution": { "5": 1, "4": 1, ... }
  },
  {
    "propertyName": "Homestay Ocean",
    "avgRating": 3.83,
    "totalReviews": 1,
    ...
  },
  {
    "propertyName": "Khach san Bai Chay",
    "avgRating": 3.67,
    "totalReviews": 1,
    ...
  }
]
```

**recentReviews** (sort theo createdAt DESC):
```json
[
  { "customerName": "Khach D", "propertyName": "Khach san Bai Chay", "rating": 3.67 },
  { "customerName": "Khach C", "propertyName": "Homestay Ocean", "rating": 3.83 },
  { "customerName": "Khach B", "propertyName": "Villa Sunset", "rating": 5.00 },
  { "customerName": "Khach A", "propertyName": "Villa Sunset", "rating": 4.67 }
]
```

-> App hien: **moi review deu co ten can ben canh**, owner nhin la biet review nao thuoc can nao.

---

## 9. Screens can tao/cap nhat

| # | Screen | Mo ta | Endpoint |
|---|--------|-------|----------|
| 1 | Report screen - Rating section | Hien ratingSummary (tong quan) + propertyRatings (tung can) + recentReviews | `GET /reports` |
| 2 | Property reviews full list | Khach xem tat ca review cua 1 can (phan trang, sort, filter) | `GET /properties/:id/reviews` |
| 3 | Write review screen | Khach viet review sau checkout | `POST /properties/:id/reviews` |
| 4 | Owner reply modal | Owner tra loi review | `POST /properties/:id/reviews/:reviewId/reply` |

---

## 10. Checklist test

- [ ] `GET /reports` khong truyen gi -> mac dinh thang hien tai, co du 9 field moi
- [ ] `GET /reports?period=today` -> revenueByDay chi 1 item
- [ ] `GET /reports?period=custom&from=2026-04-01&to=2026-04-30` -> custom range
- [ ] `GET /reports?period=custom` thieu from/to -> 400
- [ ] `GET /reports?month=4&year=2026` -> legacy van hoat dong
- [ ] Owner chua co review -> ratingSummary.totalReviews = 0, propertyRatings = []
- [ ] Customer POST review voi booking chua completed -> 400
- [ ] Customer POST review 2 lan cung booking -> 409
- [ ] GET reviews public (khong token) -> 200
- [ ] Owner reply review -> ownerReply hien trong GET reviews
- [ ] Admin hide review -> review mat khoi list, aggregate cap nhat
