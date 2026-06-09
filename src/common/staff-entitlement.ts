// Quy tắc số slot SALE tối đa theo planId — MIRROR của
// app/lib/core/utils/staff_entitlement.dart. Phải đồng bộ 2 nơi.
//
// null = unlimited, 0 = không cho phép mời.

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

export function getPlanDisplayName(planId: string | null | undefined): string {
  if (!planId) return 'chưa mua';
  return PLAN_DISPLAY_NAME[planId] || planId;
}
