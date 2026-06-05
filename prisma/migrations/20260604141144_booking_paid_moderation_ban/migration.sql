-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "paidAmount" INTEGER,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "totalAmount" INTEGER;

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "moderationRejectedReason" TEXT,
ADD COLUMN     "moderationReviewedAt" TIMESTAMP(3),
ADD COLUMN     "moderationReviewedBy" TEXT,
ADD COLUMN     "moderationStatus" TEXT NOT NULL DEFAULT 'approved';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "bannedBy" TEXT,
ADD COLUMN     "bannedReason" TEXT;
