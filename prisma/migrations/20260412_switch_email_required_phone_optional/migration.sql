-- Switch: email becomes required, phone becomes optional
-- Step 1: Ensure all existing users have an email (fill placeholder if null)
UPDATE "users" SET "email" = CONCAT('user_', "id", '@placeholder.local') WHERE "email" IS NULL;

-- Step 2: Make email NOT NULL
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;

-- Step 3: Make phone nullable
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
