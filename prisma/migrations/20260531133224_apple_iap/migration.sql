-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "depositAmount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "subscriptionProvider" TEXT;

-- CreateTable
CREATE TABLE "apple_transactions" (
    "originalTransactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apple_transactions_pkey" PRIMARY KEY ("originalTransactionId")
);

-- CreateTable
CREATE TABLE "apple_notifications" (
    "notificationUUID" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "subtype" TEXT,
    "originalTransactionId" TEXT,
    "rawPayload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apple_notifications_pkey" PRIMARY KEY ("notificationUUID")
);

-- CreateIndex
CREATE INDEX "apple_transactions_userId_idx" ON "apple_transactions"("userId");

-- CreateIndex
CREATE INDEX "apple_transactions_expiresAt_idx" ON "apple_transactions"("expiresAt");

-- CreateIndex
CREATE INDEX "apple_notifications_originalTransactionId_idx" ON "apple_notifications"("originalTransactionId");

-- AddForeignKey
ALTER TABLE "apple_transactions" ADD CONSTRAINT "apple_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
