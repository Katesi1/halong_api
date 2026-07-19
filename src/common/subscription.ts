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
 * Owner CHƯA mua gói (trial ngầm — dù đã được ADMIN cấp kycBypass hoặc đã duyệt
 * KYC) chỉ được đăng tối đa TRIAL_MAX_PROPERTIES cơ sở (mọi type tính chung).
 * Trial sẽ hết hạn nên đây là trần cho giai đoạn dùng thử. Mua gói bất kỳ
 * (subscriptionPlanId != null) → gỡ cap, gói tự quản lý giới hạn phòng.
 */
export const TRIAL_MAX_PROPERTIES = 3;

interface TrialQuotaOwner {
  subscriptionPlanId: string | null;
}

/**
 * Owner có đang bị giới hạn số cơ sở theo trial không.
 * - Đã mua gói (subscriptionPlanId != null) → không cap (gói tự quản lý).
 * - Chưa mua gói (planId = null) → LUÔN cap, kể cả kycBypass hoặc KYC đã duyệt.
 *
 * Lưu ý: hàm này chỉ được gọi sau khi `assertOwnerEntitled` đã pass (owner còn
 * quyền dùng tính năng: kycBypass / active / trial còn hạn), nên planId = null
 * tại đây luôn nghĩa là "đang dùng thử, chưa mua gói".
 */
export function isTrialPropertyCapped(owner: TrialQuotaOwner): boolean {
  return owner.subscriptionPlanId === null;
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
