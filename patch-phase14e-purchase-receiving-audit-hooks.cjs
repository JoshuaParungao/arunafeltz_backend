const fs = require("fs");
const path = require("path");

const root = process.cwd();
const servicePath = path.join(
  root,
  "src/modules/purchase-receivings/services/purchaseReceiving.service.js"
);

let content = fs.readFileSync(servicePath, "utf8");

if (!content.includes('const { createAuditLog } = require("../../../utils/auditLogger");')) {
  content = content.replace(
    'const AppError = require("../../../utils/appError");',
    'const AppError = require("../../../utils/appError");\nconst { createAuditLog } = require("../../../utils/auditLogger");'
  );
}

const oldCreateReceiving = `const createPurchaseReceiving = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const supplier = await getActiveSupplierForBranchOrThrow(payload.supplierId, branch.id);
  const purchaseOrder = await getPurchaseOrderForReceiving(
    payload.purchaseOrderId,
    branch.id,
    supplier.id
  );

  const receivingCode = payload.receivingCode
    ? payload.receivingCode.trim().toUpperCase()
    : await generateReceivingCode(branch);

  await assertReceivingCodeIsUnique(branch.id, receivingCode);

  const totals = await validateAndBuildItems(payload.items, branch.id, purchaseOrder);

  return prisma.purchaseReceiving.create({
    data: {
      receivingCode,
      status: "DRAFT",
      supplierDeliveryNo: normalizeOptionalString(payload.supplierDeliveryNo),
      supplierInvoiceNo: normalizeOptionalString(payload.supplierInvoiceNo),
      referenceNo: normalizeOptionalString(payload.referenceNo),
      supplierNameSnapshot: supplier.name,
      supplierContactSnapshot: supplier.contactNo,
      notes: normalizeOptionalString(payload.notes),
      internalNotes: normalizeOptionalString(payload.internalNotes),
      subtotal: totals.subtotal,
      totalDiscount: totals.totalDiscount,
      grandTotal: totals.grandTotal,
      branchId: branch.id,
      supplierId: supplier.id,
      purchaseOrderId: purchaseOrder ? purchaseOrder.id : null,
      createdById: actor.id,
      updatedById: actor.id,
      items: {
        create: totals.items,
      },
    },
    include: PURCHASE_RECEIVING_INCLUDE,
  });
};`;

const newCreateReceiving = `const createPurchaseReceiving = async (payload, actor) => {
  const branch = await getBranchForCreate(actor, payload.branchId);
  const supplier = await getActiveSupplierForBranchOrThrow(payload.supplierId, branch.id);
  const purchaseOrder = await getPurchaseOrderForReceiving(
    payload.purchaseOrderId,
    branch.id,
    supplier.id
  );

  const receivingCode = payload.receivingCode
    ? payload.receivingCode.trim().toUpperCase()
    : await generateReceivingCode(branch);

  await assertReceivingCodeIsUnique(branch.id, receivingCode);

  const totals = await validateAndBuildItems(payload.items, branch.id, purchaseOrder);

  return prisma.$transaction(async (tx) => {
    const receiving = await tx.purchaseReceiving.create({
      data: {
        receivingCode,
        status: "DRAFT",
        supplierDeliveryNo: normalizeOptionalString(payload.supplierDeliveryNo),
        supplierInvoiceNo: normalizeOptionalString(payload.supplierInvoiceNo),
        referenceNo: normalizeOptionalString(payload.referenceNo),
        supplierNameSnapshot: supplier.name,
        supplierContactSnapshot: supplier.contactNo,
        notes: normalizeOptionalString(payload.notes),
        internalNotes: normalizeOptionalString(payload.internalNotes),
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        grandTotal: totals.grandTotal,
        branchId: branch.id,
        supplierId: supplier.id,
        purchaseOrderId: purchaseOrder ? purchaseOrder.id : null,
        createdById: actor.id,
        updatedById: actor.id,
        items: {
          create: totals.items,
        },
      },
      include: PURCHASE_RECEIVING_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: receiving.branchId,
        action: "PURCHASE_RECEIVING_CREATED",
        entityType: "PurchaseReceiving",
        entityId: receiving.id,
        description: \`Purchase receiving \${receiving.receivingCode} created\`,
        metadata: {
          receivingCode: receiving.receivingCode,
          supplierId: receiving.supplierId,
          supplierNameSnapshot: receiving.supplierNameSnapshot,
          purchaseOrderId: receiving.purchaseOrderId,
          status: receiving.status,
          itemCount: receiving.items.length,
          subtotal: String(receiving.subtotal),
          totalDiscount: String(receiving.totalDiscount),
          grandTotal: String(receiving.grandTotal),
        },
      },
      tx
    );

    return receiving;
  });
};`;

