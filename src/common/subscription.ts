import { PrismaService } from '../prisma/prisma.service';
import { Messages } from '../i18n';
import { ROLE, SUBSCRIPTION_STATUS } from './constants';
import { featureLocked } from './errors/subscription.errors';

interface EntitlementUser {
  id: string;
  role: number;
  ownerId?: string | null;
}

interface OwnerEntitlement {
  kycBypass: boolean;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
}

/**
 * Trial ngầm (chưa mua gói) chỉ được đăng tối đa 1 cơ sở (1 villa / 1 homestay /
 * 1 khách sạn). Mua gói bất kỳ hoặc được ADMIN cấp kycBypass → gỡ cap này.
 */
export const TRIAL_MAX_PROPERTIES = 1;

interface TrialQuotaOwner {
  kycBypass: boolean;
  subscriptionStatus: string;
  subscriptionPlanId: string | null;
}

/**
 * Owner có đang bị giới hạn số cơ sở theo trial ngầm không.
 * - kycBypass (ADMIN grant) → không cap.
 * - Đã có subscriptionPlanId (đã mua gói) → không cap.
 * - Chỉ cap khi status = TRIAL và chưa gắn plan nào.
 */
export function isTrialPropertyCapped(owner: TrialQuotaOwner): boolean {
  if (owner.kycBypass) return false;
  if (owner.subscriptionPlanId) return false;
  return owner.subscriptionStatus === SUBSCRIPTION_STATUS.TRIAL;
}

/**
 * Owner được phép dùng tính năng quản lý khi:
 * - kycBypass = true (ADMIN cấp tay), HOẶC
 * - subscriptionStatus = ACTIVE, HOẶC
 * - subscriptionStatus = TRIAL và trialEndsAt còn hiệu lực.
 *
 * Hết hạn trial → throw 403 với message generic (không lộ trial cho FE iOS).
 */
export function isOwnerEntitled(owner: OwnerEntitlement, now = new Date()): boolean {
  if (owner.kycBypass) return true;
  if (owner.subscriptionStatus === SUBSCRIPTION_STATUS.ACTIVE) return true;
  if (
    owner.subscriptionStatus === SUBSCRIPTION_STATUS.TRIAL &&
    owner.trialEndsAt &&
    owner.trialEndsAt.getTime() > now.getTime()
  ) {
    return true;
  }
  return false;
}

/**
 * Assert effective owner còn quyền dùng tính năng quản lý.
 * - ADMIN: bypass.
 * - OWNER: check chính mình.
 * - SALE: check owner đang được gán (nếu chưa gán → 403).
 */
export async function assertOwnerEntitled(
  prisma: PrismaService,
  user: EntitlementUser,
  msg: Messages,
): Promise<void> {
  if (user.role === ROLE.ADMIN) return;

  let ownerId: string | null = null;
  if (user.role === ROLE.OWNER) ownerId = user.id;
  else if (user.role === ROLE.SALE) ownerId = user.ownerId ?? null;

  if (!ownerId) {
    throw featureLocked(msg.subscription.featureLocked);
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { kycBypass: true, subscriptionStatus: true, trialEndsAt: true },
  });

  if (!owner || !isOwnerEntitled(owner)) {
    throw featureLocked(msg.subscription.featureLocked);
  }
}
