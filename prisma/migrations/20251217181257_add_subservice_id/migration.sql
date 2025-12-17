/*
  Warnings:

  - You are about to drop the column `category` on the `products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "products" DROP COLUMN "category",
ADD COLUMN     "subserviceId" INTEGER;

-- CreateIndex
CREATE INDEX "products_serviceId_subserviceId_idx" ON "products"("serviceId", "subserviceId");
