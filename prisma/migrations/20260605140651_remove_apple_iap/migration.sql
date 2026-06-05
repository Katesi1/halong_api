/*
  Warnings:

  - You are about to drop the `apple_notifications` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `apple_transactions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "apple_transactions" DROP CONSTRAINT "apple_transactions_userId_fkey";

-- DropTable
DROP TABLE "apple_notifications";

-- DropTable
DROP TABLE "apple_transactions";
