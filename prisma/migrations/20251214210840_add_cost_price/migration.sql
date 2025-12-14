-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costCurrency" TEXT DEFAULT 'USD',
ADD COLUMN     "costPrice" DOUBLE PRECISION;
