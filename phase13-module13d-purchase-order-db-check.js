require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const main = async () => {
  console.log("PHASE 13 MODULE 13D: PURCHASE ORDER DB CHECK");
  console.log("--------------------------------------------");

  assert(Boolean(prisma.purchaseOrder), "Prisma purchaseOrder model is available");
  assert(Boolean(prisma.purchaseOrderItem), "Prisma purchaseOrderItem model is available");

  const poCount = await prisma.purchaseOrder.count();
  const poItemCount = await prisma.purchaseOrderItem.count();

  assert(Number.isInteger(poCount), "PurchaseOrder count works");
  assert(Number.isInteger(poItemCount), "PurchaseOrderItem count works");

  const branch = await prisma.branch.findFirst({
    where: {
      code: "MAIN",
    },
    include: {
      purchaseOrders: true,
    },
  });

  assert(Boolean(branch), "MAIN branch found");
  assert(Array.isArray(branch.purchaseOrders), "Branch purchaseOrders relation works");

  const user = await prisma.user.findFirst({
    where: {
      username: "mainadmin",
    },
    include: {
      createdPurchaseOrders: true,
      updatedPurchaseOrders: true,
      orderedPurchaseOrders: true,
      cancelledPurchaseOrders: true,
    },
  });

  assert(Boolean(user), "User found");
  assert(Array.isArray(user.createdPurchaseOrders), "User createdPurchaseOrders relation works");
  assert(Array.isArray(user.updatedPurchaseOrders), "User updatedPurchaseOrders relation works");
  assert(Array.isArray(user.orderedPurchaseOrders), "User orderedPurchaseOrders relation works");
  assert(Array.isArray(user.cancelledPurchaseOrders), "User cancelledPurchaseOrders relation works");

  const item = await prisma.item.findFirst({
    where: {
      branchId: branch.id,
      status: "ACTIVE",
    },
    include: {
      purchaseOrderItems: true,
    },
  });

  assert(Boolean(item), "Active item found");
  assert(Array.isArray(item.purchaseOrderItems), "Item purchaseOrderItems relation works");

  await prisma.purchaseOrder.deleteMany({
    where: {
      branchId: branch.id,
      poCode: {
        startsWith: "POTEST-13D-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "POTEST-13D-",
      },
    },
  });

  assert(true, "Previous 13D purchase order test data cleared");

  const supplier = await prisma.supplier.create({
    data: {
      supplierCode: "POTEST-13D-SUPPLIER",
      name: "13D PO Test Supplier",
      contactPerson: "PO Supplier Contact",
      contactNo: "09170001340",
      email: "po13d@supplier.test",
      address: "PO Supplier Address",
      tin: "TIN-13D-PO",
      notes: "Phase 13D PO supplier test only",
      status: "ACTIVE",
      branchId: branch.id,
      createdById: user.id,
      updatedById: user.id,
    },
    include: {
      purchaseOrders: true,
    },
  });

  assert(Boolean(supplier.id), "Supplier for PO test created");
  assert(Array.isArray(supplier.purchaseOrders), "Supplier purchaseOrders relation works");

  const quantity = 2;
  const unitCost = Number(item.costPrice) > 0 ? Number(item.costPrice) : 1000;
  const lineTotal = quantity * unitCost;

  const created = await prisma.purchaseOrder.create({
    data: {
      poCode: "POTEST-13D-0001",
      status: "DRAFT",
      supplierNameSnapshot: supplier.name,
      supplierContactSnapshot: supplier.contactNo,
      notes: "Phase 13D PO DB test only",
      subtotal: lineTotal,
      totalDiscount: 0,
      grandTotal: lineTotal,
      branchId: branch.id,
      supplierId: supplier.id,
      createdById: user.id,
      updatedById: user.id,
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
      branch: true,
      supplier: true,
      createdBy: true,
      updatedBy: true,
      items: {
        include: {
          item: true,
        },
      },
    },
  });

  assert(Boolean(created.id), "PurchaseOrder create works");
  assert(created.status === "DRAFT", "PurchaseOrder status saved as DRAFT");
  assert(created.branch.id === branch.id, "PurchaseOrder branch relation works");
  assert(created.supplier.id === supplier.id, "PurchaseOrder supplier relation works");
  assert(created.createdBy.id === user.id, "PurchaseOrder createdBy relation works");
  assert(created.updatedBy.id === user.id, "PurchaseOrder updatedBy relation works");
  assert(created.items.length === 1, "PurchaseOrderItem nested create works");
  assert(created.items[0].item.id === item.id, "PurchaseOrderItem item relation works");
  assert(Number(created.items[0].quantity) === quantity, "PurchaseOrderItem quantity saved");
  assert(Number(created.items[0].lineTotal) === lineTotal, "PurchaseOrderItem line total saved");

  const fetched = await prisma.purchaseOrder.findUnique({
    where: {
      id: created.id,
    },
    include: {
      branch: true,
      supplier: {
        include: {
          purchaseOrders: true,
        },
      },
      items: true,
    },
  });

  assert(Boolean(fetched), "PurchaseOrder fetch works");
  assert(fetched.items.length === 1, "PurchaseOrder items relation works");
  assert(
    fetched.supplier.purchaseOrders.some((po) => po.id === created.id),
    "Supplier can fetch linked purchase order"
  );

  const ordered = await prisma.purchaseOrder.update({
    where: {
      id: created.id,
    },
    data: {
      status: "ORDERED",
      orderedAt: new Date(),
      orderedById: user.id,
      updatedById: user.id,
    },
    include: {
      orderedBy: true,
    },
  });

  assert(ordered.status === "ORDERED", "PurchaseOrder status can update to ORDERED");
  assert(Boolean(ordered.orderedAt), "PurchaseOrder orderedAt saved");
  assert(ordered.orderedBy.id === user.id, "PurchaseOrder orderedBy relation works");

  await prisma.purchaseOrder.delete({
    where: {
      id: created.id,
    },
  });

  const leftoverItems = await prisma.purchaseOrderItem.count({
    where: {
      purchaseOrderId: created.id,
    },
  });

  assert(leftoverItems === 0, "PurchaseOrderItem cascade cleanup works");

  await prisma.supplier.delete({
    where: {
      id: supplier.id,
    },
  });

  console.log("\nPHASE 13 MODULE 13D PURCHASE ORDER DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13D PURCHASE ORDER DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
