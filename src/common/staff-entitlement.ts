// Quy tắc số slot SALE tối đa theo planId — MIRROR của
// app/lib/core/utils/staff_entitlement.dart. Phải đồng bộ 2 nơi.
//
// null = unlimited, 0 = không cho phép mời.

/**
 * OWNER trong silent trial 60d (chưa mua plan) được mời 1 SALE — đủ để KYC
 * pass xong vẫn vận hành thử cơ sở. Hết trial hoặc admin mark-paid không có
 * planId → rơi về 0 như cũ. Mirror constant ở FE staff_entitlement.dart.
 */
export const TRIAL_MAX_SALE_STAFF = 1;

const STAFF_LIMIT_BY_PLAN: Record<string, number | null> = {
  rooms_1: 0,        // Mini
  rooms_5: 3,        // Starter
  rooms_10: 3,       // Standard
  rooms_20: null,    // Pro
  rooms_50: null,    // Business
  enterprise: null,  // Enterprise
};

const PLAN_DISPLAY_NAME: Record<string, string> = {
  rooms_1: 'Mini',
  rooms_5: 'Starter',
  rooms_10: 'Standard',
  rooms_20: 'Pro',
  rooms_50: 'Business',
  enterprise: 'Enterprise',
};

export function getMaxSaleStaff(planId: string | null | undefined): number | null {
  if (!planId) return 0; // chưa mua gói nào → coi như không có quyền mời
  if (!(planId in STAFF_LIMIT_BY_PLAN)) return 0; // plan lạ → safe default
  return STAFF_LIMIT_BY_PLAN[planId];
}

/**
 * Effective slot SALE — có tính tới silent trial. OWNER mới đăng ký được
 * cấp `subscriptionStatus="trial"` + `planId=null` → vẫn được 1 slot SALE.
 * Các state khác (active/past_due/cancelled/none) đi qua `getMaxSaleStaff`.
 */
export function getEffectiveMaxSaleStaff(
  planId: string | null | undefined,
  subscriptionStatus: string,
): number | null {
  if (!planId && subscriptionStatus === 'trial') return TRIAL_MAX_SALE_STAFF;
  return getMaxSaleStaff(planId);
}

export function getPlanDisplayName(planId: string | null | undefined): string {
  if (!planId) return 'chưa mua';
  return PLAN_DISPLAY_NAME[planId] || planId;
}
