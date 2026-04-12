// ─── Integer Enum Constants ─────────────────────────────────────────────────
// All enums are stored as integers in the database.
// Use these constants throughout the codebase instead of magic numbers.

export const ROLE = {
  ADMIN: 0,
  OWNER: 1,
  SALE: 2,
  CUSTOMER: 3,
} as const;

// Helper: roles that can manage properties/bookings (non-customer, non-admin management)
export const STAFF_ROLES = [ROLE.OWNER, ROLE.SALE] as const;

// Sentinel value: SALE chưa gán owner → query sẽ match 0 records
const UNASSIGNED_OWNER_ID = '__UNASSIGNED__';

/**
 * Get the effective ownerId for data scoping.
 * - ADMIN → null (sees all)
 * - OWNER → user.id (sees own data)
 * - SALE  → user.ownerId, hoặc UNASSIGNED nếu chưa gán (trả data rỗng)
 */
export function getEffectiveOwnerId(user: { id: string; role: number; ownerId?: string | null }): string | null {
  if (user.role === ROLE.ADMIN) return null;
  if (user.role === ROLE.OWNER) return user.id;
  if (user.role === ROLE.SALE) return user.ownerId || UNASSIGNED_OWNER_ID;
  return null;
}

/** SALE chưa được gán cho owner nào */
export function isSaleUnassigned(user: { role: number; ownerId?: string | null }): boolean {
  return user.role === ROLE.SALE && !user.ownerId;
}

export const BOOKING_STATUS = {
  HOLD: 0,
  CONFIRMED: 1,
  CANCELLED: 2,
  COMPLETED: 3,
} as const;

export const PROPERTY_TYPE = {
  VILLA: 0,
  HOMESTAY: 1,
  HOTEL: 2,
} as const;

export const CANCELLATION_POLICY = {
  FLEXIBLE: 0,
  MODERATE: 1,
  STRICT: 2,
} as const;

export const NOTIFICATION_TYPE = {
  BOOKING: 0,
  PAYMENT: 1,
  SYSTEM: 2,
} as const;

export const CALENDAR_LOCK_STATUS = {
  LOCKED: 0,
  HOLD: 1,
  BOOKED: 2,
} as const;

export const GENDER = {
  MALE: 0,
  FEMALE: 1,
  OTHER: 2,
} as const;
