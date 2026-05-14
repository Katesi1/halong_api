-- Rename fcm_device_tokens → user_devices, align with FE spec api-devices-spec.md

-- Set NULL platforms to 'unknown' before making NOT NULL (spec yêu cầu required)
UPDATE "fcm_device_tokens" SET "platform" = 'unknown' WHERE "platform" IS NULL;

-- Rename table
ALTER TABLE "fcm_device_tokens" RENAME TO "user_devices";

-- Rename columns
ALTER TABLE "user_devices" RENAME COLUMN "token" TO "fcmToken";
ALTER TABLE "user_devices" RENAME COLUMN "lastSeenAt" TO "lastActiveAt";

-- Drop deviceId (không có trong spec FE; FE chỉ dùng deviceModel/osVersion/...)
ALTER TABLE "user_devices" DROP COLUMN "deviceId";

-- Make platform NOT NULL
ALTER TABLE "user_devices" ALTER COLUMN "platform" SET NOT NULL;

-- Add metadata columns theo spec FE
ALTER TABLE "user_devices" ADD COLUMN "deviceModel" TEXT;
ALTER TABLE "user_devices" ADD COLUMN "osVersion" TEXT;
ALTER TABLE "user_devices" ADD COLUMN "appVersion" TEXT;
ALTER TABLE "user_devices" ADD COLUMN "locale" TEXT;

-- Rename pkey + indexes + FK
ALTER TABLE "user_devices" RENAME CONSTRAINT "fcm_device_tokens_pkey" TO "user_devices_pkey";
ALTER INDEX "fcm_device_tokens_token_key" RENAME TO "user_devices_fcmToken_key";
ALTER INDEX "fcm_device_tokens_userId_idx" RENAME TO "user_devices_userId_idx";
ALTER TABLE "user_devices" RENAME CONSTRAINT "fcm_device_tokens_userId_fkey" TO "user_devices_userId_fkey";
