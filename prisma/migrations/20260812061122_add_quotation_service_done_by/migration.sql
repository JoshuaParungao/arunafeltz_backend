-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "serviceDoneById" TEXT;

-- CreateIndex
CREATE INDEX "Quotation_serviceDoneById_idx" ON "Quotation"("serviceDoneById");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_serviceDoneById_fkey" FOREIGN KEY ("serviceDoneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
