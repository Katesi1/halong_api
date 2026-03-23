-- Step 2: Migrate existing OWNER/SALE roles to STAFF
UPDATE "users" SET "role" = 'STAFF' WHERE "role" IN ('OWNER', 'SALE');

-- Step 3: Update default for role column
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF';

-- Step 4: Add new columns to bookings
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "guestCount" INTEGER NOT NULL DEFAULT 2;

-- Step 5: Make saleId nullable (customer bookings don't have saleId)
ALTER TABLE "bookings" ALTER COLUMN "saleId" DROP NOT NULL;

-- Step 6: Add foreign key for customerId
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_customerId_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
