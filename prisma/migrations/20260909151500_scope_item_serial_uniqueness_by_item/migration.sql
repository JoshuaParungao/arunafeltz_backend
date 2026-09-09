-- DropIndex
DROP INDEX IF EXISTS "ItemSerial_branchId_serialNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "ItemSerial_branchId_itemId_serialNumber_key" ON "ItemSerial"("branchId", "itemId", "serialNumber");

-- CreateIndex
CREATE INDEX "ItemSerial_serialNumber_idx" ON "ItemSerial"("serialNumber");
