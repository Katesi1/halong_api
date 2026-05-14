-- AlterTable: add register tracking fields for anti-spam
ALTER TABLE "users" ADD COLUMN "registerDeviceId" TEXT;
ALTER TABLE "users" ADD COLUMN "registerIp" TEXT;

-- Index for efficient lookup of recent registrations by deviceId / ip
CREATE INDEX "users_registerDeviceId_createdAt_idx" ON "users"("registerDeviceId", "createdAt");
CREATE INDEX "users_registerIp_createdAt_idx" ON "users"("registerIp", "createdAt");
