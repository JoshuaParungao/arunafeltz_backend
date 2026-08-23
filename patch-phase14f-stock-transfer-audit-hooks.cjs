const fs = require("fs");
const path = require("path");

const root = process.cwd();
const servicePath = path.join(
  root,
  "src/modules/stock-transfers/services/stockTransfer.service.js"
);

let content = fs.readFileSync(servicePath, "utf8");

if (!content.includes('const { createAuditLog } = require("../../../utils/auditLogger");')) {
  content = content.replace(
    'const AppError = require("../../../utils/appError");',
    'const AppError = require("../../../utils/appError");\nconst { createAuditLog } = require("../../../utils/auditLogger");'
  );
}

const oldCreateStockTransfer = `const createStockTransfer = async (payload, actor) => {
  const fromBranch = await getFromBranchForCreate(actor, payload.fromBranchId);
  const toBranch = await getActiveBranchOrThrow(payload.toBranchId, "To branch");

  assertDifferentBranches(fromBranch.id, toBranch.id);

  const transferCode = payload.transferCode
    ? payload.transferCode.trim().toUpperCase()
    : await generateTransferCode(fromBranch);

  await assertTransferCodeIsUnique(fromBranch.id, transferCode);

  const items = await validateAndBuildItems(payload.items, fromBranch.id);

  return prisma.stockTransfer.create({
    data: {
      transferCode,
      status: "DRAFT",
      notes: normalizeOptionalString(payload.notes),
      internalNotes: normalizeOptionalString(payload.internalNotes),
      fromBranchId: fromBranch.id,
      toBranchId: toBranch.id,
      createdById: actor.id,
      updatedById: actor.id,
      items: {
        create: items,
      },
    },
    include: STOCK_TRANSFER_INCLUDE,
  });
};`;

const newCreateStockTransfer = `const createStockTransfer = async (payload, actor) => {
  const fromBranch = await getFromBranchForCreate(actor, payload.fromBranchId);
  const toBranch = await getActiveBranchOrThrow(payload.toBranchId, "To branch");

  assertDifferentBranches(fromBranch.id, toBranch.id);

  const transferCode = payload.transferCode
    ? payload.transferCode.trim().toUpperCase()
    : await generateTransferCode(fromBranch);

  await assertTransferCodeIsUnique(fromBranch.id, transferCode);

  const items = await validateAndBuildItems(payload.items, fromBranch.id);

  return prisma.$transaction(async (tx) => {
    const stockTransfer = await tx.stockTransfer.create({
      data: {
        transferCode,
        status: "DRAFT",
        notes: normalizeOptionalString(payload.notes),
        internalNotes: normalizeOptionalString(payload.internalNotes),
        fromBranchId: fromBranch.id,
        toBranchId: toBranch.id,
        createdById: actor.id,
        updatedById: actor.id,
        items: {
          create: items,
        },
      },
      include: STOCK_TRANSFER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: stockTransfer.fromBranchId,
        action: "STOCK_TRANSFER_CREATED",
        entityType: "StockTransfer",
        entityId: stockTransfer.id,
        description: \`Stock transfer \${stockTransfer.transferCode} created\`,
        metadata: {
          transferCode: stockTransfer.transferCode,
          status: stockTransfer.status,
          fromBranchId: stockTransfer.fromBranchId,
          toBranchId: stockTransfer.toBranchId,
          itemCount: stockTransfer.items.length,
          notes: stockTransfer.notes,
          internalNotes: stockTransfer.internalNotes,
        },
      },
      tx
    );

    return stockTransfer;
  });
};`;

if (!content.includes(oldCreateStockTransfer)) {
  throw new Error("createStockTransfer exact block not found. Patch stopped.");
}

content = content.replace(oldCreateStockTransfer, newCreateStockTransfer);

const oldUpdateWithItems = `    return prisma.$transaction(async (tx) => {
      await tx.stockTransferItem.deleteMany({
        where: {
          stockTransferId: existingTransfer.id,
        },
      });

      return tx.stockTransfer.update({
        where: {
          id: existingTransfer.id,
        },
        data: {
          ...updateData,
          items: {
            create: items,
          },
        },
        include: STOCK_TRANSFER_INCLUDE,
      });
    });`;

const newUpdateWithItems = `    const changedFields = Object.keys(updateData).filter(
      (field) => field !== "updatedById"
    );

    if (!changedFields.includes("items")) {
      changedFields.push("items");
    }

    return prisma.$transaction(async (tx) => {
      await tx.stockTransferItem.deleteMany({
        where: {
          stockTransferId: existingTransfer.id,
        },
      });

      const stockTransfer = await tx.stockTransfer.update({
        where: {
          id: existingTransfer.id,
        },
        data: {
          ...updateData,
          items: {
            create: items,
          },
        },
        include: STOCK_TRANSFER_INCLUDE,
      });

      await createAuditLog(
        {
          actor,
          branchId: stockTransfer.fromBranchId,
          action: "STOCK_TRANSFER_UPDATED",
          entityType: "StockTransfer",
          entityId: stockTransfer.id,
          description: \`Stock transfer \${stockTransfer.transferCode} updated\`,
          metadata: {
            transferCode: stockTransfer.transferCode,
            status: stockTransfer.status,
            changedFields,
            previous: {
              transferCode: existingTransfer.transferCode,
              fromBranchId: existingTransfer.fromBranchId,
              toBranchId: existingTransfer.toBranchId,
              notes: existingTransfer.notes,
              internalNotes: existingTransfer.internalNotes,
              itemCount: existingTransfer.items.length,
            },
            current: {
              transferCode: stockTransfer.transferCode,
              fromBranchId: stockTransfer.fromBranchId,
              toBranchId: stockTransfer.toBranchId,
              notes: stockTransfer.notes,
              internalNotes: stockTransfer.internalNotes,
              itemCount: stockTransfer.items.length,
            },
          },
        },
        tx
      );

      return stockTransfer;
    });`;

