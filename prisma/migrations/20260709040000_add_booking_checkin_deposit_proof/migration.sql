-- Check-in flow: owner xác nhận check-in + ảnh bill cọc khách gửi. Additive, nullable.
ALTER TABLE "bookings" ADD COLUMN "checkedInAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "depositProofUrl" TEXT;
