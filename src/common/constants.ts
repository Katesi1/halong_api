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

export const BOOKING_STATUS = {
  HOLD: 0,
  CONFIRMED: 1,
  CANCELLED: 2,
  COMPLETED: 3,
} as const;

export const PROPERTY_TYPE = {
  VILLA: 0,
  HOMESTAY: 1,
  APARTMENT: 2,
  HOTEL: 3,
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
  BOOKED: 1,
} as const;

export const GENDER = {
  MALE: 0,
  FEMALE: 1,
  OTHER: 2,
} as const;
