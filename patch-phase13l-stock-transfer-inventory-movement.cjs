const fs = require("fs");

const servicePath = "./src/modules/stock-transfers/services/stockTransfer.service.js";
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const createTransferMovementCode")) {
  const helperBlock = `
const createTransferMovementCode = async (tx, branchId, branchCode, itemCode, movementType) => {
  const prefix = \`MOV-\${branchCode}-\${itemCode}-\${movementType}-\`;

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

const postStockTransferInventoryMovement = async (tx, stockTransfer, actor) => {
  const fromBranch = await tx.branch.findUnique({
    where: {
      id: stockTransfer.fromBranchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  const toBranch = await tx.branch.findUnique({
    where: {
      id: stockTransfer.toBranchId,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!fromBranch || fromBranch.status !== "ACTIVE") {
    throw new AppError("From branch is not active", 400, "FROM_BRANCH_NOT_ACTIVE");
  }

  if (!toBranch || toBranch.status !== "ACTIVE") {
    throw new AppError("To branch is not active", 400, "TO_BRANCH_NOT_ACTIVE");
  }

  for (const transferItem of stockTransfer.items) {
    const quantity = Number(transferItem.quantity);

    const sourceItem = await tx.item.findUnique({
      where: {
        id: transferItem.itemId,
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        branchId: true,
        isSerialized: true,
        hasWarranty: true,
        costPrice: true,
        price1: true,
        price2: true,
        price3: true,
        price4: true,
        price5: true,
      },
    });

    if (!sourceItem) {
      throw new AppError("Source item not found", 404, "SOURCE_ITEM_NOT_FOUND");
    }

    if (sourceItem.branchId !== fromBranch.id) {
      throw new AppError(
        "Source item does not belong to from branch",
        403,
        "SOURCE_ITEM_BRANCH_MISMATCH"
      );
    }

    if (sourceItem.status !== "ACTIVE") {
      throw new AppError("Source item is not active", 400, "SOURCE_ITEM_NOT_ACTIVE");
    }

    const destinationItem = await tx.item.findFirst({
      where: {
        branchId: toBranch.id,
        itemCode: sourceItem.itemCode,
        status: "ACTIVE",
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        branchId: true,
        isSerialized: true,
        hasWarranty: true,
        costPrice: true,
        price1: true,
        price2: true,
        price3: true,
        price4: true,
        price5: true,
      },
    });

    if (!destinationItem) {
      throw new AppError(
        "Matching destination itemCode not found in to branch",
        404,
        "DESTINATION_ITEM_NOT_FOUND"
      );
    }

    if (destinationItem.isSerialized !== sourceItem.isSerialized) {
      throw new AppError(
        "Destination item serialized setting does not match source item",
        400,
        "DESTINATION_ITEM_SERIALIZED_MISMATCH"
      );
    }

    if (!transferItem.fromBatchId) {
      throw new AppError(
        "Source batch is required before posting stock transfer",
        400,
        "SOURCE_BATCH_REQUIRED_FOR_POSTING"
      );
    }

    const sourceBatch = await tx.inventoryBatch.findUnique({
      where: {
        id: transferItem.fromBatchId,
      },
    });

    if (!sourceBatch) {
      throw new AppError("Source batch not found", 404, "SOURCE_BATCH_NOT_FOUND");
    }

    if (sourceBatch.branchId !== fromBranch.id || sourceBatch.itemId !== sourceItem.id) {
      throw new AppError(
        "Source batch does not match transfer item and from branch",
        403,
        "SOURCE_BATCH_MISMATCH"
      );
    }

    const sourcePreviousQuantity = Number(sourceBatch.quantityAvailable);
    const sourceNewQuantity = sourcePreviousQuantity - quantity;

    if (sourceNewQuantity < 0) {
      throw new AppError(
        "Insufficient source batch quantity",
        400,
        "INSUFFICIENT_SOURCE_BATCH_QUANTITY"
      );
    }

    const transferSerials = Array.isArray(transferItem.serials)
      ? transferItem.serials
      : [];

    if (sourceItem.isSerialized) {
      if (!Number.isInteger(quantity)) {
        throw new AppError(
          "Serialized transfer quantity must be a whole number",
          400,
          "SERIALIZED_QUANTITY_MUST_BE_WHOLE_NUMBER"
        );
      }

      if (transferSerials.length !== quantity) {
        throw new AppError(
          "Serialized transfer requires serial count to match quantity",
          400,
          "SERIAL_COUNT_MISMATCH"
        );
      }
    }

    if (!sourceItem.isSerialized && transferSerials.length > 0) {
      throw new AppError(
        "Serials are not allowed for non-serialized item",
        400,
        "SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"
      );
    }

    const destinationBatchCode = sourceBatch.batchCode;

    const existingDestinationBatch = await tx.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: {
          branchId: toBranch.id,
          batchCode: destinationBatchCode,
        },
      },
    });

    if (existingDestinationBatch && existingDestinationBatch.itemId !== destinationItem.id) {
      throw new AppError(
        "Destination batch code already belongs to another item",
        409,
        "DESTINATION_BATCH_ITEM_MISMATCH"
      );
    }

    const destinationPreviousQuantity = existingDestinationBatch
      ? Number(existingDestinationBatch.quantityAvailable)
      : 0;

    const destinationPreviousQuantityIn = existingDestinationBatch
      ? Number(existingDestinationBatch.quantityIn)
      : 0;

    const destinationNewQuantity = destinationPreviousQuantity + quantity;
    const destinationNewQuantityIn = destinationPreviousQuantityIn + quantity;

    const referenceNo = stockTransfer.transferCode;

    const updatedSourceBatch = await tx.inventoryBatch.update({
      where: {
        id: sourceBatch.id,
      },
      data: {
        quantityAvailable: sourceNewQuantity.toString(),
        status: sourceNewQuantity === 0 ? "DEPLETED" : "ACTIVE",
        updatedById: actor.id,
      },
    });

    const destinationBatch = await tx.inventoryBatch.upsert({
      where: {
        branchId_batchCode: {
          branchId: toBranch.id,
          batchCode: destinationBatchCode,
        },
      },
      update: {
        itemId: destinationItem.id,
        quantityIn: destinationNewQuantityIn.toString(),
        quantityAvailable: destinationNewQuantity.toString(),
        unitCost: sourceBatch.unitCost.toString(),
        sellingPrice1: destinationItem.price1.toString(),
        sellingPrice2: destinationItem.price2.toString(),
        sellingPrice3: destinationItem.price3.toString(),
        sellingPrice4: destinationItem.price4.toString(),
        sellingPrice5: destinationItem.price5.toString(),
        supplierName: sourceBatch.supplierName,
        referenceNo,
        remarks: \`Transfer in from \${fromBranch.code} via \${stockTransfer.transferCode}\`,
        expiryDate: sourceBatch.expiryDate || null,
        status: "ACTIVE",
        updatedById: actor.id,
      },
      create: {
        branchId: toBranch.id,
        itemId: destinationItem.id,
        batchCode: destinationBatchCode,
        quantityIn: quantity.toString(),
        quantityAvailable: quantity.toString(),
        unitCost: sourceBatch.unitCost.toString(),
        sellingPrice1: destinationItem.price1.toString(),
        sellingPrice2: destinationItem.price2.toString(),
        sellingPrice3: destinationItem.price3.toString(),
        sellingPrice4: destinationItem.price4.toString(),
        sellingPrice5: destinationItem.price5.toString(),
        supplierName: sourceBatch.supplierName,
        referenceNo,
        remarks: \`Transfer in from \${fromBranch.code} via \${stockTransfer.transferCode}\`,
        expiryDate: sourceBatch.expiryDate || null,
        status: "ACTIVE",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    const transferOutMovementCode = await createTransferMovementCode(
      tx,
      fromBranch.id,
      fromBranch.code,
      sourceItem.itemCode,
      "TRANSFEROUT"
    );

    await tx.inventoryMovement.create({
      data: {
        branchId: fromBranch.id,
        itemId: sourceItem.id,
        batchId: sourceBatch.id,
        movementCode: transferOutMovementCode,
        type: "TRANSFER_OUT",
        source: "TRANSFER",
        quantity: quantity.toString(),
        previousQuantity: sourcePreviousQuantity.toString(),
        newQuantity: sourceNewQuantity.toString(),
        unitCost: sourceBatch.unitCost.toString(),
        referenceNo,
        remarks: \`Transfer out to \${toBranch.code} via \${stockTransfer.transferCode}\`,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    const transferInMovementCode = await createTransferMovementCode(
      tx,
      toBranch.id,
      toBranch.code,
      destinationItem.itemCode,
      "TRANSFERIN"
    );

    await tx.inventoryMovement.create({
      data: {
        branchId: toBranch.id,
        itemId: destinationItem.id,
        batchId: destinationBatch.id,
        movementCode: transferInMovementCode,
        type: "TRANSFER_IN",
        source: "TRANSFER",
        quantity: quantity.toString(),
        previousQuantity: destinationPreviousQuantity.toString(),
        newQuantity: destinationNewQuantity.toString(),
        unitCost: sourceBatch.unitCost.toString(),
        referenceNo,
        remarks: \`Transfer in from \${fromBranch.code} via \${stockTransfer.transferCode}\`,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    for (const transferSerial of transferSerials) {
      const serial = await tx.itemSerial.findUnique({
        where: {
          id: transferSerial.itemSerialId,
        },
      });

      if (!serial) {
        throw new AppError("Serial not found", 404, "SERIAL_NOT_FOUND");
      }

      if (
        serial.branchId !== fromBranch.id ||
        serial.itemId !== sourceItem.id ||
        serial.batchId !== sourceBatch.id ||
        serial.status !== "AVAILABLE"
      ) {
        throw new AppError(
          "Serial is not available in source branch and batch",
          400,
          "SERIAL_NOT_AVAILABLE"
        );
      }

      await tx.itemSerial.update({
        where: {
          id: serial.id,
        },
        data: {
          branchId: toBranch.id,
          itemId: destinationItem.id,
          batchId: destinationBatch.id,
          status: "AVAILABLE",
          remarks: \`Transferred from \${fromBranch.code} via \${stockTransfer.transferCode}\`,
          updatedById: actor.id,
        },
      });
    }

    if (Number(updatedSourceBatch.quantityAvailable) !== sourceNewQuantity) {
      throw new AppError(
        "Source batch quantity mismatch after update",
        500,
        "SOURCE_BATCH_UPDATE_MISMATCH"
      );
    }
  }
};

`;

  service = service.replace(
    "const updateStockTransferStatusById = async",
    helperBlock + "const updateStockTransferStatusById = async"
  );
}

