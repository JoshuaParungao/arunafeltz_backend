-- CreateEnum
CREATE TYPE "SettingCategory" AS ENUM ('BUSINESS_RULE', 'OPERATION', 'DOCUMENT', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ARRAY');

-- CreateTable
CREATE TABLE "BusinessSetting" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" "SettingCategory" NOT NULL,
    "valueType" "SettingValueType" NOT NULL,
    "value" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessSetting_scopeKey_key" ON "BusinessSetting"("scopeKey");

-- CreateIndex
CREATE INDEX "BusinessSetting_key_idx" ON "BusinessSetting"("key");

-- CreateIndex
CREATE INDEX "BusinessSetting_category_idx" ON "BusinessSetting"("category");

-- CreateIndex
CREATE INDEX "BusinessSetting_valueType_idx" ON "BusinessSetting"("valueType");

-- CreateIndex
CREATE INDEX "BusinessSetting_branchId_idx" ON "BusinessSetting"("branchId");

-- CreateIndex
CREATE INDEX "BusinessSetting_isActive_idx" ON "BusinessSetting"("isActive");

-- CreateIndex
CREATE INDEX "BusinessSetting_updatedById_idx" ON "BusinessSetting"("updatedById");

-- CreateIndex
CREATE INDEX "BusinessSetting_category_isActive_idx" ON "BusinessSetting"("category", "isActive");

-- AddForeignKey
ALTER TABLE "BusinessSetting" ADD CONSTRAINT "BusinessSetting_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessSetting" ADD CONSTRAINT "BusinessSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
