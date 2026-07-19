// Helpers dùng chung cho module du thuyền (yachts).

/**
 * Mã đơn đặt du thuyền — derive từ UUID (không lưu cột riêng), mirror deriveBookingCode.
 * Format: YC-XXXXXXXX (8 hex đầu, uppercase). Dùng làm nội dung CK + mã gửi email khách.
 */
export function deriveYachtCode(id: string): string {
  return `YC-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/** Parse 'YYYY-MM-DD' → Date tại 00:00:00Z của ngày lịch (khớp booking-pricing weekday/weekend). */
export function parseUtcDate(input: string): Date {
  // Chấp nhận cả 'YYYY-MM-DD' và ISO đầy đủ — chỉ lấy phần ngày.
  const dayPart = input.slice(0, 10);
  return new Date(`${dayPart}T00:00:00.000Z`);
}

/** Start-of-today theo giờ VN (UTC+7) quy về 00:00Z — chặn đặt ngày quá khứ. */
export function startOfTodayVN(): Date {
  const now = new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(`${vn.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** Một chặng hành trình du thuyền. */
export interface ItineraryItem {
  order: number;
  title: string;
  time?: string | null;
  description?: string | null;
}
