-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "customPrice" INTEGER,
ADD COLUMN     "frozenAt" TIMESTAMP(3),
ADD COLUMN     "frozenReason" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paidAmount" INTEGER,
ADD COLUMN     "provider" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "subscriptionFrozenAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionFrozenReason" TEXT,
ADD COLUMN     "subscriptionPriceOverride" INTEGER;
