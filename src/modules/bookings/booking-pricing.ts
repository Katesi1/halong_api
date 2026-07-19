// Tính totalAmount + breakdown cho booking từ bảng giá phòng.
// Công thức chốt (2026-07-09):
//   nightly(d) = holidayPrice nếu d là ngày lễ
//              = weekendPrice (fallback weekdayPrice) nếu dow(d) ∈ {0=CN, 5=T6, 6=T7}
//              = weekdayPrice ngược lại
//   extraAdults   = max(0, adults   − standardGuests)
//   extraChildren = max(0, children − standardChildren)
//   surchargePerNight = extraAdults × adultSurcharge + extraChildren × childSurcharge
//   totalAmount = Σ nightly(d) + surchargePerNight × nights
//
// Quy ước: field giá null → coi như 0 khi cộng phụ thu. NHƯNG nếu weekdayPrice null
// ⟹ property chưa cấu hình giá ⟹ trả totalAmount=null (không bịa 0).

export interface PropertyPricing {
  weekdayPrice: number | null;
  weekendPrice: number | null;
  holidayPrice: number | null;
  adultSurcharge: number | null;
  childSurcharge: number | null;
  standardGuests: number | null;
  standardChildren: number | null;
}

export type NightType = 'weekday' | 'weekend' | 'holiday';

export interface PriceLineItem {
  date: string; // YYYY-MM-DD
  type: NightType;
  amount: number;
}

export interface PriceBreakdown {
  nights: number;
  lineItems: PriceLineItem[];
  extraAdults: number;
  extraChildren: number;
  surchargePerNight: number;
  surchargeTotal: number;
  roomTotal: number; // tổng tiền phòng (chưa phụ thu)
  total: number; // roomTotal + surchargeTotal
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ngày lễ VN CỐ ĐỊNH theo dương lịch — lặp lại hằng năm (khớp 'MM-DD').
 * Nguồn: Bộ luật Lao động — các ngày nghỉ lễ dương lịch:
 *   01/01 Tết Dương lịch · 30/04 Giải phóng miền Nam · 01/05 Quốc tế Lao động · 02/09 Quốc khánh.
 * (02/09 luật cho nghỉ 2 ngày, ngày liền kề thay đổi theo năm → chỉ cố định 02/09.)
 */
const FIXED_HOLIDAY_MMDD = new Set<string>([
  '01-01', // Tết Dương lịch
  '04-30', // Ngày Giải phóng miền Nam, thống nhất đất nước
  '05-01', // Quốc tế Lao động
  '09-02', // Quốc khánh
]);

/**
 * Ngày lễ ÂM LỊCH (Tết Nguyên đán, Giỗ Tổ Hùng Vương 10/3 ÂL) đổi ngày dương mỗi năm
 * → không cố định được, phải liệt kê 'YYYY-MM-DD' theo từng năm. Để trống; bổ sung khi cần.
 */
const LUNAR_HOLIDAY_DATES = new Set<string>([
  // Ví dụ khi cần: '2027-02-06' (Mùng 1 Tết 2027) ...
]);

/** checkinDate/checkoutDate lưu dạng 00:00Z của ngày-lịch → getUTCDay() cho đúng thứ. */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Ngày lễ = lễ dương cố định (theo MM-DD) HOẶC lễ âm được liệt kê (theo YYYY-MM-DD). */
function isHoliday(d: Date): boolean {
  const key = dateKey(d); // YYYY-MM-DD
  return FIXED_HOLIDAY_MMDD.has(key.slice(5)) || LUNAR_HOLIDAY_DATES.has(key);
}

function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay(); // 0=CN, 5=T6, 6=T7
  return dow === 0 || dow === 5 || dow === 6;
}

/**
 * Giá 1 đêm cho 1 ngày cụ thể — chọn holiday > weekend > weekday (cùng quy tắc computeBookingPricing).
 * Dùng để hiển thị giá theo ngày trên lịch. Trả amount=null nếu chưa cấu hình weekdayPrice.
 */
export function resolveNightlyRate(
  date: Date,
  pricing: { weekdayPrice: number | null; weekendPrice: number | null; holidayPrice: number | null },
): { type: NightType; amount: number | null } {
  if (pricing.weekdayPrice == null) return { type: 'weekday', amount: null };
  const weekday = pricing.weekdayPrice;
  const weekend = pricing.weekendPrice ?? weekday;
  const holiday = pricing.holidayPrice ?? weekday;
  if (isHoliday(date)) return { type: 'holiday', amount: holiday };
  if (isWeekend(date)) return { type: 'weekend', amount: weekend };
  return { type: 'weekday', amount: weekday };
}

/**
 * Tính giá 1 booking. Trả totalAmount=null + breakdown=null khi property chưa có giá
 * (weekdayPrice null) hoặc khoảng ngày không hợp lệ (nights <= 0).
 */
export function computeBookingPricing(input: {
  checkin: Date;
  checkout: Date;
  adults: number;
  children: number;
  pricing: PropertyPricing;
}): { totalAmount: number | null; breakdown: PriceBreakdown | null } {
  const { checkin, checkout, adults, children, pricing } = input;

  const nights = Math.max(0, Math.round((checkout.getTime() - checkin.getTime()) / DAY_MS));
  if (nights <= 0) return { totalAmount: null, breakdown: null };

  // Chưa cấu hình giá ngày thường → không bịa số.
  if (pricing.weekdayPrice == null) return { totalAmount: null, breakdown: null };

  const weekday = pricing.weekdayPrice;
  const weekend = pricing.weekendPrice ?? weekday; // fallback weekday nếu null
  const holiday = pricing.holidayPrice ?? weekday;

  const lineItems: PriceLineItem[] = [];
  let roomTotal = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(checkin.getTime() + i * DAY_MS);
    const key = dateKey(d);
    let type: NightType;
    let amount: number;
    if (isHoliday(d)) {
      type = 'holiday';
      amount = holiday;
    } else if (isWeekend(d)) {
      type = 'weekend';
      amount = weekend;
    } else {
      type = 'weekday';
      amount = weekday;
    }
    roomTotal += amount;
    lineItems.push({ date: key, type, amount });
  }

  const standardGuests = pricing.standardGuests ?? 0;
  const standardChildren = pricing.standardChildren ?? 0;
  const extraAdults = Math.max(0, adults - standardGuests);
  const extraChildren = Math.max(0, children - standardChildren);
  const surchargePerNight =
    extraAdults * (pricing.adultSurcharge ?? 0) + extraChildren * (pricing.childSurcharge ?? 0);
  const surchargeTotal = surchargePerNight * nights;

  const total = roomTotal + surchargeTotal;

  return {
    totalAmount: total,
    breakdown: {
      nights,
      lineItems,
      extraAdults,
      extraChildren,
      surchargePerNight,
      surchargeTotal,
      roomTotal,
      total,
    },
  };
}

/**
 * Số người lớn/trẻ em dùng cho tính phụ thu.
 * - Booking khách (customer-hold): có adults/children riêng.
 * - Booking staff (hold): chỉ có guestCount → coi toàn bộ là người lớn, trẻ em = 0.
 */
export function resolveGuestCounts(booking: {
  adults?: number | null;
  children?: number | null;
  guestCount?: number | null;
}): { adults: number; children: number } {
  if (booking.adults != null) {
    return { adults: booking.adults, children: booking.children ?? 0 };
  }
  return { adults: booking.guestCount ?? 0, children: 0 };
}
