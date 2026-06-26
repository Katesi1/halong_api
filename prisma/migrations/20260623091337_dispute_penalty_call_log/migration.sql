-- AlterTable
ALTER TABLE "disputes" ADD COLUMN     "penalty" TEXT;

-- CreateTable
CREATE TABLE "subscription_call_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_call_logs_userId_createdAt_idx" ON "subscription_call_logs"("userId", "createdAt" DESC);
