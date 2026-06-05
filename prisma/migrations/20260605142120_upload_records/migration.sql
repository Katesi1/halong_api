-- CreateTable
CREATE TABLE "upload_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'chat/attachments',
    "attachedAt" TIMESTAMP(3),
    "attachedMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "upload_records_userId_createdAt_idx" ON "upload_records"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "upload_records_attachedAt_createdAt_idx" ON "upload_records"("attachedAt", "createdAt");

-- CreateIndex
CREATE INDEX "upload_records_attachedMessageId_idx" ON "upload_records"("attachedMessageId");
