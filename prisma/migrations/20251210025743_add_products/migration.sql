-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "amount" REAL,
    "currency" TEXT NOT NULL,
    "minAmount" REAL,
    "maxAmount" REAL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Product_operatorId_idx" ON "Product"("operatorId");
