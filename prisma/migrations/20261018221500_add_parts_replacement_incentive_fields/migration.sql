-- AlterTable
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "ordinaryPartsRepairEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "ordinaryPartsRepairRatePercent" DECIMAL(7,4);
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "boardPartsRepairEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "boardPartsRepairRatePercent" DECIMAL(7,4);
