-- CreateTable
CREATE TABLE "yachts" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "cabins" INTEGER NOT NULL DEFAULT 1,
    "standardGuests" INTEGER NOT NULL DEFAULT 2,
    "standardChildren" INTEGER NOT NULL DEFAULT 0,
    "maxGuests" INTEGER NOT NULL DEFAULT 2,
    "lengthMeters" DOUBLE PRECISION,
    "shipType" TEXT,
    "departurePoint" TEXT,
    "durationText" TEXT,
    "itinerary" JSONB,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rules" TEXT,
    "cancellationPolicy" INTEGER NOT NULL DEFAULT 0,
    "checkInTime" TEXT DEFAULT '12:00',
    "checkOutTime" TEXT DEFAULT '11:00',
    "weekdayPrice" DOUBLE PRECISION,
    "weekendPrice" DOUBLE PRECISION,
    "holidayPrice" DOUBLE PRECISION,
    "adultSurcharge" DOUBLE PRECISION,
    "childSurcharge" DOUBLE PRECISION,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "yachts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yacht_images" (
    "id" TEXT NOT NULL,
    "yachtId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "yacht_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yacht_bookings" (
    "id" TEXT NOT NULL,
    "yachtId" TEXT NOT NULL,
    "saleId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "adults" INTEGER,
    "children" INTEGER,
    "checkinDate" TIMESTAMP(3) NOT NULL,
    "checkoutDate" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER,
    "paidAmount" INTEGER,
    "paidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "cancelledByRole" INTEGER,
    "cancelledReason" TEXT,
    "guestCount" INTEGER NOT NULL DEFAULT 2,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yacht_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yacht_calendar_locks" (
    "id" TEXT NOT NULL,
    "yachtId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "yacht_calendar_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "yachts_slug_key" ON "yachts"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "yachts_code_key" ON "yachts"("code");

-- CreateIndex
CREATE INDEX "yachts_isActive_deletedAt_idx" ON "yachts"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "yachts_createdById_idx" ON "yachts"("createdById");

-- CreateIndex
CREATE INDEX "yacht_images_yachtId_idx" ON "yacht_images"("yachtId");

-- CreateIndex
CREATE INDEX "yacht_bookings_yachtId_status_idx" ON "yacht_bookings"("yachtId", "status");

-- CreateIndex
CREATE INDEX "yacht_bookings_customerId_idx" ON "yacht_bookings"("customerId");

-- CreateIndex
CREATE INDEX "yacht_bookings_saleId_idx" ON "yacht_bookings"("saleId");

-- CreateIndex
CREATE INDEX "yacht_bookings_checkinDate_checkoutDate_idx" ON "yacht_bookings"("checkinDate", "checkoutDate");

-- CreateIndex
CREATE INDEX "yacht_calendar_locks_yachtId_date_idx" ON "yacht_calendar_locks"("yachtId", "date");

-- AddForeignKey
ALTER TABLE "yacht_images" ADD CONSTRAINT "yacht_images_yachtId_fkey" FOREIGN KEY ("yachtId") REFERENCES "yachts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yacht_bookings" ADD CONSTRAINT "yacht_bookings_yachtId_fkey" FOREIGN KEY ("yachtId") REFERENCES "yachts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yacht_calendar_locks" ADD CONSTRAINT "yacht_calendar_locks_yachtId_fkey" FOREIGN KEY ("yachtId") REFERENCES "yachts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

