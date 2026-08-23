const fs = require("fs");

const validationPath = "./src/modules/purchase-receivings/validations/purchaseReceiving.validation.js";
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("serialNumbers")) {
  validation = validation.replace(
    `  expiryDate: z
    .string()
    .trim()
    .min(1, "Expiry date cannot be empty")
    .optional()
    .nullable(),`,
    `  expiryDate: z
    .string()
    .trim()
    .min(1, "Expiry date cannot be empty")
    .optional()
    .nullable(),
  serialNumbers: z.array(z.string().trim().min(1, "Serial number cannot be empty")).optional(),`
  );
}

fs.writeFileSync(validationPath, validation);

const servicePath = "./src/modules/purchase-receivings/services/purchaseReceiving.service.js";
let service = fs.readFileSync(servicePath, "utf8");

service = service.replaceAll(
  `          status: true,
          branchId: true,`,
  `          status: true,
          branchId: true,
          isSerialized: true,`
);

if (!service.includes("serials: {")) {
  service = service.replace(
    `      purchaseOrderItem: {
        select: {
          id: true,
          lineNo: true,
          description: true,
          quantity: true,
          receivedQuantity: true,
          unitCost: true,
          purchaseOrderId: true,
          itemId: true,
        },
      },`,
    `      purchaseOrderItem: {
        select: {
          id: true,
          lineNo: true,
          description: true,
          quantity: true,
          receivedQuantity: true,
          unitCost: true,
          purchaseOrderId: true,
          itemId: true,
        },
      },
      serials: {
        select: {
          id: true,
          serialNumber: true,
        },
        orderBy: {
          serialNumber: "asc",
        },
      },`
  );
}

const newValidateAndBuildItems = `const normalizeSerialNumbers = (serialNumbers) => {
  if (!Array.isArray(serialNumbers)) {
    return [];
  }

  return serialNumbers
    .map((serialNumber) => String(serialNumber).trim())
    .filter(Boolean);
};

const validateAndBuildItems = async (
  items,
  branchId,
  purchaseOrder = null,
  currentReceivingId = null
) => {
  const builtItems = [];
  let subtotal = 0;
  let totalDiscount = 0;
  const serialNumbersInRequest = new Set();

  for (let index = 0; index < items.length; index += 1) {
    const itemPayload = items[index];
    const quantityReceived = Number(itemPayload.quantityReceived);
    const unitCost = Number(itemPayload.unitCost);
    const discountAmount = Number(itemPayload.discountAmount || 0);
    const serialNumbers = normalizeSerialNumbers(itemPayload.serialNumbers);

    if (discountAmount > quantityReceived * unitCost) {
      throw new AppError(
        "Discount amount cannot be greater than line subtotal",
        400,
        "INVALID_LINE_DISCOUNT"
      );
    }

    const item = await prisma.item.findUnique({
      where: {
        id: itemPayload.itemId,
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        status: true,
        branchId: true,
        isSerialized: true,
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404, "ITEM_NOT_FOUND");
    }

    if (item.branchId !== branchId) {
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
      if (!Number.isInteger(quantityReceived)) {
        throw new AppError(
          "Serialized item receiving quantity must be a whole number",
          400,
          "SERIALIZED_QUANTITY_MUST_BE_WHOLE_NUMBER"
        );
      }

      if (serialNumbers.length !== quantityReceived) {
        throw new AppError(
          "Serialized item requires serial count to match received quantity",
          400,
          "SERIAL_COUNT_MISMATCH"
        );
      }
    }

    if (!item.isSerialized && serialNumbers.length > 0) {
      throw new AppError(
        "Serial numbers are not allowed for non-serialized item",
        400,
        "SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"
      );
    }

    for (const serialNumber of serialNumbers) {
      if (serialNumbersInRequest.has(serialNumber)) {
        throw new AppError(
          "Duplicate serial number found in request",
          400,
          "DUPLICATE_SERIAL_IN_REQUEST"
        );
      }

      serialNumbersInRequest.add(serialNumber);
    }

    if (serialNumbers.length > 0) {
      const existingItemSerials = await prisma.itemSerial.findMany({
        where: {
          branchId,
          serialNumber: {
            in: serialNumbers,
          },
        },
        select: {
          serialNumber: true,
        },
      });

      if (existingItemSerials.length > 0) {
        const error = new AppError(
          "One or more serial numbers already exist",
          409,
          "SERIAL_ALREADY_EXISTS"
        );

        error.details = existingItemSerials.map((serial) => serial.serialNumber);
        throw error;
      }

      const existingDraftSerials = await prisma.purchaseReceivingSerial.findMany({
        where: {
          serialNumber: {
            in: serialNumbers,
          },
          purchaseReceivingItem: {
            purchaseReceiving: {
              branchId,
              status: "DRAFT",
              ...(currentReceivingId
                ? {
                    id: {
                      not: currentReceivingId,
                    },
                  }
                : {}),
            },
          },
        },
        select: {
          serialNumber: true,
        },
      });

      if (existingDraftSerials.length > 0) {
        const error = new AppError(
          "One or more serial numbers already exist in another draft receiving",
          409,
          "SERIAL_ALREADY_IN_DRAFT_RECEIVING"
        );

        error.details = existingDraftSerials.map((serial) => serial.serialNumber);
        throw error;
      }
    }

    let purchaseOrderItemId = null;

    if (itemPayload.purchaseOrderItemId) {
      if (!purchaseOrder) {
        throw new AppError(
          "Purchase order is required when purchaseOrderItemId is provided",
          400,
          "PURCHASE_ORDER_REQUIRED"
        );
      }

      const purchaseOrderItem = purchaseOrder.items.find(
        (poItem) => poItem.id === itemPayload.purchaseOrderItemId
      );

      if (!purchaseOrderItem) {
        throw new AppError(
          "Purchase order item not found in selected purchase order",
          404,
          "PURCHASE_ORDER_ITEM_NOT_FOUND"
        );
      }

      if (purchaseOrderItem.itemId !== item.id) {
        throw new AppError(
          "Purchase order item does not match selected item",
          400,
          "PURCHASE_ORDER_ITEM_MISMATCH"
        );
      }

      const remainingQuantity =
        Number(purchaseOrderItem.quantity) - Number(purchaseOrderItem.receivedQuantity);

      if (quantityReceived > remainingQuantity) {
        throw new AppError(
          "Quantity received cannot exceed remaining purchase order quantity",
          400,
          "RECEIVING_QUANTITY_EXCEEDS_REMAINING"
        );
      }

      purchaseOrderItemId = purchaseOrderItem.id;
    }

    const lineSubtotal = quantityReceived * unitCost;
    const lineTotal = lineSubtotal - discountAmount;

    subtotal += lineSubtotal;
    totalDiscount += discountAmount;

    builtItems.push({
      lineNo: index + 1,
      description: itemPayload.description.trim(),
      quantityReceived,
      unitCost,
      discountAmount,
      lineTotal,
      batchCode: normalizeOptionalString(itemPayload.batchCode),
      expiryDate: normalizeOptionalDate(itemPayload.expiryDate),
      itemId: item.id,
      purchaseOrderItemId,
      ...(serialNumbers.length > 0
        ? {
            serials: {
              create: serialNumbers.map((serialNumber) => ({
                serialNumber,
              })),
            },
          }
        : {}),
    });
  }

  return {
    items: builtItems,
    subtotal,
    totalDiscount,
    grandTotal: subtotal - totalDiscount,
  };
};`;

