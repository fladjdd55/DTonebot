/*
  Warnings:

  - Added the required column `currency` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `paymentId` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productType` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "mobile" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "productType" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Transaction" ("amount", "createdAt", "externalId", "id", "mobile", "paymentIntentId", "productId", "status", "updatedAt") SELECT "amount", "createdAt", "externalId", "id", "mobile", "paymentIntentId", "productId", "status", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");
CREATE UNIQUE INDEX "Transaction_paymentId_key" ON "Transaction"("paymentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
