-- Platform receiving bank (STK nhận tiền mua gói / subscription). Singleton row id='default'.
-- Additive, non-destructive. Chưa có row → PaymentService fallback về env BANK_*.
CREATE TABLE "payment_bank_account" (
    "id" TEXT NOT NULL,
    "bankBin" TEXT NOT NULL,
    "bankName" TEXT,
    "bankAccountNumber" TEXT NOT NULL,
    "bankAccountName" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_bank_account_pkey" PRIMARY KEY ("id")
);
