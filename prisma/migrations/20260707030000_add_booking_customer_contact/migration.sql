-- Thông tin liên hệ đầy đủ + tách người lớn/trẻ em cho booking luồng khách (customer-hold).
-- Additive, nullable — không phá booking cũ.
ALTER TABLE "bookings" ADD COLUMN "customerEmail" TEXT;
ALTER TABLE "bookings" ADD COLUMN "adults" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "children" INTEGER;
