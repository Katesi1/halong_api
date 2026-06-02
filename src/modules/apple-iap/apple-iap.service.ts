import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NOTIFICATION_TYPE,
  SUBSCRIPTION_STATUS,
} from '../../common/constants';
import {
  decodeTransactionInfo,
  fetchTransactionInfo,
  type AppleTransactionInfo,
} from './helpers/apple-storekit.client';
import { verifyAppleJws } from './helpers/apple-jwt.helper';
import { parseAppleProductId } from './helpers/product-id.mapper';
import type { Messages } from '../../i18n';

const PROVIDER = 'apple_iap';

type S2SPayload = {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data?: {
    bundleId?: string;
    environment?: 'Production' | 'Sandbox';
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

@Injectable()
export class AppleIapService {
  private readonly logger = new Logger(AppleIapService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── 1. /payments/apple/verify ───────────────────────────────────────────
  async verifyReceipt(
    user: { id: string },
    productId: string,
    purchaseId: string,
    msg: Messages,
  ) {
    const expectedBundleId = process.env.APPLE_IAP_BUNDLE_ID;
    if (!expectedBundleId) {
      throw new BadRequestException(msg.appleIap.notConfigured);
    }

    let tx: AppleTransactionInfo;
    try {
      tx = await fetchTransactionInfo(purchaseId);
    } catch (err) {
      this.logger.warn(`verifyReceipt: Apple lookup failed ${(err as Error).message}`);
      throw new BadRequestException(msg.appleIap.invalidReceipt);
    }

    if (tx.bundleId !== expectedBundleId) {
      this.logger.warn(`Bundle mismatch: got ${tx.bundleId}, expected ${expectedBundleId}`);
      throw new BadRequestException(msg.appleIap.bundleMismatch);
    }
    if (tx.productId !== productId) {
      this.logger.warn(`Product mismatch: client=${productId} apple=${tx.productId}`);
      throw new BadRequestException(msg.appleIap.productMismatch);
    }
    if (tx.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(msg.appleIap.expired);
    }

    const parsed = parseAppleProductId(productId);
    if (!parsed) {
      throw new BadRequestException(msg.appleIap.unknownProduct);
    }

    await this.applyActivation({
      userId: user.id,
      tx,
      planId: parsed.planId,
      cycle: parsed.cycle,
    });

    return {
      message: msg.appleIap.verifySuccess,
      data: {
        status: 'approved',
        expiresAt: tx.expiresAt.toISOString(),
        originalTransactionId: tx.originalTransactionId,
      },
    };
  }

  // ─── 2. /webhooks/apple/s2s-notifications ────────────────────────────────
  async handleS2SNotification(signedPayload: string) {
    let outer: S2SPayload;
    try {
      outer = verifyAppleJws<S2SPayload>(signedPayload);
    } catch (err) {
      this.logger.warn(`S2S verify outer failed: ${(err as Error).message}`);
      // Trả 200 — Apple sẽ không retry với invalid JWT (signature attack hoặc dev test)
      return { ok: true };
    }

    if (!outer.notificationUUID || !outer.notificationType) {
      this.logger.warn('S2S payload missing notificationUUID/type');
      return { ok: true };
    }

    // Idempotency
    const existing = await this.prisma.appleNotification.findUnique({
      where: { notificationUUID: outer.notificationUUID },
    });
    if (existing) {
      this.logger.debug(`S2S ${outer.notificationUUID} đã xử lý trước, skip`);
      return { ok: true };
    }

    let txInfo: AppleTransactionInfo | null = null;
    if (outer.data?.signedTransactionInfo) {
      try {
        txInfo = decodeTransactionInfo(outer.data.signedTransactionInfo);
      } catch (err) {
        this.logger.warn(`S2S decode tx failed: ${(err as Error).message}`);
      }
    }

    await this.prisma.appleNotification.create({
      data: {
        notificationUUID: outer.notificationUUID,
        notificationType: outer.notificationType,
        subtype: outer.subtype ?? null,
        originalTransactionId: txInfo?.originalTransactionId ?? null,
        rawPayload: outer as unknown as Prisma.InputJsonValue,
      },
    });

    if (!txInfo) {
      this.logger.warn(`S2S ${outer.notificationType} không có tx info — skip apply`);
      return { ok: true };
    }

    const txRow = await this.prisma.appleTransaction.findUnique({
      where: { originalTransactionId: txInfo.originalTransactionId },
    });
    if (!txRow) {
      this.logger.warn(
        `S2S cho originalTx ${txInfo.originalTransactionId} chưa có trong DB (chưa verify lần đầu) — skip`,
      );
      return { ok: true };
    }

    await this.applyS2SChange(outer, txInfo, txRow.userId);
    return { ok: true };
  }

  // ─── Internal: state transitions ─────────────────────────────────────────
  private async applyActivation(args: {
    userId: string;
    tx: AppleTransactionInfo;
    planId: string;
    cycle: 'monthly' | 'yearly';
  }) {
    const { userId, tx, planId, cycle } = args;
    const rawPayload = tx.raw as unknown as Prisma.InputJsonValue;

    await this.prisma.$transaction(async (db) => {
      await db.appleTransaction.upsert({
        where: { originalTransactionId: tx.originalTransactionId },
        create: {
          originalTransactionId: tx.originalTransactionId,
          userId,
          productId: tx.productId,
          transactionId: tx.transactionId,
          bundleId: tx.bundleId,
          environment: tx.environment,
          purchaseDate: tx.purchaseDate,
          expiresAt: tx.expiresAt,
          status: 'active',
          rawPayload,
        },
        update: {
          userId,
          productId: tx.productId,
          transactionId: tx.transactionId,
          expiresAt: tx.expiresAt,
          status: 'active',
          rawPayload,
        },
      });

      await db.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
          subscriptionPlanId: planId,
          subscriptionCycle: cycle,
          subscriptionProvider: PROVIDER,
          nextChargeAt: tx.expiresAt,
          // KYC: nếu chưa approved thì giữ nguyên — Apple paid không tự bypass admin review
        },
      });

      const billingPlan = await db.billingPlan.findUnique({ where: { id: planId } });
      if (billingPlan) {
        const existingSub = await db.subscription.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        if (existingSub) {
          await db.subscription.update({
            where: { id: existingSub.id },
            data: {
              planId,
              cycle,
              status: SUBSCRIPTION_STATUS.ACTIVE,
              endsAt: tx.expiresAt,
              cancelledAt: null,
            },
          });
        } else {
          await db.subscription.create({
            data: {
              userId,
              planId,
              cycle,
              rooms: 1,
              status: SUBSCRIPTION_STATUS.ACTIVE,
              startsAt: tx.purchaseDate,
              endsAt: tx.expiresAt,
            },
          });
        }
      }
    });
  }

  private async applyS2SChange(
    outer: S2SPayload,
    tx: AppleTransactionInfo,
    userId: string,
  ) {
    const type = outer.notificationType;
    const subtype = outer.subtype;
    const rawPayload = tx.raw as unknown as Prisma.InputJsonValue;
    const now = new Date();

    switch (type) {
      case 'SUBSCRIBED':
      case 'DID_RENEW': {
        await this.prisma.$transaction(async (db) => {
          await db.appleTransaction.update({
            where: { originalTransactionId: tx.originalTransactionId },
            data: {
              transactionId: tx.transactionId,
              expiresAt: tx.expiresAt,
              status: 'active',
              rawPayload,
            },
          });
          await db.user.update({
            where: { id: userId },
            data: {
              subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
              subscriptionProvider: PROVIDER,
              nextChargeAt: tx.expiresAt,
            },
          });
          await db.subscription.updateMany({
            where: { userId },
            data: { status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: tx.expiresAt },
          });
        });
        break;
      }

      case 'DID_FAIL_TO_RENEW': {
        const newStatus =
          subtype === 'GRACE_PERIOD'
            ? SUBSCRIPTION_STATUS.PAST_DUE
            : SUBSCRIPTION_STATUS.CANCELLED;
        await this.prisma.user.update({
          where: { id: userId },
          data: { subscriptionStatus: newStatus },
        });
        await this.notifications.notifyUser(
          userId,
          'Gia hạn thất bại',
          subtype === 'GRACE_PERIOD'
            ? 'Apple chưa thu được phí — bạn còn thời gian gia hạn (grace period).'
            : 'Apple không gia hạn được. Vui lòng cập nhật phương thức thanh toán.',
          NOTIFICATION_TYPE.PAYMENT,
          undefined,
          'subscription',
          { pushType: 'apple_renew_failed', deepLink: '/dashboard/billing' },
        );
        break;
      }

      case 'EXPIRED': {
        await this.prisma.$transaction(async (db) => {
          await db.appleTransaction.update({
            where: { originalTransactionId: tx.originalTransactionId },
            data: { status: 'expired' },
          });
          await db.user.update({
            where: { id: userId },
            data: { subscriptionStatus: 'expired' },
          });
          await db.subscription.updateMany({
            where: { userId },
            data: { status: 'expired', cancelledAt: now },
          });
        });
        break;
      }

      case 'DID_CHANGE_RENEWAL_STATUS': {
        const newStatus =
          subtype === 'AUTO_RENEW_DISABLED'
            ? SUBSCRIPTION_STATUS.CANCELLED
            : SUBSCRIPTION_STATUS.ACTIVE;
        await this.prisma.user.update({
          where: { id: userId },
          data: { subscriptionStatus: newStatus },
        });
        break;
      }

      case 'DID_CHANGE_RENEWAL_PREF': {
        // UPGRADE → apply ngay; DOWNGRADE → áp dụng ở chu kỳ sau (chỉ log)
        if (subtype === 'UPGRADE') {
          const parsed = parseAppleProductId(tx.productId);
          if (parsed) {
            await this.prisma.user.update({
              where: { id: userId },
              data: {
                subscriptionPlanId: parsed.planId,
                subscriptionCycle: parsed.cycle,
              },
            });
          }
        }
        await this.prisma.appleTransaction.update({
          where: { originalTransactionId: tx.originalTransactionId },
          data: { productId: tx.productId, rawPayload },
        });
        break;
      }

      case 'REFUND': {
        await this.prisma.$transaction(async (db) => {
          await db.appleTransaction.update({
            where: { originalTransactionId: tx.originalTransactionId },
            data: { status: 'refunded' },
          });
          await db.user.update({
            where: { id: userId },
            data: { subscriptionStatus: SUBSCRIPTION_STATUS.CANCELLED },
          });
          await db.subscription.updateMany({
            where: { userId },
            data: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: now },
          });
        });
        await this.notifications.notifyUser(
          userId,
          'Đã hoàn tiền',
          'Apple đã hoàn lại giao dịch của bạn. Quyền sử dụng tương ứng đã bị thu hồi.',
          NOTIFICATION_TYPE.PAYMENT,
          undefined,
          'subscription',
          { pushType: 'apple_refund', deepLink: '/dashboard/billing' },
        );
        break;
      }

      default: {
        this.logger.log(`S2S ${type}/${subtype ?? '-'} — không có action mapping, đã log`);
      }
    }
  }
}
