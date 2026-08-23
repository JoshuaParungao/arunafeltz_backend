-- CreateEnum
CREATE TYPE "ServiceJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'READY_FOR_RELEASE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ServiceJob" (
    "id" TEXT NOT NULL,
    "jobCode" TEXT NOT NULL,
    "status" "ServiceJobStatus" NOT NULL DEFAULT 'PENDING',
    "jobTitle" TEXT NOT NULL,
    "deviceDescription" TEXT,
    "problemDescription" TEXT,
    "diagnosis" TEXT,
    "serviceNotes" TEXT,
    "estimatedServiceCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalServiceCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "assignedTechnicianId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceJob_branchId_idx" ON "ServiceJob"("branchId");

-- CreateIndex
CREATE INDEX "ServiceJob_customerId_idx" ON "ServiceJob"("customerId");

-- CreateIndex
CREATE INDEX "ServiceJob_assignedTechnicianId_idx" ON "ServiceJob"("assignedTechnicianId");

-- CreateIndex
CREATE INDEX "ServiceJob_status_idx" ON "ServiceJob"("status");

-- CreateIndex
CREATE INDEX "ServiceJob_receivedAt_idx" ON "ServiceJob"("receivedAt");

-- CreateIndex
CREATE INDEX "ServiceJob_createdById_idx" ON "ServiceJob"("createdById");

-- CreateIndex
CREATE INDEX "ServiceJob_updatedById_idx" ON "ServiceJob"("updatedById");

-- CreateIndex
CREATE INDEX "ServiceJob_cancelledById_idx" ON "ServiceJob"("cancelledById");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJob_branchId_jobCode_key" ON "ServiceJob"("branchId", "jobCode");

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
