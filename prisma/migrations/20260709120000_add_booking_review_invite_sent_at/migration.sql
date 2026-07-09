-- Email mời đánh giá lúc 12h trưa ngày checkout: cột đánh dấu đã gửi (chống gửi trùng). Additive, nullable.
ALTER TABLE "bookings" ADD COLUMN "reviewInviteSentAt" TIMESTAMP(3);
