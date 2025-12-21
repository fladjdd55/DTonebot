/*
  Warnings:

  - You are about to drop the column `emailVerified` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `password` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `resetExpires` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `resetToken` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorBackupCodes` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorEnabled` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorSecret` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorTempSecret` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `verifyExpires` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `verifyToken` on the `transactions` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[verifyToken]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[resetToken]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "transactions_resetToken_key";

-- DropIndex
DROP INDEX "transactions_verifyToken_key";

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "emailVerified",
DROP COLUMN "password",
DROP COLUMN "resetExpires",
DROP COLUMN "resetToken",
DROP COLUMN "twoFactorBackupCodes",
DROP COLUMN "twoFactorEnabled",
DROP COLUMN "twoFactorSecret",
DROP COLUMN "twoFactorTempSecret",
DROP COLUMN "verifyExpires",
DROP COLUMN "verifyToken";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resetExpires" TIMESTAMP(3),
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "twoFactorBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT,
ADD COLUMN     "twoFactorTempSecret" TEXT,
ADD COLUMN     "verifyExpires" TIMESTAMP(3),
ADD COLUMN     "verifyToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_verifyToken_key" ON "users"("verifyToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_resetToken_key" ON "users"("resetToken");
