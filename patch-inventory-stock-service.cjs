const fs = require("fs");

const filePath = "./src/modules/inventory/services/inventory.service.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const createStockIn = async")) {
  console.log("SKIP: createStockIn already exists.");
  process.exit(0);
}

const insertFunctions = `
const createMovementCode = async (branchCode, itemCode, movementType) => {
  const count = await prisma.inventoryMovement.count({
    where: {
      movementCode: {
        startsWith: \`MOV-\${branchCode}-\${itemCode}-\${movementType}-\`,
      },
    },
  });

  return \`MOV-\${branchCode}-\${itemCode}-\${movementType}-\${String(count + 1).padStart(3, "0")}\`;
};

const ensureManageBranchAccess = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId;
  }

  if (!actor.branchId) {
    const error = new Error("BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }

  if (requestedBranchId && requestedBranchId !== actor.branchId) {
    const error = new Error("BRANCH_ACCESS_DENIED");
    error.statusCode = 403;
    throw error;
  }

  return actor.branchId;
};

const getItemForStockMutation = async (itemId, branchId) => {
  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      branchId,
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
    const error = new Error("ITEM_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return item;
};

const normalizeSerialNumbers = (serialNumbers) => {
  if (!Array.isArray(serialNumbers)) {
    return [];
  }

  return serialNumbers
    .map((serialNumber) => String(serialNumber).trim())
    .filter(Boolean);
};

const assertUniqueSerialNumbers = (serialNumbers) => {
  const normalized = normalizeSerialNumbers(serialNumbers);
  const unique = new Set(normalized);

  if (unique.size !== normalized.length) {
    const error = new Error("DUPLICATE_SERIAL_IN_REQUEST");
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

const createStockIn = async (actor, payload) => {
  const branchId = ensureManageBranchAccess(actor, payload.branchId);
  const item = await getItemForStockMutation(payload.itemId, branchId);

  const quantity = Number(payload.quantity);
  const serialNumbers = assertUniqueSerialNumbers(payload.serialNumbers);

  if (item.isSerialized && serialNumbers.length !== quantity) {
    const error = new Error("SERIAL_COUNT_MISMATCH");
    error.statusCode = 400;
    throw error;
  }

  if (!item.isSerialized && serialNumbers.length > 0) {
    const error = new Error("SERIALS_NOT_ALLOWED_FOR_NON_SERIALIZED_ITEM");
    error.statusCode = 400;
    throw error;
  }

  if (serialNumbers.length > 0) {
    const existingSerials = await prisma.itemSerial.findMany({
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

    if (existingSerials.length > 0) {
      const error = new Error("SERIAL_ALREADY_EXISTS");
      error.statusCode = 409;
      error.details = existingSerials.map((serial) => serial.serialNumber);
      throw error;
    }
  }

  return prisma.$transaction(async (tx) => {
    const existingBatch = await tx.inventoryBatch.findUnique({
      where: {
        branchId_batchCode: {
          branchId,
          batchCode: payload.batchCode,
        },
      },
    });

    const previousQuantity = existingBatch
      ? Number(existingBatch.quantityAvailable)
      : 0;

    const newQuantity = previousQuantity + quantity;

    const batch = await tx.inventoryBatch.upsert({
      where: {
        branchId_batchCode: {
          branchId,
          batchCode: payload.batchCode,
        },
      },
      update: {
        itemId: item.id,
        quantityIn: (Number(existingBatch.quantityIn) + quantity).toString(),
        quantityAvailable: newQuantity.toString(),
        unitCost: payload.unitCost !== undefined ? payload.unitCost.toString() : item.costPrice.toString(),
        sellingPrice1: payload.sellingPrice1 !== undefined ? payload.sellingPrice1.toString() : item.price1.toString(),
        sellingPrice2: payload.sellingPrice2 !== undefined ? payload.sellingPrice2.toString() : item.price2.toString(),
        sellingPrice3: payload.sellingPrice3 !== undefined ? payload.sellingPrice3.toString() : item.price3.toString(),
        sellingPrice4: payload.sellingPrice4 !== undefined ? payload.sellingPrice4.toString() : item.price4.toString(),
        sellingPrice5: payload.sellingPrice5 !== undefined ? payload.sellingPrice5.toString() : item.price5.toString(),
        supplierName: payload.supplierName || existingBatch.supplierName,
        referenceNo: payload.referenceNo || existingBatch.referenceNo,
        remarks: payload.remarks || existingBatch.remarks,
        expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : existingBatch.expiryDate,
        status: "ACTIVE",
        updatedById: actor.id,
      },
      create: {
        branchId,
        itemId: item.id,
        batchCode: payload.batchCode,
        quantityIn: quantity.toString(),
        quantityAvailable: quantity.toString(),
        unitCost: payload.unitCost !== undefined ? payload.unitCost.toString() : item.costPrice.toString(),
        sellingPrice1: payload.sellingPrice1 !== undefined ? payload.sellingPrice1.toString() : item.price1.toString(),
        sellingPrice2: payload.sellingPrice2 !== undefined ? payload.sellingPrice2.toString() : item.price2.toString(),
        sellingPrice3: payload.sellingPrice3 !== undefined ? payload.sellingPrice3.toString() : item.price3.toString(),
        sellingPrice4: payload.sellingPrice4 !== undefined ? payload.sellingPrice4.toString() : item.price4.toString(),
        sellingPrice5: payload.sellingPrice5 !== undefined ? payload.sellingPrice5.toString() : item.price5.toString(),
        supplierName: payload.supplierName || null,
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || null,
        expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : null,
        status: "ACTIVE",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    const movementCode = await createMovementCode(item.branch.code, item.itemCode, "STOCKIN");

    const movement = await tx.inventoryMovement.create({
      data: {
        branchId,
        itemId: item.id,
        batchId: batch.id,
        movementCode,
        type: "STOCK_IN",
        source: "MANUAL",
        quantity: quantity.toString(),
        previousQuantity: previousQuantity.toString(),
        newQuantity: newQuantity.toString(),
        unitCost: payload.unitCost !== undefined ? payload.unitCost.toString() : item.costPrice.toString(),
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || "Manual stock-in.",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    const createdSerials = [];

    for (const serialNumber of serialNumbers) {
      const serial = await tx.itemSerial.create({
        data: {
          branchId,
          itemId: item.id,
          batchId: batch.id,
          serialNumber,
          status: "AVAILABLE",
          remarks: payload.remarks || "Manual stock-in serial.",
          createdById: actor.id,
          updatedById: actor.id,
        },
      });

      createdSerials.push(serial);
    }

    return {
      batch,
      movement,
      serials: createdSerials,
    };
  });
};

const createStockAdjustment = async (actor, payload) => {
  const requestedBranchId = payload.branchId;
  const allowedBranchId = ensureManageBranchAccess(actor, requestedBranchId);

  const batch = await prisma.inventoryBatch.findFirst({
    where: {
      id: payload.batchId,
      branchId: allowedBranchId,
    },
    include: {
      item: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  if (!batch) {
    const error = new Error("BATCH_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  const quantity = Number(payload.quantity);
  const previousQuantity = Number(batch.quantityAvailable);

  let newQuantity = previousQuantity;

  if (payload.type === "INCREASE") {
    newQuantity = previousQuantity + quantity;
  }

  if (payload.type === "DECREASE") {
    newQuantity = previousQuantity - quantity;
  }

  if (newQuantity < 0) {
    const error = new Error("INSUFFICIENT_BATCH_QUANTITY");
    error.statusCode = 400;
    throw error;
  }

  const movementType = payload.type === "INCREASE" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";

  return prisma.$transaction(async (tx) => {
    const updatedBatch = await tx.inventoryBatch.update({
      where: {
        id: batch.id,
      },
      data: {
        quantityAvailable: newQuantity.toString(),
        status: newQuantity === 0 ? "DEPLETED" : "ACTIVE",
        updatedById: actor.id,
      },
    });

    const movementCode = await createMovementCode(batch.branch.code, batch.item.itemCode, movementType.replace("_", ""));

    const movement = await tx.inventoryMovement.create({
      data: {
        branchId: batch.branchId,
        itemId: batch.itemId,
        batchId: batch.id,
        movementCode,
        type: movementType,
        source: "MANUAL",
        quantity: quantity.toString(),
        previousQuantity: previousQuantity.toString(),
        newQuantity: newQuantity.toString(),
        unitCost: batch.unitCost.toString(),
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || "Manual stock adjustment.",
        createdById: actor.id,
        updatedById: actor.id,
      },
    });

    return {
      batch: updatedBatch,
      movement,
    };
  });
};
`;

content = content.replace(
  "module.exports = {",
  `${insertFunctions}\nmodule.exports = {`
);

content = content.replace(
  "getInventorySerials,",
  "getInventorySerials,\n  createStockIn,\n  createStockAdjustment,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.service.js patched with stock-in and adjustment functions.");
