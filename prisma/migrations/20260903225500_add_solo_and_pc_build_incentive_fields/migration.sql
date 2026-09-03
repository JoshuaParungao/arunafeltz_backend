-- AlterTable
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "soloSaleEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "soloSaleRatePercent" DECIMAL(7,4);
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "pcBuildEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IncentiveAccountConfigVersion" ADD COLUMN IF NOT EXISTS "pcBuildRatePercent" DECIMAL(7,4);
