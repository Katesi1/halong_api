-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('VILLA', 'HOMESTAY', 'APARTMENT', 'HOTEL');

-- CreateEnum
CREATE TYPE "CancellationPolicy" AS ENUM ('FLEXIBLE', 'MODERATE', 'STRICT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING', 'PAYMENT', 'SYSTEM');

-- AlterTable: User - add gender, dateOfBirth
ALTER TABLE "users" ADD COLUMN "gender" TEXT;
ALTER TABLE "users" ADD COLUMN "dateOfBirth" TIMESTAMP(3);

-- AlterTable: Room - add new fields
ALTER TABLE "rooms" ADD COLUMN "type" "RoomType";
ALTER TABLE "rooms" ADD COLUMN "bathrooms" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "rooms" ADD COLUMN "standardGuests" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "rooms" ADD COLUMN "address" TEXT;
ALTER TABLE "rooms" ADD COLUMN "mapLink" TEXT;
ALTER TABLE "rooms" ADD COLUMN "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "rooms" ADD COLUMN "cancellationPolicy" "CancellationPolicy";
ALTER TABLE "rooms" ADD COLUMN "adultSurcharge" DOUBLE PRECISION;
ALTER TABLE "rooms" ADD COLUMN "childSurcharge" DOUBLE PRECISION;

-- CreateTable: Notification
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "targetId" TEXT,
    "targetType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
