/*
  Warnings:

  - A unique constraint covering the columns `[shop_id,receipt_number]` on the table `sales` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "sales_receipt_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "sales_shop_id_receipt_number_key" ON "sales"("shop_id", "receipt_number");
