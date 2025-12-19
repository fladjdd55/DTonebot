/*
  Warnings:

  - You are about to drop the `rate_limits` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable
DROP TABLE "rate_limits";