const replacementFunction = `const updateStockTransferStatusById = async (stockTransferId, payload, actor) => {
  const existingTransfer = await prisma.stockTransfer.findUnique({
    where: {
      id: stockTransferId,
    },
    include: STOCK_TRANSFER_INCLUDE,
  });

  if (!existingTransfer) {
    throw new AppError("Stock transfer not found", 404, "STOCK_TRANSFER_NOT_FOUND");
  }

  assertStockTransferManageAccess(existingTransfer, actor);

  if (payload.status === "POSTED") {
    if (existingTransfer.status !== "APPROVED") {
      throw new AppError(
        "Only approved stock transfers can be posted",
        400,
        "INVALID_STATUS_TRANSITION"
      );
    }

    return prisma.$transaction(async (tx) => {
      const stockTransfer = await tx.stockTransfer.findUnique({
        where: {
          id: existingTransfer.id,
        },
        include: STOCK_TRANSFER_INCLUDE,
      });

      if (!stockTransfer) {
        throw new AppError("Stock transfer not found", 404, "STOCK_TRANSFER_NOT_FOUND");
      }

      if (stockTransfer.status !== "APPROVED") {
        throw new AppError(
          "Only approved stock transfers can be posted",
          400,
          "INVALID_STATUS_TRANSITION"
        );
      }

      await postStockTransferInventoryMovement(tx, stockTransfer, actor);

      return tx.stockTransfer.update({
        where: {
          id: stockTransfer.id,
        },
        data: {
          status: "POSTED",
          postedAt: new Date(),
          postedById: actor.id,
          updatedById: actor.id,
        },
        include: STOCK_TRANSFER_INCLUDE,
      });
    });
  }

  const updateData = {
    status: payload.status,
    updatedById: actor.id,
  };

  if (payload.status === "REQUESTED") {
    if (existingTransfer.status !== "DRAFT") {
      throw new AppError("Only draft stock transfers can be requested", 400, "INVALID_STATUS_TRANSITION");
    }

    updateData.requestedAt = new Date();
    updateData.requestedById = actor.id;
  }

  if (payload.status === "APPROVED") {
    if (!["DRAFT", "REQUESTED"].includes(existingTransfer.status)) {
      throw new AppError("Only draft or requested stock transfers can be approved", 400, "INVALID_STATUS_TRANSITION");
    }

    updateData.approvedAt = new Date();
    updateData.approvedById = actor.id;
  }

  if (payload.status === "REJECTED") {
    if (!["DRAFT", "REQUESTED"].includes(existingTransfer.status)) {
      throw new AppError("Only draft or requested stock transfers can be rejected", 400, "INVALID_STATUS_TRANSITION");
    }

    const rejectionReason = normalizeOptionalString(payload.rejectionReason);

    if (!rejectionReason) {
      throw new AppError("Rejection reason is required", 400, "REJECTION_REASON_REQUIRED");
    }

    updateData.rejectedAt = new Date();
    updateData.rejectedById = actor.id;
    updateData.rejectionReason = rejectionReason;
  }

  if (payload.status === "CANCELLED") {
    if (["POSTED", "CANCELLED"].includes(existingTransfer.status)) {
      throw new AppError("This stock transfer cannot be cancelled", 400, "INVALID_STATUS_TRANSITION");
    }

    const cancellationReason = normalizeOptionalString(payload.cancellationReason);

    if (!cancellationReason) {
      throw new AppError("Cancellation reason is required", 400, "CANCELLATION_REASON_REQUIRED");
    }

    updateData.cancelledAt = new Date();
    updateData.cancelledById = actor.id;
    updateData.cancellationReason = cancellationReason;
  }

  return prisma.stockTransfer.update({
    where: {
      id: existingTransfer.id,
    },
    data: updateData,
    include: STOCK_TRANSFER_INCLUDE,
  });
};`;

service = service.replace(
  /const updateStockTransferStatusById = async \(stockTransferId, payload, actor\) => \{[\s\S]*?\n\};\n\nmodule\.exports = \{/,
  replacementFunction + "\n\nmodule.exports = {"
);

fs.writeFileSync(servicePath, service);

console.log("DONE: Phase 13L stock transfer inventory movement patched.");
