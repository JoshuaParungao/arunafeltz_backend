const fs = require("fs");

const filePath = "./src/modules/sales/services/sale.service.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.service.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("const cancelSale = async")) {
  console.log("SKIP: cancelSale service already exists.");
  process.exit(0);
}

const functionsToAdd = `
const generateSaleCancelMovementCode = async (tx, branchCode, itemCode, branchId) => {
  const prefix = \`MOV-\${branchCode}-\${itemCode}-CANCELIN-\`;

  const count = await tx.inventoryMovement.count({
    where: {
      branchId,
      movementCode: {
        startsWith: prefix,
      },
    },
  });

  return \`\${prefix}\${String(count + 1).padStart(3, "0")}\`;
};

const restoreSaleItemStock = async ({ tx, actor, sale, saleItem }) => {
  if (!saleItem.itemId || !saleItem.batchId) {
    return;
  }

  const batch = await tx.inventoryBatch.findUnique({
    where: {
      id: saleItem.batchId,
    },
  });

  if (!batch) {
    const error = new Error("BATCH_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  const previousQuantity = Number(batch.quantityAvailable);
  const restoreQuantity = toMoney(saleItem.quantity);
  const newQuantity = toMoney(previousQuantity + restoreQuantity);

  await tx.inventoryBatch.update({
    where: {
      id: batch.id,
    },
    data: {
      quantityAvailable: toMoneyString(newQuantity),
      status: "ACTIVE",
      updatedById: actor.id,
    },
  });

  if (saleItem.serialId) {
    const serial = await tx.itemSerial.findUnique({
      where: {
        id: saleItem.serialId,
      },
    });

    if (!serial) {
      const error = new Error("SERIAL_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    if (serial.status !== "SOLD") {
      const error = new Error("SERIAL_CANCEL_STATUS_INVALID");
      error.statusCode = 400;
      throw error;
    }

    await tx.itemSerial.update({
      where: {
        id: serial.id,
      },
      data: {
        status: "AVAILABLE",
        updatedById: actor.id,
      },
    });
  }

  const itemCode = saleItem.itemCodeSnapshot || "ITEM";
  const movementCode = await generateSaleCancelMovementCode(
    tx,
    sale.branch.code,
    itemCode,
    sale.branchId
  );

  await tx.inventoryMovement.create({
    data: {
      branchId: sale.branchId,
      itemId: saleItem.itemId,
      batchId: saleItem.batchId,
      serialId: saleItem.serialId || null,
      movementCode,
      type: "RETURN_IN",
      source: "SALE",
      quantity: toMoneyString(restoreQuantity),
      previousQuantity: toMoneyString(previousQuantity),
      newQuantity: toMoneyString(newQuantity),
      unitCost: batch.unitCost.toString(),
      referenceNo: sale.receiptCode,
      remarks: \`Sale cancellation stock restore for \${sale.receiptCode}.\`,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
};

const cancelSale = async (actor, saleId, payload) => {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: {
        id: saleId,
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        items: {
          orderBy: {
            lineNo: "asc",
          },
        },
      },
    });

    if (!sale) {
      const error = new Error("SALE_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessSaleBranch(actor, sale);

    if (!OWNER_ADMIN_ROLES.has(actor.role)) {
      const error = new Error("SALE_CANCEL_FORBIDDEN");
      error.statusCode = 403;
      throw error;
    }

    if (sale.status !== "COMPLETED") {
      const error = new Error("SALE_NOT_CANCELLABLE");
      error.statusCode = 400;
      throw error;
    }

    for (const saleItem of sale.items) {
      await restoreSaleItemStock({
        tx,
        actor,
        sale,
        saleItem,
      });
    }

    const cancelledSale = await tx.sale.update({
      where: {
        id: sale.id,
      },
      data: {
        status: "CANCELLED",
        cancellationReason: payload.cancellationReason,
        cancelledAt: new Date(),
        cancelledById: actor.id,
        updatedById: actor.id,
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        customer: {
          select: {
            id: true,
            customerCode: true,
            fullName: true,
            mobileNumber: true,
            email: true,
          },
        },
        quotation: {
          select: {
            id: true,
            quotationCode: true,
            status: true,
          },
        },
        cashier: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        updatedBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        cancelledBy: {
          select: {
            id: true,
            username: true,
            fullName: true,
            role: true,
          },
        },
        items: {
          orderBy: {
            lineNo: "asc",
          },
        },
        payments: {
          orderBy: {
            paidAt: "asc",
          },
        },
      },
    });

    return cancelledSale;
  });
};
`;

content = content.replace(
  "module.exports = {",
  `${functionsToAdd}\nmodule.exports = {`
);

content = content.replace(
  "getSaleById,",
  "getSaleById,\n  cancelSale,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.service.js patched with cancelSale.");
