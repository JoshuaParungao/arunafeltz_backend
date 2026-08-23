require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const main = async () => {
  console.log("PHASE 13 MODULE 13F: PURCHASE RECEIVING DB CHECK");
  console.log("------------------------------------------------");

  assert(Boolean(prisma.purchaseReceiving), "Prisma purchaseReceiving model is available");
  assert(Boolean(prisma.purchaseReceivingItem), "Prisma purchaseReceivingItem model is available");

  const receivingCount = await prisma.purchaseReceiving.count();
  const receivingItemCount = await prisma.purchaseReceivingItem.count();

  assert(Number.isInteger(receivingCount), "PurchaseReceiving count works");
  assert(Number.isInteger(receivingItemCount), "PurchaseReceivingItem count works");

  const branch = await prisma.branch.findFirst({
    where: {
      code: "MAIN",
    },
    include: {
      purchaseReceivings: true,
    },
  });

  assert(Boolean(branch), "MAIN branch found");
  assert(Array.isArray(branch.purchaseReceivings), "Branch purchaseReceivings relation works");

  const user = await prisma.user.findFirst({
    where: {
      username: "mainadmin",
    },
    include: {
      createdPurchaseReceivings: true,
      updatedPurchaseReceivings: true,
      postedPurchaseReceivings: true,
      cancelledPurchaseReceivings: true,
    },
  });

  assert(Boolean(user), "User found");
  assert(Array.isArray(user.createdPurchaseReceivings), "User createdPurchaseReceivings relation works");
  assert(Array.isArray(user.updatedPurchaseReceivings), "User updatedPurchaseReceivings relation works");
  assert(Array.isArray(user.postedPurchaseReceivings), "User postedPurchaseReceivings relation works");
  assert(Array.isArray(user.cancelledPurchaseReceivings), "User cancelledPurchaseReceivings relation works");

  const item = await prisma.item.findFirst({
    where: {
      branchId: branch.id,
      status: "ACTIVE",
    },
    include: {
      purchaseReceivingItems: true,
    },
  });

  assert(Boolean(item), "Active item found");
  assert(Array.isArray(item.purchaseReceivingItems), "Item purchaseReceivingItems relation works");

  await prisma.purchaseReceiving.deleteMany({
    where: {
      branchId: branch.id,
      receivingCode: {
        startsWith: "RECTEST-13F-",
      },
    },
  });

  await prisma.purchaseOrder.deleteMany({
    where: {
      branchId: branch.id,
      poCode: {
        startsWith: "RECTEST-13F-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "RECTEST-13F-",
      },
    },
  });

  assert(true, "Previous 13F receiving test data cleared");

  const supplier = await prisma.supplier.create({
    data: {
      supplierCode: "RECTEST-13F-SUPPLIER",
      name: "13F Receiving Test Supplier",
      contactPerson: "Receiving Supplier Contact",
      contactNo: "09170001360",
      email: "receiving13f@supplier.test",
      status: "ACTIVE",
      branchId: branch.id,
      createdById: user.id,
      updatedById: user.id,
    },
    include: {
      purchaseReceivings: true,
    },
  });

  assert(Boolean(supplier.id), "Supplier for receiving test created");
  assert(Array.isArray(supplier.purchaseReceivings), "Supplier purchaseReceivings relation works");

  const quantity = 5;
  const unitCost = Number(item.costPrice) > 0 ? Number(item.costPrice) : 800;
  const lineTotal = quantity * unitCost;

  const purchaseOrder = await prisma.purchaseOrder.create({
    data: {
      poCode: "RECTEST-13F-PO-0001",
      status: "ORDERED",
      supplierNameSnapshot: supplier.name,
      supplierContactSnapshot: supplier.contactNo,
      subtotal: lineTotal,
      totalDiscount: 0,
      grandTotal: lineTotal,
      orderedAt: new Date(),
      branchId: branch.id,
      supplierId: supplier.id,
      createdById: user.id,
      updatedById: user.id,
      orderedById: user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: item.itemName,
            quantity,
            receivedQuantity: 0,
            unitCost,
            discountAmount: 0,
            lineTotal,
            itemId: item.id,
          },
        ],
      },
    },
    include: {
      items: true,
      purchaseReceivings: true,
    },
  });

  assert(Boolean(purchaseOrder.id), "PurchaseOrder for receiving test created");
  assert(Array.isArray(purchaseOrder.purchaseReceivings), "PurchaseOrder purchaseReceivings relation works");
  assert(purchaseOrder.items.length === 1, "PurchaseOrder item ready");

  const purchaseOrderItem = purchaseOrder.items[0];

  const created = await prisma.purchaseReceiving.create({
    data: {
      receivingCode: "RECTEST-13F-0001",
      status: "DRAFT",
      supplierDeliveryNo: "SUP-DR-13F-0001",
      supplierInvoiceNo: "SUP-INV-13F-0001",
      referenceNo: "REF-13F-0001",
      supplierNameSnapshot: supplier.name,
      supplierContactSnapshot: supplier.contactNo,
      notes: "Phase 13F receiving DB test only",
      subtotal: lineTotal,
      totalDiscount: 0,
      grandTotal: lineTotal,
      branchId: branch.id,
      supplierId: supplier.id,
      purchaseOrderId: purchaseOrder.id,
      createdById: user.id,
      updatedById: user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: item.itemName,
            quantityReceived: quantity,
            unitCost,
            discountAmount: 0,
            lineTotal,
            batchCode: "BATCH-13F-0001",
            itemId: item.id,
            purchaseOrderItemId: purchaseOrderItem.id,
          },
        ],
      },
    },
    include: {
      branch: true,
      supplier: true,
      purchaseOrder: true,
      createdBy: true,
      updatedBy: true,
      items: {
        include: {
          item: true,
          purchaseOrderItem: true,
        },
      },
    },
  });

  assert(Boolean(created.id), "PurchaseReceiving create works");
  assert(created.status === "DRAFT", "PurchaseReceiving status saved as DRAFT");
  assert(created.branch.id === branch.id, "PurchaseReceiving branch relation works");
  assert(created.supplier.id === supplier.id, "PurchaseReceiving supplier relation works");
  assert(created.purchaseOrder.id === purchaseOrder.id, "PurchaseReceiving purchaseOrder relation works");
  assert(created.createdBy.id === user.id, "PurchaseReceiving createdBy relation works");
  assert(created.updatedBy.id === user.id, "PurchaseReceiving updatedBy relation works");
  assert(created.items.length === 1, "PurchaseReceivingItem nested create works");
  assert(created.items[0].item.id === item.id, "PurchaseReceivingItem item relation works");
  assert(created.items[0].purchaseOrderItem.id === purchaseOrderItem.id, "PurchaseReceivingItem purchaseOrderItem relation works");
  assert(Number(created.items[0].quantityReceived) === quantity, "PurchaseReceivingItem quantityReceived saved");
  assert(Number(created.items[0].lineTotal) === lineTotal, "PurchaseReceivingItem lineTotal saved");

  const fetched = await prisma.purchaseReceiving.findUnique({
    where: {
      id: created.id,
    },
    include: {
      branch: true,
      supplier: {
        include: {
          purchaseReceivings: true,
        },
      },
      purchaseOrder: {
        include: {
          purchaseReceivings: true,
        },
      },
      items: true,
    },
  });

  assert(Boolean(fetched), "PurchaseReceiving fetch works");
  assert(fetched.items.length === 1, "PurchaseReceiving items relation works");
  assert(
    fetched.supplier.purchaseReceivings.some((receiving) => receiving.id === created.id),
    "Supplier can fetch linked receiving"
  );
  assert(
    fetched.purchaseOrder.purchaseReceivings.some((receiving) => receiving.id === created.id),
    "PurchaseOrder can fetch linked receiving"
  );

  const posted = await prisma.purchaseReceiving.update({
    where: {
      id: created.id,
    },
    data: {
      status: "POSTED",
      postedAt: new Date(),
      postedById: user.id,
      updatedById: user.id,
    },
    include: {
      postedBy: true,
    },
  });

  assert(posted.status === "POSTED", "PurchaseReceiving status can update to POSTED");
  assert(Boolean(posted.postedAt), "PurchaseReceiving postedAt saved");
  assert(posted.postedBy.id === user.id, "PurchaseReceiving postedBy relation works");

  await prisma.purchaseReceiving.delete({
    where: {
      id: created.id,
    },
  });

  const leftoverItems = await prisma.purchaseReceivingItem.count({
    where: {
      purchaseReceivingId: created.id,
    },
  });

  assert(leftoverItems === 0, "PurchaseReceivingItem cascade cleanup works");

  await prisma.purchaseOrder.delete({
    where: {
      id: purchaseOrder.id,
    },
  });

  await prisma.supplier.delete({
    where: {
      id: supplier.id,
    },
  });

  console.log("\nPHASE 13 MODULE 13F PURCHASE RECEIVING DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13F PURCHASE RECEIVING DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
