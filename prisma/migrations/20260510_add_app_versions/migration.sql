-- CreateTable
CREATE TABLE "app_versions" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "latestVersion" TEXT NOT NULL,
    "minSupportedVersion" TEXT NOT NULL,
    "releaseNotes" TEXT,
    "storeUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_versions_platform_key" ON "app_versions"("platform");

-- Seed initial rows so /app/version doesn't return empty
INSERT INTO "app_versions" ("id", "platform", "latestVersion", "minSupportedVersion", "storeUrl", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'ios', '1.0.0', '1.0.0', 'https://apps.apple.com/app/halong24h', NOW()),
  (gen_random_uuid()::text, 'android', '1.0.0', '1.0.0', 'https://play.google.com/store/apps/details?id=com.halongtravel.halong24h', NOW());
