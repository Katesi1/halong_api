-- AlterTable: add appleSub for Apple Sign-In
ALTER TABLE "users" ADD COLUMN "appleSub" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_appleSub_key" ON "users"("appleSub");
