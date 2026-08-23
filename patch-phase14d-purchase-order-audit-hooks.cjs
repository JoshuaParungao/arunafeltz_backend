const fs = require("fs");
const path = require("path");

const root = process.cwd();
const servicePath = path.join(
  root,
  "src/modules/purchase-orders/services/purchaseOrder.service.js"
);

let content = fs.readFileSync(servicePath, "utf8");

if (!content.includes('const { createAuditLog } = require("../../../utils/auditLogger");')) {
  content = content.replace(
    'const AppError = require("../../../utils/appError");',
    'const AppError = require("../../../utils/appError");\nconst { createAuditLog } = require("../../../utils/auditLogger");'
  );
}

const oldCreatePurchaseOrder = `const createPurchaseOrder = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const supplier = await getActiveSupplierForBranchOrThrow(payload.supplierId, branch.id);

  const poCode = payload.poCode
    ? payload.poCode.trim().toUpperCase()
    : await generatePurchaseOrderCode(branch);

  await assertPurchaseOrderCodeIsUnique(branch.id, poCode);

  const totals = await validateAndBuildItems(payload.items, branch.id);

  return prisma.purchaseOrder.create({
    data: {
      poCode,
      status: "DRAFT",
      expectedDate: normalizeOptionalDate(payload.expectedDate),
      supplierNameSnapshot: supplier.name,
      supplierContactSnapshot: supplier.contactNo,
      notes: normalizeOptionalString(payload.notes),
      internalNotes: normalizeOptionalString(payload.internalNotes),
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      grandTotal: totals.grandTotal,
      branchId: branch.id,
      supplierId: supplier.id,
      createdById: actor.id,
      updatedById: actor.id,
      items: {
        create: totals.items,
      },
    },
    include: PURCHASE_ORDER_INCLUDE,
  });
};`;

const newCreatePurchaseOrder = `const createPurchaseOrder = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const supplier = await getActiveSupplierForBranchOrThrow(payload.supplierId, branch.id);

  const poCode = payload.poCode
    ? payload.poCode.trim().toUpperCase()
    : await generatePurchaseOrderCode(branch);

  await assertPurchaseOrderCodeIsUnique(branch.id, poCode);

  const totals = await validateAndBuildItems(payload.items, branch.id);

  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        poCode,
        status: "DRAFT",
        expectedDate: normalizeOptionalDate(payload.expectedDate),
        supplierNameSnapshot: supplier.name,
        supplierContactSnapshot: supplier.contactNo,
        notes: normalizeOptionalString(payload.notes),
        internalNotes: normalizeOptionalString(payload.internalNotes),
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        grandTotal: totals.grandTotal,
        branchId: branch.id,
        supplierId: supplier.id,
        createdById: actor.id,
        updatedById: actor.id,
        items: {
          create: totals.items,
        },
      },
      include: PURCHASE_ORDER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: purchaseOrder.branchId,
        action: "PURCHASE_ORDER_CREATED",
        entityType: "PurchaseOrder",
        entityId: purchaseOrder.id,
        description: \`Purchase order \${purchaseOrder.poCode} created\`,
        metadata: {
          poCode: purchaseOrder.poCode,
          supplierId: purchaseOrder.supplierId,
          supplierNameSnapshot: purchaseOrder.supplierNameSnapshot,
          status: purchaseOrder.status,
          itemCount: purchaseOrder.items.length,
          subtotal: String(purchaseOrder.subtotal),
          totalDiscount: String(purchaseOrder.totalDiscount),
          grandTotal: String(purchaseOrder.grandTotal),
        },
      },
      tx
    );

    return purchaseOrder;
  });
};`;

if (!content.includes(oldCreatePurchaseOrder)) {
  throw new Error("createPurchaseOrder exact block not found. Patch stopped.");
}

content = content.replace(oldCreatePurchaseOrder, newCreatePurchaseOrder);

const oldUpdateWithItems = `    return prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({
        where: {
          purchaseOrderId: existingPurchaseOrder.id,
        },
      });

      return tx.purchaseOrder.update({
        where: {
          id: existingPurchaseOrder.id,
        },
        data: {
          ...updateData,
          items: {
            create: totals.items,
          },
        },
        include: PURCHASE_ORDER_INCLUDE,
      });
    });`;

const newUpdateWithItems = `    const changedFields = Object.keys(updateData).filter(
      (field) => field !== "updatedById"
    );

    if (!changedFields.includes("items")) {
      changedFields.push("items");
    }

    return prisma.$transaction(async (tx) => {
      await tx.purchaseOrderItem.deleteMany({
        where: {
          purchaseOrderId: existingPurchaseOrder.id,
        },
      });

      const purchaseOrder = await tx.purchaseOrder.update({
        where: {
          id: existingPurchaseOrder.id,
        },
        data: {
          ...updateData,
          items: {
            create: totals.items,
          },
        },
        include: PURCHASE_ORDER_INCLUDE,
      });

      await createAuditLog(
        {
          actor,
          branchId: purchaseOrder.branchId,
          action: "PURCHASE_ORDER_UPDATED",
          entityType: "PurchaseOrder",
          entityId: purchaseOrder.id,
          description: \`Purchase order \${purchaseOrder.poCode} updated\`,
          metadata: {
            poCode: purchaseOrder.poCode,
            status: purchaseOrder.status,
            changedFields,
            previous: {
              poCode: existingPurchaseOrder.poCode,
              expectedDate: existingPurchaseOrder.expectedDate,
              notes: existingPurchaseOrder.notes,
              internalNotes: existingPurchaseOrder.internalNotes,
              itemCount: existingPurchaseOrder.items.length,
              subtotal: String(existingPurchaseOrder.subtotal),
              totalDiscount: String(existingPurchaseOrder.totalDiscount),
              grandTotal: String(existingPurchaseOrder.grandTotal),
            },
            current: {
              poCode: purchaseOrder.poCode,
              expectedDate: purchaseOrder.expectedDate,
              notes: purchaseOrder.notes,
              internalNotes: purchaseOrder.internalNotes,
              itemCount: purchaseOrder.items.length,
              subtotal: String(purchaseOrder.subtotal),
              totalDiscount: String(purchaseOrder.totalDiscount),
              grandTotal: String(purchaseOrder.grandTotal),
            },
          },
        },
        tx
      );

      return purchaseOrder;
    });`;

