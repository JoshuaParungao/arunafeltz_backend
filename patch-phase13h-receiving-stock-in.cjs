const fs = require("fs");

const servicePath = "./src/modules/purchase-receivings/services/purchaseReceiving.service.js";
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const createPurchaseStockInMovementCode")) {
  const helperBlock = `
const createPurchaseStockInMovementCode = async (tx, branchId, branchCode, itemCode) => {
  const prefix = \`MOV-\${branchCode}-\${itemCode}-PURCHASE-STOCKIN-\`;

  const existingMovements = await tx.inventoryMovement.findMany({
    where: {
      branchId,
      movementCode: {
        startsWith: prefix,
      },
    },
    select: {
      movementCode: true,
    },
  });

  let highestNumber = 0;

  for (const movement of existingMovements) {
    const suffix = movement.movementCode.replace(prefix, "");
    const parsedNumber = Number.parseInt(suffix, 10);

    if (!Number.isNaN(parsedNumber) && parsedNumber > highestNumber) {
      highestNumber = parsedNumber;
    }
  }

  return \`\${prefix}\${String(highestNumber + 1).padStart(5, "0")}\`;
};

const postReceivingStockIn = async (tx, receiving, actor) => {
  const updatedPurchaseOrderItemIds = new Set();

  for (const receivingItem of receiving.items) {
    const quantityReceived = Number(receivingItem.quantityReceived);
    const unitCost = Number(receivingItem.unitCost);
    const batchCode = normalizeOptionalString(receivingItem.batchCode);

    if (!batchCode) {
      throw new AppError(
        "Batch code is required before posting receiving",
        400,
        "BATCH_CODE_REQUIRED_FOR_POSTING"
      );
    }

    const item = await tx.item.findUnique({
      where: {
        id: receivingItem.itemId,
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404, "ITEM_NOT_FOUND");
    }

    if (item.branchId !== receiving.branchId) {
      throw new AppError(
        "Item is not available in this branch",
        403,
        "ITEM_BRANCH_ACCESS_DENIED"
      );
    }

    if (item.status !== "ACTIVE") {
      throw new AppError("Item is not active", 400, "ITEM_NOT_ACTIVE");
    }

    if (item.isSerialized) {
      throw new AppError(
        "Serialized receiving posting is not available until serial receiving module",
        400,
        "SERIAL_RECEIVING_NOT_AVAILABLE"
      );
    }

    const existingBatch = await tx.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: {
          branchId: receiving.branchId,
          batchCode,
        },
      },
    });

    if (existingBatch && existingBatch.itemId !== item.id) {
      throw new AppError(
        "Batch code already belongs to another item",
        409,
        "BATCH_ITEM_MISMATCH"
      );
    }

    const previousQuantity = existingBatch
      ? Number(existingBatch.quantityAvailable)
      : 0;

    const previousQuantityIn = existingBatch
      ? Number(existingBatch.quantityIn)
      : 0;

    const newQuantity = previousQuantity + quantityReceived;
    const newQuantityIn = previousQuantityIn + quantityReceived;

    const referenceNo =
      receiving.supplierInvoiceNo ||
      receiving.supplierDeliveryNo ||
      receiving.referenceNo ||
      receiving.receivingCode;

    const batch = await tx.inventoryBatch.upsert({
      where: {
        branchId_batchCode: {
          branchId: receiving.branchId,
          batchCode,
        },
      },
      update: {
        itemId: item.id,
        quantityIn: newQuantityIn.toString(),
        quantityAvailable: newQuantity.toString(),
        unitCost: unitCost.toString(),
        sellingPrice1: item.price1.toString(),
        sellingPrice2: item.price2.toString(),
        sellingPrice3: item.price3.toString(),
        sellingPrice4: item.price4.toString(),
        sellingPrice5: item.price5.toString(),
        supplierName: receiving.supplierNameSnapshot,
        referenceNo,
        remarks: \`Purchase receiving \${receiving.receivingCode}\`,
        expiryDate: receivingItem.expiryDate || null,
        status: "ACTIVE",
        updatedById: actor.id,
      },
      create: {
        branchId: receiving.branchId,
        itemId: item.id,
        batchCode,
        quantityIn: quantityReceived.toString(),
        quantityAvailable: quantityReceived.toString(),
        unitCost: unitCost.toString(),
        sellingPrice1: item.price1.toString(),
        sellingPrice2: item.price2.toString(),
        sellingPrice3: item.price3.toString(),
        sellingPrice4: item.price4.toString(),
        sellingPrice5: item.price5.toString(),
        supplierName: receiving.supplierNameSnapshot,
        referenceNo,
        remarks: \`Purchase receiving \${receiving.receivingCode}\`,
        expiryDate: receivingItem.expiryDate || null,
        status: "ACTIVE",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    const movementCode = await createPurchaseStockInMovementCode(
      tx,
      receiving.branchId,
      item.branch.code,
      item.itemCode
    );

    await tx.inventoryMovement.create({
      data: {
        branchId: receiving.branchId,
        itemId: item.id,
        batchId: batch.id,
        movementCode,
        type: "STOCK_IN",
        source: "PURCHASE",
        quantity: quantityReceived.toString(),
        previousQuantity: previousQuantity.toString(),
        newQuantity: newQuantity.toString(),
        unitCost: unitCost.toString(),
        referenceNo,
        remarks: \`Posted purchase receiving \${receiving.receivingCode}\`,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    if (receivingItem.purchaseOrderItemId) {
      const purchaseOrderItem = await tx.purchaseOrderItem.findUnique({
        where: {
          id: receivingItem.purchaseOrderItemId,
        },
      });

      if (!purchaseOrderItem) {
        throw new AppError(
          "Purchase order item not found",
          404,
          "PURCHASE_ORDER_ITEM_NOT_FOUND"
        );
      }

      const previousReceivedQuantity = Number(purchaseOrderItem.receivedQuantity);
      const orderedQuantity = Number(purchaseOrderItem.quantity);
      const newReceivedQuantity = previousReceivedQuantity + quantityReceived;

      if (newReceivedQuantity > orderedQuantity) {
        throw new AppError(
          "Quantity received cannot exceed ordered quantity",
          400,
          "RECEIVING_QUANTITY_EXCEEDS_REMAINING"
        );
      }

      await tx.purchaseOrderItem.update({
        where: {
          id: purchaseOrderItem.id,
        },
        data: {
          receivedQuantity: newReceivedQuantity.toString(),
        },
      });

      updatedPurchaseOrderItemIds.add(purchaseOrderItem.id);
    }
  }

  if (receiving.purchaseOrderId) {
    const purchaseOrderItems = await tx.purchaseOrderItem.findMany({
      where: {
        purchaseOrderId: receiving.purchaseOrderId,
      },
      select: {
        quantity: true,
        receivedQuantity: true,
      },
    });

    const hasAnyReceived = purchaseOrderItems.some((item) => {
      return Number(item.receivedQuantity) > 0;
    });

    const isFullyReceived =
      purchaseOrderItems.length > 0 &&
      purchaseOrderItems.every((item) => {
        return Number(item.receivedQuantity) >= Number(item.quantity);
      });

    let nextStatus = "ORDERED";
    const updatePurchaseOrderData = {
      updatedById: actor.id,
    };

    if (isFullyReceived) {
      nextStatus = "RECEIVED";
      updatePurchaseOrderData.receivedAt = new Date();
    } else if (hasAnyReceived) {
      nextStatus = "PARTIALLY_RECEIVED";
    }

    updatePurchaseOrderData.status = nextStatus;

    await tx.purchaseOrder.update({
      where: {
        id: receiving.purchaseOrderId,
      },
      data: updatePurchaseOrderData,
    });
  }
};

`;

  service = service.replace(
    "const updatePurchaseReceivingStatusById = async",
    helperBlock + "const updatePurchaseReceivingStatusById = async"
  );
}