if (!content.includes(oldCreateReceiving)) {
  throw new Error("createPurchaseReceiving exact block not found. Patch stopped.");
}

content = content.replace(oldCreateReceiving, newCreateReceiving);

const oldUpdateWithItems = `    return prisma.$transaction(async (tx) => {
      await tx.purchaseReceivingItem.deleteMany({
        where: {
          purchaseReceivingId: existingReceiving.id,
        },
      });

      return tx.purchaseReceiving.update({
        where: {
          id: existingReceiving.id,
        },
        data: {
          ...updateData,
          items: {
            create: totals.items,
          },
        },
        include: PURCHASE_RECEIVING_INCLUDE,
      });
    });`;

const newUpdateWithItems = `    const changedFields = Object.keys(updateData).filter(
      (field) => field !== "updatedById"
    );

    if (!changedFields.includes("items")) {
      changedFields.push("items");
    }

    return prisma.$transaction(async (tx) => {
      await tx.purchaseReceivingItem.deleteMany({
        where: {
          purchaseReceivingId: existingReceiving.id,
        },
      });

      const receiving = await tx.purchaseReceiving.update({
        where: {
          id: existingReceiving.id,
        },
        data: {
          ...updateData,
          items: {
            create: totals.items,
          },
        },
        include: PURCHASE_RECEIVING_INCLUDE,
      });

      await createAuditLog(
        {
          actor,
          branchId: receiving.branchId,
          action: "PURCHASE_RECEIVING_UPDATED",
          entityType: "PurchaseReceiving",
          entityId: receiving.id,
          description: \`Purchase receiving \${receiving.receivingCode} updated\`,
          metadata: {
            receivingCode: receiving.receivingCode,
            status: receiving.status,
            changedFields,
            previous: {
              receivingCode: existingReceiving.receivingCode,
              supplierDeliveryNo: existingReceiving.supplierDeliveryNo,
              supplierInvoiceNo: existingReceiving.supplierInvoiceNo,
              referenceNo: existingReceiving.referenceNo,
              notes: existingReceiving.notes,
              internalNotes: existingReceiving.internalNotes,
              itemCount: existingReceiving.items.length,
              subtotal: String(existingReceiving.subtotal),
              totalDiscount: String(existingReceiving.totalDiscount),
              grandTotal: String(existingReceiving.grandTotal),
            },
            current: {
              receivingCode: receiving.receivingCode,
              supplierDeliveryNo: receiving.supplierDeliveryNo,
              supplierInvoiceNo: receiving.supplierInvoiceNo,
              referenceNo: receiving.referenceNo,
              notes: receiving.notes,
              internalNotes: receiving.internalNotes,
              itemCount: receiving.items.length,
              subtotal: String(receiving.subtotal),
              totalDiscount: String(receiving.totalDiscount),
              grandTotal: String(receiving.grandTotal),
            },
          },
        },
        tx
      );

      return receiving;
    });`;

if (!content.includes(oldUpdateWithItems)) {
  throw new Error("updatePurchaseReceivingById items transaction block not found. Patch stopped.");
}

content = content.replace(oldUpdateWithItems, newUpdateWithItems);

const oldUpdateWithoutItems = `  return prisma.purchaseReceiving.update({
    where: {
      id: existingReceiving.id,
    },
    data: updateData,
    include: PURCHASE_RECEIVING_INCLUDE,
  });
};`;

