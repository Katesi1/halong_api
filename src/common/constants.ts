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
  NO_SHOW: 4,
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

// ─── KYC Constants ──────────────────────────────────────────────────────────

export const KYC_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export const KYC_SUBMISSION_STATUS = {
  DRAFT: 'draft',
  KYC_SUBMITTED: 'kyc_submitted',
  PAYMENT_PENDING: 'payment_pending',
  AWAITING_APPROVAL: 'awaiting_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REFUNDED: 'refunded',
} as const;

/** Admin KYC queue tab filter — FE gửi số, BE map sang DB status. */
export const KYC_ADMIN_FILTER = {
  ALL: 0,
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
} as const;

export const KYC_ADMIN_PENDING_STATUSES = [
  KYC_SUBMISSION_STATUS.KYC_SUBMITTED,
  KYC_SUBMISSION_STATUS.PAYMENT_PENDING,
  KYC_SUBMISSION_STATUS.AWAITING_APPROVAL,
] as const;

export const KYC_ADMIN_APPROVED_STATUSES = [
  KYC_SUBMISSION_STATUS.APPROVED,
  KYC_SUBMISSION_STATUS.REFUNDED,
] as const;

export const KYC_ADMIN_REJECTED_STATUSES = [
  KYC_SUBMISSION_STATUS.REJECTED,
] as const;

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  EXPIRED: 'expired',
  REFUNDED: 'refunded',
} as const;

export const PAYMENT_KIND = {
  SUBSCRIPTION: 'subscription',
  RENEW: 'renew',
  UPGRADE: 'upgrade',
  REFUND: 'refund',
} as const;

export const PAYMENT_METHOD = {
  BANK_TRANSFER: 'bank_transfer',
} as const;

export const PAYMENT_PROVIDER = {
  CASSO: 'casso',
  SEPAY: 'sepay',
  MANUAL_BANK: 'manual_bank',
  MANUAL: 'manual',
} as const;

export const SUBSCRIPTION_STATUS = {
  NONE: 'none',
  TRIAL: 'trial',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
  FROZEN: 'frozen',
} as const;

/**
 * Trial mặc định cấp ngầm khi OWNER vừa đăng ký (Apple IAP compliance: app iOS
 * không có UI thanh toán, nên OWNER được dùng thử thầm 60 ngày để KYC + thử
 * tính năng. FE iOS KHÔNG hiển thị countdown trial — hết hạn chỉ trả lỗi
 * entitlement chung "Tài khoản chưa có quyền dùng tính năng này".
 */
export const OWNER_SIGNUP_TRIAL_DAYS = 60;

// ─── Disputes ────────────────────────────────────────────────────────────────

export const DISPUTE_TYPE = {
  REFUND_REQUEST: 'refund_request',
  SERVICE_QUALITY: 'service_quality',
  DAMAGE_CLAIM: 'damage_claim',
  NO_SHOW: 'no_show',
  OVERBOOKING: 'overbooking',
  OTHER: 'other',
} as const;

// ─── Chat ─────────────────────────────────────────────────────────────────────

export const CONVERSATION_TYPE = {
  BOOKING: 'booking',
  SUPPORT: 'support',
  STAFF: 'staff',
} as const;

export const CONVERSATION_MEMBER_ROLE = {
  OWNER: 'owner',
  SALE: 'sale',
  CUSTOMER: 'customer',
  ADMIN: 'admin',
} as const;

export const CHAT_LIMITS = {
  MESSAGE_MAX_LENGTH: 5000,
  ATTACHMENTS_MAX: 5,
  PAGE_DEFAULT: 50,
  PAGE_MAX: 100,
  RETENTION_DAYS: 180,
} as const;

export const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CONVERTED: 'converted',
} as const;

export const LEAD_SOURCE = {
  PUBLIC_FORM: 'public_form',
  LANDING_PAGE: 'landing_page',
  PARTNER: 'partner',
  MANUAL: 'manual',
} as const;

