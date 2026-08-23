/*
  Warnings:

  - A unique constraint covering the columns `[branchId,programType,effectiveFrom]` on the table `IncentiveProgramRuleVersion` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[branchId,programType,effectiveFrom]` on the table `IncentiveProgramScheduleVersion` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `branchId` to the `IncentiveProgramRuleVersion` table without a default value. This is not possible if the table is not empty.
  - Added the required column `branchId` to the `IncentiveProgramScheduleVersion` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "IncentiveProgramRuleVersion_programType_effectiveFrom_key";

-- DropIndex
DROP INDEX "IncentiveProgramScheduleVersion_programType_effectiveFrom_key";

-- AlterTable
ALTER TABLE "IncentiveProgramRuleVersion" ADD COLUMN     "branchId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "IncentiveProgramScheduleVersion" ADD COLUMN     "branchId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "IncentiveProgramRuleVersion_branchId_idx" ON "IncentiveProgramRuleVersion"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveProgramRuleVersion_branchId_programType_effectiveF_key" ON "IncentiveProgramRuleVersion"("branchId", "programType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "IncentiveProgramScheduleVersion_branchId_idx" ON "IncentiveProgramScheduleVersion"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveProgramScheduleVersion_branchId_programType_effect_key" ON "IncentiveProgramScheduleVersion"("branchId", "programType", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "IncentiveProgramRuleVersion" ADD CONSTRAINT "IncentiveProgramRuleVersion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveProgramScheduleVersion" ADD CONSTRAINT "IncentiveProgramScheduleVersion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
