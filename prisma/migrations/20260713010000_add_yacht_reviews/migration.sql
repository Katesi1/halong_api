-- CreateTable
CREATE TABLE "yacht_reviews" (
    "id" TEXT NOT NULL,
    "yachtId" TEXT NOT NULL,
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
    "reply" TEXT,
    "replyAt" TIMESTAMP(3),
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yacht_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "yacht_reviews_bookingId_key" ON "yacht_reviews"("bookingId");

-- CreateIndex
CREATE INDEX "yacht_reviews_yachtId_idx" ON "yacht_reviews"("yachtId");

-- CreateIndex
CREATE INDEX "yacht_reviews_customerId_idx" ON "yacht_reviews"("customerId");

-- AddForeignKey
ALTER TABLE "yacht_reviews" ADD CONSTRAINT "yacht_reviews_yachtId_fkey" FOREIGN KEY ("yachtId") REFERENCES "yachts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