service = service.replace(
  /const validateAndBuildItems = async \(items, branchId, purchaseOrder = null\) => \{[\s\S]*?\n\};\n\nconst createPurchaseReceiving = async/,
  newValidateAndBuildItems + "\n\nconst createPurchaseReceiving = async"
);

service = service.replace(
  `    const totals = await validateAndBuildItems(
      payload.items,
      existingReceiving.branchId,
      purchaseOrder
    );`,
  `    const totals = await validateAndBuildItems(
      payload.items,
      existingReceiving.branchId,
      purchaseOrder,
      existingReceiving.id
    );`
);

const newPostReceivingStockIn = `const postReceivingStockIn = async (tx, receiving, actor) => {
  for (const receivingItem of receiving.items) {
    const quantityReceived = Number(receivingItem.quantityReceived);
    const unitCost = Number(receivingItem.unitCost);
    const batchCode = normalizeOptionalString(receivingItem.batchCode);
    const serialNumbers = Array.isArray(receivingItem.serials)
      ? receivingItem.serials.map((serial) => serial.serialNumber)
      : [];

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
      if (!Number.isInteger(quantityReceived)) {
        throw new AppError(
          "Serialized item receiving quantity must be a whole number",
          400,
          "SERIALIZED_QUANTITY_MUST_BE_WHOLE_NUMBER"
        );
      }

      if (serialNumbers.length !== quantityReceived) {
        throw new AppError(
          "Serialized item requires serial count to match received quantity",
          400,
          "SERIAL_COUNT_MISMATCH"
        );
      }
    }

    if (!item.isSerialized && serialNumbers.length > 0) {
      throw new AppError(
        "Serial numbers are not allowed for non-serialized item",
        400,
        "SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM"
      );
    }

    if (serialNumbers.length > 0) {
      const existingSerials = await tx.itemSerial.findMany({
        where: {
          branchId: receiving.branchId,
          serialNumber: {
            in: serialNumbers,
          },
        },
        select: {
          serialNumber: true,
        },
      });

      if (existingSerials.length > 0) {
        const error = new AppError(
          "One or more serial numbers already exist",
          409,
          "SERIAL_ALREADY_EXISTS"
        );

        error.details = existingSerials.map((serial) => serial.serialNumber);
        throw error;
      }
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

    for (const serialNumber of serialNumbers) {
      await tx.itemSerial.create({
        data: {
          branchId: receiving.branchId,
          itemId: item.id,
          batchId: batch.id,
          serialNumber,
          status: "AVAILABLE",
          remarks: \`Posted purchase receiving \${receiving.receivingCode}\`,
          createdById: actor.id,
          updatedById: actor.id,
        },
      });
    }

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
};`;

service = service.replace(
  /const postReceivingStockIn = async \(tx, receiving, actor\) => \{[\s\S]*?\n\};\n\nconst updatePurchaseReceivingStatusById/,
  newPostReceivingStockIn + "\n\nconst updatePurchaseReceivingStatusById"
);

fs.writeFileSync(servicePath, service);

console.log("DONE: Phase 13I serialized receiving validation and service patched.");
