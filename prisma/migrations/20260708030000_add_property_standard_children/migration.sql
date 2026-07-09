-- Sức chứa trẻ em tiêu chuẩn cho phòng. Additive, default 0 — không phá phòng cũ.
-- maxGuests vẫn là tối đa cả căn (không tách người lớn/trẻ em).
ALTER TABLE "properties" ADD COLUMN "standardChildren" INTEGER NOT NULL DEFAULT 0;
