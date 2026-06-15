-- Per-user property favorites (wishlist / heart icon).

CREATE TABLE "user_favorite_properties" (
    "userId"     TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_properties_pkey" PRIMARY KEY ("userId", "propertyId")
);

CREATE INDEX "user_favorite_properties_userId_createdAt_idx"
    ON "user_favorite_properties"("userId", "createdAt");

CREATE INDEX "user_favorite_properties_propertyId_idx"
    ON "user_favorite_properties"("propertyId");

ALTER TABLE "user_favorite_properties"
    ADD CONSTRAINT "user_favorite_properties_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_favorite_properties"
    ADD CONSTRAINT "user_favorite_properties_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
