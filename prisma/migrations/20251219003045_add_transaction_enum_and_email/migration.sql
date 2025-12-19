/*
  Warnings:

  - You are about to drop the column `paymentId` on the `transactions` table. All the data in the column will be lost.
  - The `status` column on the `transactions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `paymentIntentId` on table `transactions` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIALIZED', 'PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'REFUND_FAILED');

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "paymentId",
ADD COLUMN     "email" TEXT,
ALTER COLUMN "paymentIntentId" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "transactions_status_idx" ON "transactions"("status");

-- CreateIndex
CREATE INDEX "transactions_email_idx" ON "transactions"("email");
