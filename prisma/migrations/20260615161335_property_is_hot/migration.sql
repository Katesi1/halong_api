-- Admin curated "hot" badge.
ALTER TABLE "properties" ADD COLUMN "isHot" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "properties_isHot_idx" ON "properties"("isHot");