export const DISPUTE_STATUS = {
  PENDING: 'pending',
  INVESTIGATING: 'investigating',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} as const;

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const AUDIT_TARGET_TYPE = {
  USER: 'user',
  PROPERTY: 'property',
  BOOKING: 'booking',
  DISPUTE: 'dispute',
  SUBSCRIPTION: 'subscription',
  REVIEW: 'review',
  KYC: 'kyc',
} as const;

export const AUDIT_ACTION = {
  // user
  USER_BAN: 'user.ban',
  USER_UNBAN: 'user.unban',
  USER_REVOKE_SESSIONS: 'user.revoke_sessions',
  USER_RESET_PASSWORD: 'user.reset_password',
  USER_CHANGE_ROLE: 'user.change_role',
  USER_KYC_BYPASS_TOGGLE: 'user.kyc_bypass_toggle',
  // property
  PROPERTY_APPROVE: 'property.approve',
  PROPERTY_REJECT: 'property.reject',
  PROPERTY_SUSPEND: 'property.suspend',
  // subscription
  SUBSCRIPTION_TRIAL_GRANT: 'subscription.trial_grant',
  SUBSCRIPTION_TRIAL_REVOKE: 'subscription.trial_revoke',
  SUBSCRIPTION_SET_PRICE: 'subscription.set_price',
  SUBSCRIPTION_MARK_PAID: 'subscription.mark_paid',
  SUBSCRIPTION_FREEZE: 'subscription.freeze',
  SUBSCRIPTION_UNFREEZE: 'subscription.unfreeze',
  // review
  REVIEW_HIDE: 'review.hide',
  REVIEW_RESTORE: 'review.restore',
  // kyc
  KYC_APPROVE: 'kyc.approve',
  KYC_REJECT: 'kyc.reject',
  // booking
  BOOKING_MARK_PAID: 'booking.mark_paid',
  // dispute
  DISPUTE_INVESTIGATE: 'dispute.investigate',
  DISPUTE_RESOLVE: 'dispute.resolve',
  DISPUTE_REJECT: 'dispute.reject',
} as const;

export const KYC_UPLOAD_TYPE = {
  CCCD_FRONT: 'cccd_front',
  CCCD_BACK: 'cccd_back',
  SELFIE: 'selfie',
} as const;

// ─── Permission Constants ────────────────────────────────────────────────────

export const PERMISSION_MODULE = {
  PROPERTIES: 'properties',
  BOOKINGS: 'bookings',
  CALENDAR: 'calendar',
  REVIEWS: 'reviews',
} as const;

export const PERMISSION_ACTION = {
  CREATE: 'canCreate',
  READ: 'canRead',
  UPDATE: 'canUpdate',
  DELETE: 'canDelete',
} as const;

export const ALL_PERMISSION_MODULES = Object.values(PERMISSION_MODULE);

// Status mapping for API response (camelCase for frontend)
export const KYC_STATUS_API_MAP: Record<string, string> = {
  draft: 'draft',
  kyc_submitted: 'kycSubmitted',
  payment_pending: 'paymentPending',
  awaiting_approval: 'awaitingApproval',
  approved: 'approved',
  rejected: 'rejected',
  refunded: 'refunded',
};

/** Map KycSubmission.status → admin tab filter (1|2|3). Draft → null. */
export function kycSubmissionToAdminFilter(
  status: string,
): (typeof KYC_ADMIN_FILTER)[keyof typeof KYC_ADMIN_FILTER] | null {
  if ((KYC_ADMIN_PENDING_STATUSES as readonly string[]).includes(status)) {
    return KYC_ADMIN_FILTER.PENDING;
  }
  if ((KYC_ADMIN_APPROVED_STATUSES as readonly string[]).includes(status)) {
    return KYC_ADMIN_FILTER.APPROVED;
  }
  if ((KYC_ADMIN_REJECTED_STATUSES as readonly string[]).includes(status)) {
    return KYC_ADMIN_FILTER.REJECTED;
  }
  return null;
}
