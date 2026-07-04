-- Perf indexes: tăng tốc calendar grid, availability search, booking list.
-- Postgres KHÔNG tự tạo index cho FK, nên các cột filter hot-path phải khai báo tường minh.
-- Bảng hiện nhỏ nên CREATE INDEX chạy tức thì; không cần CONCURRENTLY.

-- CreateIndex
CREATE INDEX "bookings_propertyId_status_idx" ON "bookings"("propertyId", "status");

-- CreateIndex
CREATE INDEX "bookings_checkinDate_checkoutDate_idx" ON "bookings"("checkinDate", "checkoutDate");

-- CreateIndex
CREATE INDEX "bookings_saleId_idx" ON "bookings"("saleId");

-- CreateIndex
CREATE INDEX "bookings_customerId_idx" ON "bookings"("customerId");

-- CreateIndex
CREATE INDEX "properties_ownerId_idx" ON "properties"("ownerId");

-- CreateIndex: GIN cho cột array amenities → tăng tốc lọc `amenities @> ARRAY[...]` (Prisma hasEvery/hasSome).
CREATE INDEX "properties_amenities_idx" ON "properties" USING GIN ("amenities");
