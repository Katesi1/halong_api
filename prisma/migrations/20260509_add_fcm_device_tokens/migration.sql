-- CreateTable
CREATE TABLE "fcm_device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fcm_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fcm_device_tokens_token_key" ON "fcm_device_tokens"("token");
CREATE INDEX "fcm_device_tokens_userId_idx" ON "fcm_device_tokens"("userId");

-- AddForeignKey
ALTER TABLE "fcm_device_tokens" ADD CONSTRAINT "fcm_device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
