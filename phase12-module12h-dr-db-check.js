require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const main = async () => {
  console.log("PHASE 12 MODULE 12H: DR DB CHECK");
  console.log("---------------------------------");

  assert(Boolean(prisma.deliveryReceipt), "Prisma deliveryReceipt model is available");
  assert(Boolean(prisma.deliveryReceiptItem), "Prisma deliveryReceiptItem model is available");

  const drCount = await prisma.deliveryReceipt.count();
  const drItemCount = await prisma.deliveryReceiptItem.count();

  assert(Number.isInteger(drCount), "DeliveryReceipt count works");
  assert(Number.isInteger(drItemCount), "DeliveryReceiptItem count works");

  const branch = await prisma.branch.findFirst({
    where: {
      code: "MAIN",
    },
    include: {
      deliveryReceipts: true,
    },
  });

  assert(Boolean(branch), "MAIN branch found");
  assert(Array.isArray(branch.deliveryReceipts), "Branch deliveryReceipts relation works");

  const sale = await prisma.sale.findFirst({
    where: {
      branchId: branch.id,
      status: {
        not: "CANCELLED",
      },
      items: {
        some: {},
      },
    },
    include: {
      items: true,
      deliveryReceipt: true,
      customer: true,
    },
  });

  assert(Boolean(sale), "Sale with items found");
  assert(Array.isArray(sale.items), "Sale items relation works");
  assert(sale.items.length > 0, "Sale has at least one item");

  const saleItem = sale.items[0];

  const item = saleItem.itemId
    ? await prisma.item.findUnique({
        where: {
          id: saleItem.itemId,
        },
        include: {
          deliveryReceiptItems: true,
        },
      })
    : null;

  if (item) {
    assert(Array.isArray(item.deliveryReceiptItems), "Item deliveryReceiptItems relation works");
  } else {
    console.log("SKIP: Selected sale item has no itemId");
  }

  const user = await prisma.user.findFirst({
    where: {
      username: "mainadmin",
    },
    include: {
      createdDeliveryReceipts: true,
      updatedDeliveryReceipts: true,
      issuedDeliveryReceipts: true,
      cancelledDeliveryReceipts: true,
    },
  });

  assert(Boolean(user), "User found");
  assert(Array.isArray(user.createdDeliveryReceipts), "User createdDeliveryReceipts relation works");
  assert(Array.isArray(user.updatedDeliveryReceipts), "User updatedDeliveryReceipts relation works");
  assert(Array.isArray(user.issuedDeliveryReceipts), "User issuedDeliveryReceipts relation works");
  assert(Array.isArray(user.cancelledDeliveryReceipts), "User cancelledDeliveryReceipts relation works");

  await prisma.deliveryReceipt.deleteMany({
    where: {
      branchId: branch.id,
      drCode: {
        startsWith: "DRTEST-12H-",
      },
    },
  });

  assert(true, "Previous 12H DR test data cleared");

  const quantity = Number(saleItem.quantity);
  const cashDiscountedPrice = Number(saleItem.unitPrice);
  const amount = quantity * cashDiscountedPrice;

  const created = await prisma.deliveryReceipt.create({
    data: {
      drCode: "DRTEST-12H-0001",
      status: "DRAFT",
      customerName: sale.customer?.fullName || null,
      customerAddress: sale.customer?.address || null,
      customerContactNo: sale.customer?.mobileNumber || null,
      preparedByName: user.fullName,
      notes: "Phase 12H DR DB test only",
      subtotal: amount,
      totalDiscount: 0,
      grandTotal: amount,
      branchId: branch.id,
      saleId: sale.id,
      createdById: user.id,
      updatedById: user.id,
      items: {
        create: [
          {
            lineNo: 1,
            itemCodeSnapshot: saleItem.itemCodeSnapshot || null,
            itemDescription: saleItem.description || saleItem.itemNameSnapshot || "DR test item",
            quantity,
            cashDiscountedPrice,
            amount,
            saleItemId: saleItem.id,
            itemId: saleItem.itemId || null,
          },
        ],
      },
    },
    include: {
      branch: true,
      sale: true,
      items: {
        include: {
          saleItem: true,
          item: true,
        },
      },
      createdBy: true,
      updatedBy: true,
    },
  });

  assert(Boolean(created.id), "DeliveryReceipt create works");
  assert(created.status === "DRAFT", "DeliveryReceipt status saved as DRAFT");
  assert(created.saleId === sale.id, "DeliveryReceipt linked to sale");
  assert(created.items.length === 1, "DeliveryReceiptItem nested create works");
  assert(created.items[0].saleItemId === saleItem.id, "DeliveryReceiptItem linked to sale item");
  assert(Boolean(created.branch), "DeliveryReceipt branch relation works");
  assert(Boolean(created.sale), "DeliveryReceipt sale relation works");
  assert(Boolean(created.createdBy), "DeliveryReceipt createdBy relation works");
  assert(Boolean(created.updatedBy), "DeliveryReceipt updatedBy relation works");

  const fetched = await prisma.deliveryReceipt.findUnique({
    where: {
      id: created.id,
    },
    include: {
      items: true,
      sale: {
        include: {
          deliveryReceipt: true,
        },
      },
    },
  });

  assert(Boolean(fetched), "DeliveryReceipt fetch works");
  assert(fetched.items.length === 1, "DeliveryReceipt items relation works");
  assert(fetched.sale.deliveryReceipt.id === created.id, "Sale deliveryReceipt relation works");

  const issued = await prisma.deliveryReceipt.update({
    where: {
      id: created.id,
    },
    data: {
      status: "ISSUED",
      issuedAt: new Date(),
      issuedById: user.id,
    },
    include: {
      issuedBy: true,
    },
  });

  assert(issued.status === "ISSUED", "DeliveryReceipt status can update to ISSUED");
  assert(Boolean(issued.issuedAt), "DeliveryReceipt issuedAt saved");
  assert(issued.issuedBy.id === user.id, "DeliveryReceipt issuedBy relation works");

  await prisma.deliveryReceipt.delete({
    where: {
      id: created.id,
    },
  });

  const leftoverItems = await prisma.deliveryReceiptItem.count({
    where: {
      deliveryReceiptId: created.id,
    },
  });

  assert(leftoverItems === 0, "DeliveryReceiptItem cascade cleanup works");

  console.log("\nPHASE 12 MODULE 12H DR DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 12 MODULE 12H DR DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
