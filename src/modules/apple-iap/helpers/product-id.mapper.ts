/**
 * Map Apple product ID → planId + cycle.
 *
 * Quy ước (xem BACKEND_APPLE_IAP_SPEC.md mục 2):
 *   - Apple Product slug (trong product ID): KHÔNG gạch dưới — `rooms10`
 *   - Plan id (ở /billing/plans + subscription_plan_id): CÓ gạch dưới — `rooms_10`
 *
 * Format: com.halong24h.sub.<rooms<N>>_<cycle>
 *   - N    : 1 | 5 | 10 | 20 | 50
 *   - cycle: monthly | yearly
 *
 * Enterprise KHÔNG có IAP — bán hợp đồng riêng.
 */
export const APPLE_PRODUCT_PREFIX = 'com.halong24h.sub.';

const ALLOWED_ROOMS = new Set(['1', '5', '10', '20', '50']);
const ALLOWED_CYCLES = new Set(['monthly', 'yearly']);

export type ParsedProductId = {
  planId: string; // dạng `rooms_<N>` cho khớp BillingPlan.id
  cycle: 'monthly' | 'yearly';
};

export function parseAppleProductId(productId: string): ParsedProductId | null {
  if (!productId.startsWith(APPLE_PRODUCT_PREFIX)) return null;

  // Match: rooms<N>_<cycle>
  const tail = productId.slice(APPLE_PRODUCT_PREFIX.length);
  const m = tail.match(/^rooms(\d+)_(monthly|yearly)$/);
  if (!m) return null;

  const n = m[1];
  const cycle = m[2];

  if (!ALLOWED_ROOMS.has(n)) return null;
  if (!ALLOWED_CYCLES.has(cycle)) return null;

  return { planId: `rooms_${n}`, cycle: cycle as 'monthly' | 'yearly' };
}
