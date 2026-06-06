/**
 * Subscription billing helpers — single source of truth for prices,
 * prorate, period extension, tier comparison.
 *
 * Áp dụng cho:
 *  - POST /payments/initiate  (subscription / renew-via-initiate / upgrade / downgrade)
 *  - POST /payments/renew
 *  - POST /payments/quote
 *
 * Quy ước:
 *  - subtotal = giá kỳ chưa VAT (đã trừ chiết khấu năm nếu cycle=yearly)
 *  - vat      = round(subtotal × vatPct/100)
 *  - total    = subtotal + vat
 *  - priceOverride (admin set) = absolute price/kỳ chưa VAT, override luôn cả discount năm.
 */

export const TIER_ORDER: Record<string, number> = {
  rooms_1: 1,
  rooms_5: 2,
  rooms_10: 3,
  rooms_20: 4,
  rooms_50: 5,
  enterprise: 6,
  starter_test: 0,
};

export type Cycle = 'monthly' | 'yearly';

export interface PlanLike {
  id: string;
  pricePerRoom: number;
  minCharge: number;
  yearlyDiscountPct: number;
  vatPct: number;
}

export interface PriceBreakdown {
  listPrice: number; // subtotal trước VAT của kỳ mới (after yearly discount)
  creditApplied: number; // credit prorate từ gói cũ (chỉ upgrade)
  vat: number; // VAT trên (listPrice - creditApplied)
  total: number; // số tiền user cần trả
  remainingDays?: number;
  totalDays?: number;
  periodExtension?: { months: number } | null;
}

export type BillingKind = 'subscription' | 'renew' | 'upgrade' | 'downgrade';

/** Subtotal chưa VAT của 1 kỳ (đã trừ yearly discount). */
export function planSubtotal(
  plan: PlanLike,
  cycle: Cycle,
  rooms: number,
  priceOverride?: number | null,
): number {
  if (priceOverride !== null && priceOverride !== undefined) {
    // Override = absolute price/kỳ chưa VAT
    return priceOverride;
  }
  const months = cycle === 'yearly' ? 12 : 1;
  const discount = cycle === 'yearly' ? plan.yearlyDiscountPct / 100 : 0;
  const base = Math.max(plan.pricePerRoom * rooms, plan.minCharge) * months;
  return Math.round(base * (1 - discount));
}

export function computeFullCycleTotal(
  plan: PlanLike,
  cycle: Cycle,
  rooms: number,
  priceOverride?: number | null,
): PriceBreakdown {
  const sub = planSubtotal(plan, cycle, rooms, priceOverride);
  const vat = Math.round(sub * (plan.vatPct / 100));
  return {
    listPrice: sub,
    creditApplied: 0,
    vat,
    total: sub + vat,
    periodExtension: { months: cycle === 'yearly' ? 12 : 1 },
  };
}

/**
 * Prorate upgrade:
 *  - oldCredit = oldSubtotal × remainingDays / totalDays
 *  - amountDue = max(0, newSubtotal − oldCredit) + VAT trên phần due
 *  - period KHÔNG được reset (giữ currentPeriodEnd cũ)
 */
export function computeUpgradeProrate(
  newPlan: PlanLike,
  newCycle: Cycle,
  newRooms: number,
  newPriceOverride: number | null | undefined,
  oldPlan: PlanLike,
  oldCycle: Cycle,
  oldRooms: number,
  oldPriceOverride: number | null | undefined,
  currentPeriodEnd: Date | null,
  now: Date = new Date(),
): PriceBreakdown {
  const totalDays = oldCycle === 'yearly' ? 365 : 30;
  let remainingDays = 0;
  if (currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()) {
    remainingDays = Math.max(
      0,
      Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / 86_400_000),
    );
    remainingDays = Math.min(remainingDays, totalDays);
  }

  const oldSub = planSubtotal(oldPlan, oldCycle, oldRooms, oldPriceOverride);
  const newSub = planSubtotal(newPlan, newCycle, newRooms, newPriceOverride);
  const oldCredit = Math.round((oldSub * remainingDays) / totalDays);
  const due = Math.max(0, newSub - oldCredit);
  const vat = Math.round(due * (newPlan.vatPct / 100));
  return {
    listPrice: newSub,
    creditApplied: oldCredit,
    vat,
    total: due + vat,
    remainingDays,
    totalDays,
    periodExtension: null,
  };
}

export function isUpgrade(currentPlanId: string, newPlanId: string): boolean {
  return (TIER_ORDER[newPlanId] ?? 0) > (TIER_ORDER[currentPlanId] ?? 0);
}

export function isDowngrade(currentPlanId: string, newPlanId: string): boolean {
  return (TIER_ORDER[newPlanId] ?? 0) < (TIER_ORDER[currentPlanId] ?? 0);
}

/**
 * Cộng thời hạn từ baseDate.
 * baseDate = max(now, currentPeriodEnd) → stack policy.
 */
export function extendPeriod(
  baseDate: Date,
  cycle: Cycle,
): Date {
  const next = new Date(baseDate);
  if (cycle === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

export function pickBaseDate(currentPeriodEnd: Date | null, now: Date = new Date()): Date {
  if (currentPeriodEnd && currentPeriodEnd.getTime() > now.getTime()) {
    return currentPeriodEnd;
  }
  return now;
}
