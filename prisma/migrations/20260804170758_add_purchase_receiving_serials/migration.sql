-- CreateTable
CREATE TABLE "PurchaseReceivingSerial" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "purchaseReceivingItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReceivingSerial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseReceivingSerial_purchaseReceivingItemId_idx" ON "PurchaseReceivingSerial"("purchaseReceivingItemId");

-- CreateIndex
CREATE INDEX "PurchaseReceivingSerial_serialNumber_idx" ON "PurchaseReceivingSerial"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceivingSerial_purchaseReceivingItemId_serialNumbe_key" ON "PurchaseReceivingSerial"("purchaseReceivingItemId", "serialNumber");

-- AddForeignKey
ALTER TABLE "PurchaseReceivingSerial" ADD CONSTRAINT "PurchaseReceivingSerial_purchaseReceivingItemId_fkey" FOREIGN KEY ("purchaseReceivingItemId") REFERENCES "PurchaseReceivingItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
