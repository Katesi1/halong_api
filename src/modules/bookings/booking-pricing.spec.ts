import { computeBookingPricing, applyRoomMarkup } from './booking-pricing';

/** Dựng Date tại 00:00Z của ngày lịch (khớp cách BE lưu checkin/checkout). */
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Giá mẫu: thường 1tr · cuối tuần 1tr2 · lễ 1tr4; phụ thu NL 200k, TE 100k; chuẩn 2NL + 1TE.
const BASE = {
  weekdayPrice: 1_000_000,
  weekendPrice: 1_200_000,
  holidayPrice: 1_400_000,
  adultSurcharge: 200_000,
  childSurcharge: 100_000,
  standardGuests: 2,
  standardChildren: 1,
};

// Mốc ngày 2026 (2026-01-01 = Thứ 5):
//   09 T6 · 10 T7 · 11 CN · 12 T2 · 13 T3 · 14 T4   (không trùng lễ)
//   29/04 T4 · 30/04 T5 (lễ) · 01/05 T6 (lễ) · 02/05 T7
describe('computeBookingPricing — quy tắc Chủ nhật (2026-07-19)', () => {
  it('CN→T3: Chủ nhật là đêm đầu → cả 2 đêm tính giá ngày thường', () => {
    const { totalAmount, breakdown } = computeBookingPricing({
      checkin: utc('2026-01-11'), // CN
      checkout: utc('2026-01-13'), // T3
      adults: 2,
      children: 1,
      pricing: BASE,
    });
    expect(breakdown!.lineItems.map((l) => l.type)).toEqual(['weekday', 'weekday']);
    expect(breakdown!.roomTotal).toBe(2_000_000);
    expect(totalAmount).toBe(2_000_000);
  });

  it('check-in Chủ nhật 1 đêm (CN→T2): tính giá ngày thường', () => {
    const { breakdown } = computeBookingPricing({
      checkin: utc('2026-01-11'), // CN
      checkout: utc('2026-01-12'), // T2
      adults: 2,
      children: 1,
      pricing: BASE,
    });
    expect(breakdown!.lineItems.map((l) => l.type)).toEqual(['weekday']);
    expect(breakdown!.roomTotal).toBe(1_000_000);
  });

  it('T7→T2: T7 + CN đều cuối tuần (CN liền sau T7)', () => {
    const { breakdown } = computeBookingPricing({
      checkin: utc('2026-01-10'), // T7
      checkout: utc('2026-01-12'), // T2
      adults: 2,
      children: 1,
      pricing: BASE,
    });
    expect(breakdown!.lineItems.map((l) => l.type)).toEqual(['weekend', 'weekend']);
    expect(breakdown!.roomTotal).toBe(2_400_000);
  });

  it('T6→T2: cả 3 đêm (T6, T7, CN) đều cuối tuần', () => {
    const { breakdown } = computeBookingPricing({
      checkin: utc('2026-01-09'), // T6
      checkout: utc('2026-01-12'), // T2
      adults: 2,
      children: 1,
      pricing: BASE,
    });
    expect(breakdown!.lineItems.map((l) => l.type)).toEqual(['weekend', 'weekend', 'weekend']);
    expect(breakdown!.roomTotal).toBe(3_600_000);
  });
});

describe('computeBookingPricing — ngày lễ ưu tiên hơn cuối tuần', () => {
  it('30/4 (T5) & 1/5 (T6) đều tính giá lễ, kể cả 1/5 rơi vào T6', () => {
    const { breakdown } = computeBookingPricing({
      checkin: utc('2026-04-29'), // T4
      checkout: utc('2026-05-02'), // T7
      adults: 2,
      children: 1,
      pricing: BASE,
    });
    expect(breakdown!.lineItems.map((l) => l.type)).toEqual(['weekday', 'holiday', 'holiday']);
    expect(breakdown!.roomTotal).toBe(1_000_000 + 1_400_000 + 1_400_000);
  });
});

describe('applyRoomMarkup — cộng markup giá phòng, làm tròn 1.000đ', () => {
  it('markup 0 → giữ nguyên', () => {
    expect(applyRoomMarkup(1_000_000, 0)).toBe(1_000_000);
  });
  it('markup 10% trên 1tr → 1tr1', () => {
    expect(applyRoomMarkup(1_000_000, 10)).toBe(1_100_000);
  });
  it('làm tròn về bội số 1.000đ', () => {
    expect(applyRoomMarkup(1_050_000, 10)).toBe(1_155_000);
  });
});

describe('computeBookingPricing — markup web khách (chỉ giá phòng, không áp phụ thu)', () => {
  it('2 đêm thường +10%: giá phòng ×1.1, phụ thu giữ gốc', () => {
    const { totalAmount, breakdown } = computeBookingPricing({
      checkin: utc('2026-01-12'), // T2
      checkout: utc('2026-01-14'), // T4 → 2 đêm thường
      adults: 3, // vượt 1 người lớn → phụ thu 200k/đêm
      children: 1,
      pricing: BASE,
      roomMarkupPercent: 10,
    });
    // Giá phòng: 2 × 1.100.000 = 2.200.000 (đã markup). Phụ thu: 200.000 × 2 = 400.000 (KHÔNG markup).
    expect(breakdown!.lineItems.map((l) => l.amount)).toEqual([1_100_000, 1_100_000]);
    expect(breakdown!.roomTotal).toBe(2_200_000);
    expect(breakdown!.surchargeTotal).toBe(400_000);
    expect(totalAmount).toBe(2_600_000);
  });

  it('không truyền markup → giá gốc (tương thích ngược)', () => {
    const { totalAmount } = computeBookingPricing({
      checkin: utc('2026-01-12'),
      checkout: utc('2026-01-14'),
      adults: 2,
      children: 1,
      pricing: BASE,
    });
    expect(totalAmount).toBe(2_000_000);
  });
});

describe('computeBookingPricing — phụ thu theo cấu hình owner', () => {
  it('vượt số người lớn → cộng phụ thu adultSurcharge × số đêm', () => {
    const { totalAmount, breakdown } = computeBookingPricing({
      checkin: utc('2026-01-12'), // T2
      checkout: utc('2026-01-14'), // T4 → 2 đêm thường
      adults: 3, // vượt 1 người lớn (chuẩn 2)
      children: 1, // không vượt trẻ em (chuẩn 1)
      pricing: BASE,
    });
    expect(breakdown!.extraAdults).toBe(1);
    expect(breakdown!.extraChildren).toBe(0);
    expect(breakdown!.surchargePerNight).toBe(200_000);
    expect(breakdown!.surchargeTotal).toBe(400_000);
    expect(totalAmount).toBe(2_400_000);
  });
});
