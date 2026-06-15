-- Customer-web fields: slug + denormalized review aggregates.
-- Plus indexes for common public filter patterns.

-- 1) Add nullable slug first, backfill, then enforce NOT NULL + UNIQUE.
ALTER TABLE "properties" ADD COLUMN "slug" TEXT;

-- Backfill slug from name + code (lowercase, kebab-cased, Vietnamese-to-ASCII via translate).
UPDATE "properties"
SET "slug" = trim(BOTH '-' FROM
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            "name" || '-' || "code",
            'àáạảãâầấậẩẫăằắặẳẵÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴèéẹẻẽêềếệểễÈÉẸẺẼÊỀẾỆỂỄìíịỉĩÌÍỊỈĨòóọỏõôồốộổỗơờớợởỡÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠùúụủũưừứựửữÙÚỤỦŨƯỪỨỰỬỮỳýỵỷỹỲÝỴỶỸđĐ',
            'aaaaaaaaaaaaaaaaaAAAAAAAAAAAAAAAAAeeeeeeeeeeeEEEEEEEEEEEiiiiiIIIIIooooooooooooooooooOOOOOOOOOOOOOOOOOuuuuuuuuuuuUUUUUUUUUUUyyyyyYYYYYdD'
          )
        ),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
)
WHERE "slug" IS NULL;

-- Belt-and-suspenders: if any duplicates slip through, append id suffix.
WITH dupes AS (
  SELECT id, slug,
         row_number() OVER (PARTITION BY slug ORDER BY "createdAt") AS rn
  FROM "properties"
)
UPDATE "properties" p
SET "slug" = p."slug" || '-' || substring(p.id, 1, 6)
FROM dupes d
WHERE p.id = d.id AND d.rn > 1;

ALTER TABLE "properties" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "properties_slug_key" ON "properties"("slug");

-- 2) Floor area (m²) — optional. FE customer hiển thị null nếu owner bỏ trống.
ALTER TABLE "properties" ADD COLUMN "floorArea" INTEGER;

-- 3) Denormalized review aggregates.
ALTER TABLE "properties" ADD COLUMN "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "properties" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill review aggregates from existing visible reviews.
UPDATE "properties" p
SET "ratingAvg" = sub."avg",
    "reviewCount" = sub."cnt"
FROM (
  SELECT "propertyId",
         ROUND(AVG("avgRating")::numeric, 2)::double precision AS "avg",
         COUNT(*)::int AS "cnt"
  FROM "property_reviews"
  WHERE "isHidden" = false
  GROUP BY "propertyId"
) sub
WHERE p.id = sub."propertyId";

-- 4) Indexes for common public filter patterns.
CREATE INDEX "properties_isActive_deletedAt_idx" ON "properties"("isActive", "deletedAt");
CREATE INDEX "properties_type_idx" ON "properties"("type");
