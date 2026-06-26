-- Display-only fields. Không dùng để filter list public (theo yêu cầu FE).
-- Owner điền tay qua form admin/owner.
ALTER TABLE "properties" ADD COLUMN "city" TEXT;
ALTER TABLE "properties" ADD COLUMN "district" TEXT;