if (!content.includes(oldUpdateWithItems)) {
  throw new Error("updatePurchaseOrderById items transaction block not found. Patch stopped.");
}

content = content.replace(oldUpdateWithItems, newUpdateWithItems);

const oldUpdateWithoutItems = `  return prisma.purchaseOrder.update({
    where: {
      id: existingPurchaseOrder.id,
    },
    data: updateData,
    include: PURCHASE_ORDER_INCLUDE,
  });
};`;

const newUpdateWithoutItems = `  const changedFields = Object.keys(updateData).filter(
    (field) => field !== "updatedById"
  );

  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.update({
      where: {
        id: existingPurchaseOrder.id,
      },
      data: updateData,
      include: PURCHASE_ORDER_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: purchaseOrder.branchId,
        action: "PURCHASE_ORDER_UPDATED",
        entityType: "PurchaseOrder",
        entityId: purchaseOrder.id,
        description: \`Purchase order \${purchaseOrder.poCode} updated\`,
        metadata: {
          poCode: purchaseOrder.poCode,
          status: purchaseOrder.status,
          changedFields,
          previous: {
            poCode: existingPurchaseOrder.poCode,
            expectedDate: existingPurchaseOrder.expectedDate,
            notes: existingPurchaseOrder.notes,
            internalNotes: existingPurchaseOrder.internalNotes,
            itemCount: existingPurchaseOrder.items.length,
            subtotal: String(existingPurchaseOrder.subtotal),
            totalDiscount: String(existingPurchaseOrder.totalDiscount),
            grandTotal: String(existingPurchaseOrder.grandTotal),
          },
          current: {
            poCode: purchaseOrder.poCode,
            expectedDate: purchaseOrder.expectedDate,
            notes: purchaseOrder.notes,
            internalNotes: purchaseOrder.internalNotes,
            itemCount: purchaseOrder.items.length,
            subtotal: String(purchaseOrder.subtotal),
            totalDiscount: String(purchaseOrder.totalDiscount),
            grandTotal: String(purchaseOrder.grandTotal),
          },
        },
      },
      tx
    );

    return purchaseOrder;
  });
};`;

const updateWithoutItemsIndex = content.indexOf(oldUpdateWithoutItems);

if (updateWithoutItemsIndex === -1) {
  throw new Error("updatePurchaseOrderById non-items update block not found. Patch stopped.");
}

content =
  content.slice(0, updateWithoutItemsIndex) +
  newUpdateWithoutItems +
  content.slice(updateWithoutItemsIndex + oldUpdateWithoutItems.length);

const oldStatusUpdate = `  return prisma.purchaseOrder.update({
    where: {
      id: existingPurchaseOrder.id,
    },
    data: updateData,
    include: PURCHASE_ORDER_INCLUDE,
  });
};`;

const newStatusUpdate = `  return prisma.$transaction(async (tx) => {
    const purchaseOrder = await tx.purchaseOrder.update({
      where: {
        id: existingPurchaseOrder.id,
      },
      data: updateData,
      include: PURCHASE_ORDER_INCLUDE,
    });

    const action =
      purchaseOrder.status === "ORDERED"
        ? "PURCHASE_ORDER_ORDERED"
        : "PURCHASE_ORDER_CANCELLED";

    await createAuditLog(
      {
        actor,
        branchId: purchaseOrder.branchId,
        action,
        entityType: "PurchaseOrder",
        entityId: purchaseOrder.id,
        description: \`Purchase order \${purchaseOrder.poCode} status updated to \${purchaseOrder.status}\`,
        metadata: {
          poCode: purchaseOrder.poCode,
          previousStatus: existingPurchaseOrder.status,
          currentStatus: purchaseOrder.status,
          cancellationReason: purchaseOrder.cancellationReason,
          orderedAt: purchaseOrder.orderedAt,
          cancelledAt: purchaseOrder.cancelledAt,
        },
      },
      tx
    );

    return purchaseOrder;
  });
};`;

if (!content.includes(oldStatusUpdate)) {
  throw new Error("updatePurchaseOrderStatusById update block not found. Patch stopped.");
}

content = content.replace(oldStatusUpdate, newStatusUpdate);

fs.writeFileSync(servicePath, content);

console.log("DONE: Phase 14D purchase order audit hooks patched.");
