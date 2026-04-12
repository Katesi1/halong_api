-- Add ownerId column to users table (SALE → OWNER relationship)
ALTER TABLE "users" ADD COLUMN "ownerId" TEXT;

-- Add foreign key constraint
ALTER TABLE "users" ADD CONSTRAINT "users_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