if (!content.includes(oldUpdateWithItems)) {
  throw new Error("updateStockTransferById items transaction block not found. Patch stopped.");
}

content = content.replace(oldUpdateWithItems, newUpdateWithItems);

const oldUpdateWithoutItems = `  return prisma.stockTransfer.update({
    where: {
      id: existingTransfer.id,
    },
    data: updateData,
    include: STOCK_TRANSFER_INCLUDE,
  });
};`;

const newUpdateWithoutItems = `  const changedFields = Object.keys(updateData).filter(
    (field) => field !== "updatedById"
  );

  return prisma.$transaction(async (tx) => {
    const stockTransfer = await tx.stockTransfer.update({
      where: {
        id: existingTransfer.id,
      },
      data: updateData,
      include: STOCK_TRANSFER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: stockTransfer.fromBranchId,
        action: "STOCK_TRANSFER_UPDATED",
        entityType: "StockTransfer",
        entityId: stockTransfer.id,
        description: \`Stock transfer \${stockTransfer.transferCode} updated\`,
        metadata: {
          transferCode: stockTransfer.transferCode,
          status: stockTransfer.status,
          changedFields,
          previous: {
            transferCode: existingTransfer.transferCode,
            fromBranchId: existingTransfer.fromBranchId,
            toBranchId: existingTransfer.toBranchId,
            notes: existingTransfer.notes,
            internalNotes: existingTransfer.internalNotes,
            itemCount: existingTransfer.items.length,
          },
          current: {
            transferCode: stockTransfer.transferCode,
            fromBranchId: stockTransfer.fromBranchId,
            toBranchId: stockTransfer.toBranchId,
            notes: stockTransfer.notes,
            internalNotes: stockTransfer.internalNotes,
            itemCount: stockTransfer.items.length,
          },
        },
      },
      tx
    );

    return stockTransfer;
  });
};`;

const updateWithoutItemsIndex = content.indexOf(oldUpdateWithoutItems);

if (updateWithoutItemsIndex === -1) {
  throw new Error("updateStockTransferById non-items update block not found. Patch stopped.");
}

content =
  content.slice(0, updateWithoutItemsIndex) +
  newUpdateWithoutItems +
  content.slice(updateWithoutItemsIndex + oldUpdateWithoutItems.length);

const oldPostReturn = `      return tx.stockTransfer.update({
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
      });`;

const newPostReturn = `      const postedTransfer = await tx.stockTransfer.update({
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

      await createAuditLog(
        {
          actor,
          branchId: postedTransfer.fromBranchId,
          action: "STOCK_TRANSFER_POSTED",
          entityType: "StockTransfer",
          entityId: postedTransfer.id,
          description: \`Stock transfer \${postedTransfer.transferCode} posted\`,
          metadata: {
            transferCode: postedTransfer.transferCode,
            previousStatus: stockTransfer.status,
            currentStatus: postedTransfer.status,
            fromBranchId: postedTransfer.fromBranchId,
            toBranchId: postedTransfer.toBranchId,
            postedAt: postedTransfer.postedAt,
            itemCount: postedTransfer.items.length,
          },
        },
        tx
      );

      return postedTransfer;`;

if (!content.includes(oldPostReturn)) {
  throw new Error("POSTED stock transfer update block not found. Patch stopped.");
}

content = content.replace(oldPostReturn, newPostReturn);

const oldStatusReturn = `  return prisma.stockTransfer.update({
    where: {
      id: existingTransfer.id,
    },
    data: updateData,
    include: STOCK_TRANSFER_INCLUDE,
  });
};`;

const newStatusReturn = `  return prisma.$transaction(async (tx) => {
    const stockTransfer = await tx.stockTransfer.update({
      where: {
        id: existingTransfer.id,
      },
      data: updateData,
      include: STOCK_TRANSFER_INCLUDE,
    });

    const actionMap = {
      REQUESTED: "STOCK_TRANSFER_REQUESTED",
      APPROVED: "STOCK_TRANSFER_APPROVED",
      REJECTED: "STOCK_TRANSFER_REJECTED",
      CANCELLED: "STOCK_TRANSFER_CANCELLED",
    };

    await createAuditLog(
      {
        actor,
        branchId: stockTransfer.fromBranchId,
        action: actionMap[stockTransfer.status] || "STOCK_TRANSFER_STATUS_UPDATED",
        entityType: "StockTransfer",
        entityId: stockTransfer.id,
        description: \`Stock transfer \${stockTransfer.transferCode} status updated to \${stockTransfer.status}\`,
        metadata: {
          transferCode: stockTransfer.transferCode,
          previousStatus: existingTransfer.status,
          currentStatus: stockTransfer.status,
          fromBranchId: stockTransfer.fromBranchId,
          toBranchId: stockTransfer.toBranchId,
          requestedAt: stockTransfer.requestedAt,
          approvedAt: stockTransfer.approvedAt,
          rejectedAt: stockTransfer.rejectedAt,
          cancelledAt: stockTransfer.cancelledAt,
          rejectionReason: stockTransfer.rejectionReason,
          cancellationReason: stockTransfer.cancellationReason,
          itemCount: stockTransfer.items.length,
        },
      },
      tx
    );

    return stockTransfer;
  });
};`;

if (!content.includes(oldStatusReturn)) {
  throw new Error("stock transfer status update return block not found. Patch stopped.");
}

content = content.replace(oldStatusReturn, newStatusReturn);

fs.writeFileSync(servicePath, content);

console.log("DONE: Phase 14F stock transfer audit hooks patched.");
