-- AlterTable: bank account moderation fields
ALTER TABLE "users" ADD COLUMN "bankStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "users" ADD COLUMN "bankSubmittedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "bankReviewedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "bankReviewedBy" TEXT;
ALTER TABLE "users" ADD COLUMN "bankRejectReason" TEXT;
ALTER TABLE "users" ADD COLUMN "pendingBankBin" TEXT;
ALTER TABLE "users" ADD COLUMN "pendingBankName" TEXT;
ALTER TABLE "users" ADD COLUMN "pendingBankAccountNumber" TEXT;
ALTER TABLE "users" ADD COLUMN "pendingBankAccountName" TEXT;

-- Backfill: owners who already configured a bank account are considered approved (legacy live values)
UPDATE "users"
SET "bankStatus" = 'approved'
WHERE "bankBin" IS NOT NULL AND "bankAccountNumber" IS NOT NULL;

-- CreateIndex
CREATE INDEX "users_bankStatus_idx" ON "users"("bankStatus");