const replacementFunction = `const updatePurchaseReceivingStatusById = async (purchaseReceivingId, payload, actor) => {
  const existingReceiving = await prisma.purchaseReceiving.findUnique({
    where: {
      id: purchaseReceivingId,
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });

  if (!existingReceiving) {
    throw new AppError(
      "Purchase receiving not found",
      404,
      "PURCHASE_RECEIVING_NOT_FOUND"
    );
  }

  assertReceivingManageAccess(existingReceiving, actor);

  if (existingReceiving.status !== "DRAFT") {
    throw new AppError(
      "Only draft purchase receivings can be changed in this module",
      400,
      "PURCHASE_RECEIVING_NOT_DRAFT"
    );
  }

  if (payload.status === "POSTED") {
    return prisma.$transaction(async (tx) => {
      const receiving = await tx.purchaseReceiving.findUnique({
        where: {
          id: existingReceiving.id,
        },
        include: PURCHASE_RECEIVING_INCLUDE,
      });

      if (!receiving) {
        throw new AppError(
          "Purchase receiving not found",
          404,
          "PURCHASE_RECEIVING_NOT_FOUND"
        );
      }

      if (receiving.status !== "DRAFT") {
        throw new AppError(
          "Only draft purchase receivings can be posted",
          400,
          "PURCHASE_RECEIVING_NOT_DRAFT"
        );
      }

      await postReceivingStockIn(tx, receiving, actor);

      return tx.purchaseReceiving.update({
        where: {
          id: receiving.id,
        },
        data: {
          status: "POSTED",
          postedAt: new Date(),
          postedById: actor.id,
          updatedById: actor.id,
        },
        include: PURCHASE_RECEIVING_INCLUDE,
      });
    });
  }

  const cancellationReason = normalizeOptionalString(payload.cancellationReason);

  if (!cancellationReason) {
    throw new AppError(
      "Cancellation reason is required",
      400,
      "CANCELLATION_REASON_REQUIRED"
    );
  }

  return prisma.purchaseReceiving.update({
    where: {
      id: existingReceiving.id,
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: actor.id,
      cancellationReason,
      updatedById: actor.id,
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });
};`;

service = service.replace(
  /const updatePurchaseReceivingStatusById = async \(purchaseReceivingId, payload, actor\) => \{[\s\S]*?\n\};\n\nmodule\.exports = \{/,
  replacementFunction + "\n\nmodule.exports = {"
);

fs.writeFileSync(servicePath, service);

console.log("DONE: Phase 13H receiving stock-in logic patched.");
