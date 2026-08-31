-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "priceTier" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Customer_priceTier_idx" ON "Customer"("priceTier");
