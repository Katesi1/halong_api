/*
  Warnings:

  - You are about to drop the column `roomId` on the `bookings` table. All the data in the column will be lost.
  - The `status` column on the `bookings` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `type` column on the `notifications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `role` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `gender` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `homestays` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `room_images` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `room_prices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `rooms` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `propertyId` to the `bookings` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_roomId_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_saleId_fkey";

-- DropForeignKey
ALTER TABLE "homestays" DROP CONSTRAINT "homestays_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "room_images" DROP CONSTRAINT "room_images_roomId_fkey";

-- DropForeignKey
ALTER TABLE "room_prices" DROP CONSTRAINT "room_prices_roomId_fkey";

-- DropForeignKey
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_homestayId_fkey";

-- DropIndex
DROP INDEX "users_registerDeviceId_createdAt_idx";

-- DropIndex
DROP INDEX "users_registerIp_createdAt_idx";

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "roomId",
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "guestCount" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "propertyId" TEXT NOT NULL,
ALTER COLUMN "saleId" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "notifications" DROP COLUMN "type",
ADD COLUMN     "type" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "kycBypass" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kycStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "kycSubmissionId" TEXT,
ADD COLUMN     "nextChargeAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionCycle" TEXT,
ADD COLUMN     "subscriptionPlanId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
DROP COLUMN "role",
ADD COLUMN     "role" INTEGER NOT NULL DEFAULT 2,
DROP COLUMN "gender",
ADD COLUMN     "gender" INTEGER;

-- DropTable
DROP TABLE "homestays";

-- DropTable
DROP TABLE "room_images";

-- DropTable
DROP TABLE "room_prices";

-- DropTable
DROP TABLE "rooms";

-- DropEnum
DROP TYPE "BookingStatus";

-- DropEnum
DROP TYPE "CancellationPolicy";

-- DropEnum
DROP TYPE "NotificationType";

-- DropEnum
DROP TYPE "Role";

-- DropEnum
DROP TYPE "RoomType";

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "view" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mapLink" TEXT,
    "bedrooms" INTEGER NOT NULL DEFAULT 1,
    "bathrooms" INTEGER NOT NULL DEFAULT 1,
    "standardGuests" INTEGER NOT NULL DEFAULT 2,
    "maxGuests" INTEGER NOT NULL DEFAULT 2,
    "weekdayPrice" DOUBLE PRECISION,
    "weekendPrice" DOUBLE PRECISION,
    "holidayPrice" DOUBLE PRECISION,
    "adultSurcharge" DOUBLE PRECISION,
    "childSurcharge" DOUBLE PRECISION,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cancellationPolicy" INTEGER NOT NULL DEFAULT 0,
    "rules" TEXT,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "checkInTime" TEXT DEFAULT '14:00',
    "checkOutTime" TEXT DEFAULT '12:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_images" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_locks" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_reviews" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cleanliness" INTEGER NOT NULL,
    "location" INTEGER NOT NULL,
    "amenities" INTEGER NOT NULL,
    "service" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "accuracy" INTEGER NOT NULL,
    "avgRating" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "photos" JSONB,
    "ownerReply" TEXT,
    "ownerReplyAt" TIMESTAMP(3),
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "rejectReason" TEXT,
    "rejectedItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "chargeStartsAt" TIMESTAMP(3),
    "expectedRooms" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_uploads" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageUrlThumb" TEXT,
    "publicId" TEXT,
    "ocrResult" JSONB,
    "ocrConfidence" DOUBLE PRECISION,
    "faceMatchScore" DOUBLE PRECISION,
    "livenessScore" DOUBLE PRECISION,
    "provider" TEXT,
    "providerRequestId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePerRoom" INTEGER NOT NULL,
    "minCharge" INTEGER NOT NULL,
    "maxRooms" INTEGER,
    "yearlyDiscountPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "vatPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "billing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submissionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'subscription',
    "planId" TEXT NOT NULL,
    "planLabel" TEXT,
    "cycle" TEXT NOT NULL,
    "rooms" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "qrCode" TEXT,
    "bankInfo" JSONB,
    "redirectUrl" TEXT,
    "payUrl" TEXT,
    "provider" TEXT,
    "providerTxnId" TEXT,
    "providerPayload" JSONB,
    "referenceCode" TEXT,
    "invoiceNumber" TEXT,
    "settledAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundedAmount" INTEGER,
    "refundOfId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_permissions_userId_idx" ON "user_permissions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_module_key" ON "user_permissions"("userId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "properties_code_key" ON "properties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "property_reviews_bookingId_key" ON "property_reviews"("bookingId");

-- CreateIndex
CREATE INDEX "property_reviews_propertyId_idx" ON "property_reviews"("propertyId");

-- CreateIndex
CREATE INDEX "property_reviews_customerId_idx" ON "property_reviews"("customerId");

-- CreateIndex
CREATE INDEX "kyc_submissions_userId_idx" ON "kyc_submissions"("userId");

-- CreateIndex
CREATE INDEX "kyc_submissions_status_idx" ON "kyc_submissions"("status");

-- CreateIndex
CREATE INDEX "kyc_uploads_submissionId_idx" ON "kyc_uploads"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_uploads_submissionId_type_key" ON "kyc_uploads"("submissionId", "type");

-- CreateIndex
CREATE INDEX "subscriptions_userId_idx" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "subscriptions_status_endsAt_idx" ON "subscriptions"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_sessions_invoiceNumber_key" ON "payment_sessions"("invoiceNumber");

-- CreateIndex
CREATE INDEX "payment_sessions_userId_createdAt_idx" ON "payment_sessions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "payment_sessions_submissionId_idx" ON "payment_sessions"("submissionId");

-- CreateIndex
CREATE INDEX "payment_sessions_status_expiresAt_idx" ON "payment_sessions"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_locks" ADD CONSTRAINT "calendar_locks_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_reviews" ADD CONSTRAINT "property_reviews_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_reviews" ADD CONSTRAINT "property_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_reviews" ADD CONSTRAINT "property_reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_uploads" ADD CONSTRAINT "kyc_uploads_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "kyc_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "kyc_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "billing_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
