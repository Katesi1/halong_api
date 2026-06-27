-- AlterTable
ALTER TABLE "staff_invites" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'owner';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'owner';
