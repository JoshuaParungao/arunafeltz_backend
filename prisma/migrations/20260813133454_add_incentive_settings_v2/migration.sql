-- CreateEnum
CREATE TYPE "IncentiveProgramType" AS ENUM ('ITEM_SALE', 'ORDINARY_REPAIR', 'BOARD_LEVEL_REPAIR');

-- CreateTable
CREATE TABLE "IncentiveAccountConfigVersion" (
    "id" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "classificationSnapshot" "IncentiveClassification" NOT NULL,
    "itemEnabled" BOOLEAN NOT NULL DEFAULT false,
    "itemRatePercent" DECIMAL(7,4),
    "ordinaryRepairEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ordinaryRepairRatePercent" DECIMAL(7,4),
    "boardRepairEnabled" BOOLEAN NOT NULL DEFAULT false,
    "boardRepairRatePercent" DECIMAL(7,4),
    "repairFee" DECIMAL(12,2),
    "notes" TEXT,
    "accountId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveAccountConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveProgramRuleVersion" (
    "id" TEXT NOT NULL,
    "programType" "IncentiveProgramType" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "eligiblePriceTiers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "repairCostPercent" DECIMAL(7,4),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveProgramRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveProgramScheduleVersion" (
    "id" TEXT NOT NULL,
    "programType" "IncentiveProgramType" NOT NULL,
    "scheduleType" "IncentiveScheduleType" NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "everyNDays" INTEGER,
    "claimOpenAfterDays" INTEGER NOT NULL,
    "claimWindowDays" INTEGER NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncentiveProgramScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncentiveAccountConfigVersion_accountId_effectiveFrom_idx" ON "IncentiveAccountConfigVersion"("accountId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "IncentiveAccountConfigVersion_classificationSnapshot_idx" ON "IncentiveAccountConfigVersion"("classificationSnapshot");

-- CreateIndex
CREATE INDEX "IncentiveAccountConfigVersion_createdById_idx" ON "IncentiveAccountConfigVersion"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveAccountConfigVersion_accountId_effectiveFrom_key" ON "IncentiveAccountConfigVersion"("accountId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "IncentiveProgramRuleVersion_programType_effectiveFrom_idx" ON "IncentiveProgramRuleVersion"("programType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "IncentiveProgramRuleVersion_createdById_idx" ON "IncentiveProgramRuleVersion"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveProgramRuleVersion_programType_effectiveFrom_key" ON "IncentiveProgramRuleVersion"("programType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "IncentiveProgramScheduleVersion_programType_effectiveFrom_idx" ON "IncentiveProgramScheduleVersion"("programType", "effectiveFrom");

-- CreateIndex
CREATE INDEX "IncentiveProgramScheduleVersion_scheduleType_idx" ON "IncentiveProgramScheduleVersion"("scheduleType");

-- CreateIndex
CREATE INDEX "IncentiveProgramScheduleVersion_createdById_idx" ON "IncentiveProgramScheduleVersion"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "IncentiveProgramScheduleVersion_programType_effectiveFrom_key" ON "IncentiveProgramScheduleVersion"("programType", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "IncentiveAccountConfigVersion" ADD CONSTRAINT "IncentiveAccountConfigVersion_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveAccountConfigVersion" ADD CONSTRAINT "IncentiveAccountConfigVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveProgramRuleVersion" ADD CONSTRAINT "IncentiveProgramRuleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveProgramScheduleVersion" ADD CONSTRAINT "IncentiveProgramScheduleVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
