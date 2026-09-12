-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "attributes" JSONB;

-- AlterTable
ALTER TABLE "ItemCategory" ADD COLUMN     "attributeSchema" JSONB,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "ItemCategory_parentId_idx" ON "ItemCategory"("parentId");

-- AddForeignKey
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