const newUpdateWithoutItems = `  const changedFields = Object.keys(updateData).filter(
    (field) => field !== "updatedById"
  );

  return prisma.$transaction(async (tx) => {
    const receiving = await tx.purchaseReceiving.update({
      where: {
        id: existingReceiving.id,
      },
      data: updateData,
      include: PURCHASE_RECEIVING_INCLUDE,
    });

    await createAuditLog(
      {
        actor,
        branchId: receiving.branchId,
        action: "PURCHASE_RECEIVING_UPDATED",
        entityType: "PurchaseReceiving",
        entityId: receiving.id,
        description: \`Purchase receiving \${receiving.receivingCode} updated\`,
        metadata: {
          receivingCode: receiving.receivingCode,
          status: receiving.status,
          changedFields,
          previous: {
            receivingCode: existingReceiving.receivingCode,
            supplierDeliveryNo: existingReceiving.supplierDeliveryNo,
            supplierInvoiceNo: existingReceiving.supplierInvoiceNo,
            referenceNo: existingReceiving.referenceNo,
            notes: existingReceiving.notes,
            internalNotes: existingReceiving.internalNotes,
            itemCount: existingReceiving.items.length,
            subtotal: String(existingReceiving.subtotal),
            totalDiscount: String(existingReceiving.totalDiscount),
            grandTotal: String(existingReceiving.grandTotal),
          },
          current: {
            receivingCode: receiving.receivingCode,
            supplierDeliveryNo: receiving.supplierDeliveryNo,
            supplierInvoiceNo: receiving.supplierInvoiceNo,
            referenceNo: receiving.referenceNo,
            notes: receiving.notes,
            internalNotes: receiving.internalNotes,
            itemCount: receiving.items.length,
            subtotal: String(receiving.subtotal),
            totalDiscount: String(receiving.totalDiscount),
            grandTotal: String(receiving.grandTotal),
          },
        },
      },
      tx
    );

    return receiving;
  });
};`;

const updateWithoutItemsIndex = content.indexOf(oldUpdateWithoutItems);

if (updateWithoutItemsIndex === -1) {
  throw new Error("updatePurchaseReceivingById non-items update block not found. Patch stopped.");
}

content =
  content.slice(0, updateWithoutItemsIndex) +
  newUpdateWithoutItems +
  content.slice(updateWithoutItemsIndex + oldUpdateWithoutItems.length);

const oldPostReturn = `      return tx.purchaseReceiving.update({
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
      });`;

const newPostReturn = `      const postedReceiving = await tx.purchaseReceiving.update({
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

      await createAuditLog(
        {
          actor,
          branchId: postedReceiving.branchId,
          action: "PURCHASE_RECEIVING_POSTED",
          entityType: "PurchaseReceiving",
          entityId: postedReceiving.id,
          description: \`Purchase receiving \${postedReceiving.receivingCode} posted\`,
          metadata: {
            receivingCode: postedReceiving.receivingCode,
            purchaseOrderId: postedReceiving.purchaseOrderId,
            previousStatus: receiving.status,
            currentStatus: postedReceiving.status,
            postedAt: postedReceiving.postedAt,
            itemCount: postedReceiving.items.length,
            subtotal: String(postedReceiving.subtotal),
            totalDiscount: String(postedReceiving.totalDiscount),
            grandTotal: String(postedReceiving.grandTotal),
          },
        },
        tx
      );

      return postedReceiving;`;

if (!content.includes(oldPostReturn)) {
  throw new Error("POSTED receiving update block not found. Patch stopped.");
}

content = content.replace(oldPostReturn, newPostReturn);

const oldCancelReturn = `  return prisma.purchaseReceiving.update({
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

const newCancelReturn = `  return prisma.$transaction(async (tx) => {
    const receiving = await tx.purchaseReceiving.update({
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

    await createAuditLog(
      {
        actor,
        branchId: receiving.branchId,
        action: "PURCHASE_RECEIVING_CANCELLED",
        entityType: "PurchaseReceiving",
        entityId: receiving.id,
        description: \`Purchase receiving \${receiving.receivingCode} cancelled\`,
        metadata: {
          receivingCode: receiving.receivingCode,
          purchaseOrderId: receiving.purchaseOrderId,
          previousStatus: existingReceiving.status,
          currentStatus: receiving.status,
          cancellationReason: receiving.cancellationReason,
          cancelledAt: receiving.cancelledAt,
        },
      },
      tx
    );

    return receiving;
  });
};`;

if (!content.includes(oldCancelReturn)) {
  throw new Error("CANCELLED receiving update block not found. Patch stopped.");
}

content = content.replace(oldCancelReturn, newCancelReturn);

fs.writeFileSync(servicePath, content);

console.log("DONE: Phase 14E purchase receiving audit hooks patched.");
