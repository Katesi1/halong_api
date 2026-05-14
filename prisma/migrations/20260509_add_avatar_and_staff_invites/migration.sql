-- AlterTable: add avatar field
ALTER TABLE "users" ADD COLUMN "avatar" TEXT;

-- CreateTable
CREATE TABLE "staff_invites" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_invites_token_key" ON "staff_invites"("token");
CREATE UNIQUE INDEX "staff_invites_shortCode_key" ON "staff_invites"("shortCode");
CREATE UNIQUE INDEX "staff_invites_acceptedUserId_key" ON "staff_invites"("acceptedUserId");
CREATE INDEX "staff_invites_ownerId_status_idx" ON "staff_invites"("ownerId", "status");
CREATE INDEX "staff_invites_email_status_idx" ON "staff_invites"("email", "status");

-- AddForeignKey
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_acceptedUserId_fkey" FOREIGN KEY ("acceptedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
