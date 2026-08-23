-- CreateEnum
CREATE TYPE "StockTransferFulfillmentMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "StockTransferFulfillmentStatus" AS ENUM ('PENDING', 'PREPARING', 'READY_FOR_PICKUP', 'IN_TRANSIT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "StockTransferPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "StockTransferPaymentMethod" AS ENUM ('CASH', 'GCASH', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "StockTransferSettlementStatus" AS ENUM ('POSTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ItemSerialStatus" ADD VALUE 'IN_TRANSIT';

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "amountPaid" DECIMAL(12,2),
ADD COLUMN     "deliveryCharge" DECIMAL(12,2),
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "dispatchedById" TEXT,
ADD COLUMN     "fulfillmentMethod" "StockTransferFulfillmentMethod",
ADD COLUMN     "fulfillmentReference" TEXT,
ADD COLUMN     "fulfillmentStatus" "StockTransferFulfillmentStatus",
ADD COLUMN     "grandTotal" DECIMAL(12,2),
ADD COLUMN     "itemSubtotal" DECIMAL(12,2),
ADD COLUMN     "paymentStatus" "StockTransferPaymentStatus",
ADD COLUMN     "preparingAt" TIMESTAMP(3),
ADD COLUMN     "readyForPickupAt" TIMESTAMP(3),
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "workflowVersion" INTEGER;

-- AlterTable
ALTER TABLE "StockTransferSerial" ADD COLUMN     "dispatchAllocationId" TEXT;

-- CreateTable
CREATE TABLE "StockTransferDispatchAllocation" (
    "id" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "acquisitionUnitCostSnapshot" DECIMAL(12,2) NOT NULL,
    "sourceOperationalUnitCostSnapshot" DECIMAL(12,2) NOT NULL,
    "destinationOperationalUnitCostSnapshot" DECIMAL(12,2) NOT NULL,
    "transferAmount" DECIMAL(12,2) NOT NULL,
    "stockTransferItemId" TEXT NOT NULL,
    "sourceBatchId" TEXT NOT NULL,
    "finalAllocationId" TEXT,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransferDispatchAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferSettlement" (
    "id" TEXT NOT NULL,
    "status" "StockTransferSettlementStatus" NOT NULL DEFAULT 'POSTED',
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "StockTransferPaymentMethod" NOT NULL,
    "referenceNo" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledByName" TEXT,
    "cancellationReason" TEXT,
    "stockTransferId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransferSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockTransferDispatchAllocation_finalAllocationId_key" ON "StockTransferDispatchAllocation"("finalAllocationId");

-- CreateIndex
CREATE INDEX "StockTransferDispatchAllocation_stockTransferItemId_idx" ON "StockTransferDispatchAllocation"("stockTransferItemId");

-- CreateIndex
CREATE INDEX "StockTransferDispatchAllocation_sourceBatchId_idx" ON "StockTransferDispatchAllocation"("sourceBatchId");

-- CreateIndex
CREATE INDEX "StockTransferDispatchAllocation_dispatchedAt_idx" ON "StockTransferDispatchAllocation"("dispatchedAt");

-- CreateIndex
CREATE INDEX "StockTransferDispatchAllocation_receivedAt_idx" ON "StockTransferDispatchAllocation"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransferDispatchAllocation_stockTransferItemId_sourceB_key" ON "StockTransferDispatchAllocation"("stockTransferItemId", "sourceBatchId");

-- CreateIndex
CREATE INDEX "StockTransferSettlement_stockTransferId_idx" ON "StockTransferSettlement"("stockTransferId");

-- CreateIndex
CREATE INDEX "StockTransferSettlement_stockTransferId_status_idx" ON "StockTransferSettlement"("stockTransferId", "status");

-- CreateIndex
CREATE INDEX "StockTransferSettlement_paidAt_idx" ON "StockTransferSettlement"("paidAt");

-- CreateIndex
CREATE INDEX "StockTransferSettlement_recordedById_idx" ON "StockTransferSettlement"("recordedById");

-- CreateIndex
CREATE INDEX "StockTransferSettlement_status_idx" ON "StockTransferSettlement"("status");

-- CreateIndex
CREATE INDEX "StockTransfer_fulfillmentStatus_idx" ON "StockTransfer"("fulfillmentStatus");

-- CreateIndex
CREATE INDEX "StockTransfer_paymentStatus_idx" ON "StockTransfer"("paymentStatus");

-- CreateIndex
CREATE INDEX "StockTransfer_workflowVersion_idx" ON "StockTransfer"("workflowVersion");

-- CreateIndex
CREATE INDEX "StockTransfer_dispatchedAt_idx" ON "StockTransfer"("dispatchedAt");

-- CreateIndex
CREATE INDEX "StockTransfer_receivedAt_idx" ON "StockTransfer"("receivedAt");

-- CreateIndex
CREATE INDEX "StockTransferSerial_dispatchAllocationId_idx" ON "StockTransferSerial"("dispatchAllocationId");

-- AddForeignKey
ALTER TABLE "StockTransferSerial" ADD CONSTRAINT "StockTransferSerial_dispatchAllocationId_fkey" FOREIGN KEY ("dispatchAllocationId") REFERENCES "StockTransferDispatchAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferDispatchAllocation" ADD CONSTRAINT "StockTransferDispatchAllocation_stockTransferItemId_fkey" FOREIGN KEY ("stockTransferItemId") REFERENCES "StockTransferItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferDispatchAllocation" ADD CONSTRAINT "StockTransferDispatchAllocation_sourceBatchId_fkey" FOREIGN KEY ("sourceBatchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferDispatchAllocation" ADD CONSTRAINT "StockTransferDispatchAllocation_finalAllocationId_fkey" FOREIGN KEY ("finalAllocationId") REFERENCES "StockTransferAllocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferSettlement" ADD CONSTRAINT "StockTransferSettlement_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- ============================================================
-- Arunafeltz Stock Transfer V2 business integrity constraints
-- Added before first deployment.
-- ============================================================

-- Legacy rows remain valid with workflowVersion NULL.
-- New V2 rows must explicitly identify themselves as version 2.
ALTER TABLE "StockTransfer"
ADD CONSTRAINT "StockTransfer_v2_version_chk"
CHECK (
    "workflowVersion" IS NULL
    OR "workflowVersion" = 2
);

-- A V2 transfer must have its fulfillment and financial summary.
ALTER TABLE "StockTransfer"
ADD CONSTRAINT "StockTransfer_v2_workflow_chk"
CHECK (
    "workflowVersion" IS NULL
    OR (
        "workflowVersion" = 2
        AND "fulfillmentMethod" IS NOT NULL
        AND "fulfillmentStatus" IS NOT NULL
        AND "itemSubtotal" IS NOT NULL
        AND "deliveryCharge" IS NOT NULL
        AND "grandTotal" IS NOT NULL
        AND "amountPaid" IS NOT NULL
        AND "paymentStatus" IS NOT NULL
    )
);

-- Money values can never be negative.
ALTER TABLE "StockTransfer"
ADD CONSTRAINT "StockTransfer_v2_amounts_chk"
CHECK (
    ("itemSubtotal" IS NULL OR "itemSubtotal" >= 0)
    AND ("deliveryCharge" IS NULL OR "deliveryCharge" >= 0)
    AND ("grandTotal" IS NULL OR "grandTotal" >= 0)
    AND ("amountPaid" IS NULL OR "amountPaid" >= 0)
);

-- Header total must always equal item subtotal plus delivery.
ALTER TABLE "StockTransfer"
ADD CONSTRAINT "StockTransfer_v2_total_chk"
CHECK (
    "workflowVersion" IS NULL
    OR "grandTotal" = ROUND(
        "itemSubtotal" + "deliveryCharge",
        2
    )
);

-- Payment status must agree with the actual amount paid.
ALTER TABLE "StockTransfer"
ADD CONSTRAINT "StockTransfer_v2_payment_chk"
CHECK (
    "workflowVersion" IS NULL
    OR (
        (
            "paymentStatus" = 'UNPAID'
            AND "grandTotal" > 0
            AND "amountPaid" = 0
        )
        OR (
            "paymentStatus" = 'PARTIALLY_PAID'
            AND "amountPaid" > 0
            AND "amountPaid" < "grandTotal"
        )
        OR (
            "paymentStatus" = 'PAID'
            AND "amountPaid" = "grandTotal"
        )
    )
);

-- Pickup has no delivery charge and never uses delivery transit.
-- Delivery never uses READY_FOR_PICKUP.
ALTER TABLE "StockTransfer"
ADD CONSTRAINT "StockTransfer_v2_fulfillment_chk"
CHECK (
    "workflowVersion" IS NULL
    OR (
        (
            "fulfillmentMethod" = 'PICKUP'
            AND "deliveryCharge" = 0
            AND "fulfillmentStatus" <> 'IN_TRANSIT'
        )
        OR (
            "fulfillmentMethod" = 'DELIVERY'
            AND "fulfillmentStatus" <> 'READY_FOR_PICKUP'
        )
    )
);

-- A dispatch allocation represents an actual positive quantity.
ALTER TABLE "StockTransferDispatchAllocation"
ADD CONSTRAINT "STDispatch_quantity_chk"
CHECK (
    "quantity" > 0
);

-- Cost provenance and transfer value cannot be negative.
ALTER TABLE "StockTransferDispatchAllocation"
ADD CONSTRAINT "STDispatch_costs_chk"
CHECK (
    "acquisitionUnitCostSnapshot" >= 0
    AND "sourceOperationalUnitCostSnapshot" >= 0
    AND "destinationOperationalUnitCostSnapshot" >= 0
    AND "transferAmount" >= 0
);

-- Destination operational cost is the locked Transfer Cost / Unit.
ALTER TABLE "StockTransferDispatchAllocation"
ADD CONSTRAINT "STDispatch_amount_chk"
CHECK (
    "transferAmount" = ROUND(
        "quantity" * "destinationOperationalUnitCostSnapshot",
        2
    )
);

-- Payment/settlement records must always contain a positive amount.
ALTER TABLE "StockTransferSettlement"
ADD CONSTRAINT "STSettlement_amount_chk"
CHECK (
    "amount" > 0
);

-- Settlement cancellation is reversal-style, never silent deletion.
ALTER TABLE "StockTransferSettlement"
ADD CONSTRAINT "STSettlement_cancel_chk"
CHECK (
    (
        "status" = 'POSTED'
        AND "cancelledAt" IS NULL
        AND "cancellationReason" IS NULL
    )
    OR
    (
        "status" = 'CANCELLED'
        AND "cancelledAt" IS NOT NULL
        AND NULLIF(BTRIM("cancellationReason"), '') IS NOT NULL
    )
);
