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
