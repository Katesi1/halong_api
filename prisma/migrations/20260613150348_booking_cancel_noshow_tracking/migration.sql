-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByRole" INTEGER,
ADD COLUMN     "cancelledByUserId" TEXT,
ADD COLUMN     "cancelledReason" TEXT,
ADD COLUMN     "noShowMarkedAt" TIMESTAMP(3);
