require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const main = async () => {
  console.log("PHASE 12 MODULE 12G: RETURN DB CHECK");
  console.log("------------------------------------");

  assert(Boolean(prisma.returnRequest), "Prisma returnRequest model is available");
  assert(Boolean(prisma.returnItem), "Prisma returnItem model is available");

  const returnRequestCount = await prisma.returnRequest.count();
  const returnItemCount = await prisma.returnItem.count();

  assert(Number.isInteger(returnRequestCount), "ReturnRequest count works");
  assert(Number.isInteger(returnItemCount), "ReturnItem count works");

  const branch = await prisma.branch.findFirst({
    where: {
      code: "MAIN",
    },
    include: {
      returnRequests: true,
    },
  });

  assert(Boolean(branch), "MAIN branch found");
  assert(Array.isArray(branch.returnRequests), "Branch returnRequests relation works");

  const sale = await prisma.sale.findFirst({
    where: {
      branchId: branch.id,
      status: {
        not: "CANCELLED",
      },
    },
    include: {
      items: true,
      returnRequests: true,
    },
  });

  assert(Boolean(sale), "Sale found");
  assert(Array.isArray(sale.items), "Sale items relation works");
  assert(Array.isArray(sale.returnRequests), "Sale returnRequests relation works");
  assert(sale.items.length > 0, "Sale has at least one sale item");

  const saleItem = sale.items[0];

  const customer = sale.customerId
    ? await prisma.customer.findUnique({
        where: {
          id: sale.customerId,
        },
        include: {
          returnRequests: true,
        },
      })
    : await prisma.customer.findFirst({
        where: {
          branchId: branch.id,
          status: "ACTIVE",
        },
        include: {
          returnRequests: true,
        },
      });

  if (customer) {
    assert(Array.isArray(customer.returnRequests), "Customer returnRequests relation works");
  } else {
    console.log("SKIP: No customer found for relation check");
  }

  const item = saleItem.itemId
    ? await prisma.item.findUnique({
        where: {
          id: saleItem.itemId,
        },
        include: {
          returnItems: true,
        },
      })
    : await prisma.item.findFirst({
        where: {
          branchId: branch.id,
          status: "ACTIVE",
        },
        include: {
          returnItems: true,
        },
      });

  if (item) {
    assert(Array.isArray(item.returnItems), "Item returnItems relation works");
  } else {
    console.log("SKIP: No item found for relation check");
  }

  const serial = saleItem.serialId
    ? await prisma.itemSerial.findUnique({
        where: {
          id: saleItem.serialId,
        },
        include: {
          returnItems: true,
        },
      })
    : null;

  if (serial) {
    assert(Array.isArray(serial.returnItems), "ItemSerial returnItems relation works");
  } else {
    console.log("SKIP: No serial linked to selected sale item");
  }

  const user = await prisma.user.findFirst({
    where: {
      username: "mainadmin",
    },
    include: {
      createdReturnRequests: true,
      updatedReturnRequests: true,
      approvedReturnRequests: true,
      rejectedReturnRequests: true,
      completedReturnRequests: true,
      cancelledReturnRequests: true,
    },
  });

  assert(Boolean(user), "User found");
  assert(Array.isArray(user.createdReturnRequests), "User createdReturnRequests relation works");
  assert(Array.isArray(user.updatedReturnRequests), "User updatedReturnRequests relation works");
  assert(Array.isArray(user.approvedReturnRequests), "User approvedReturnRequests relation works");
  assert(Array.isArray(user.rejectedReturnRequests), "User rejectedReturnRequests relation works");
  assert(Array.isArray(user.completedReturnRequests), "User completedReturnRequests relation works");
  assert(Array.isArray(user.cancelledReturnRequests), "User cancelledReturnRequests relation works");

  await prisma.returnRequest.deleteMany({
    where: {
      branchId: branch.id,
      returnCode: {
        startsWith: "RTEST-12G-",
      },
    },
  });

  assert(true, "Previous 12G return test data cleared");

  const created = await prisma.returnRequest.create({
    data: {
      returnCode: "RTEST-12G-0001",
      status: "DRAFT",
      reason: "Phase 12G return DB test only",
      notes: "No refund posting yet",
      refundMethod: "NONE",
      totalRefundAmount: 100,
      branchId: branch.id,
      customerId: customer ? customer.id : null,
      saleId: sale.id,
      createdById: user.id,
      updatedById: user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: saleItem.description || "Return test item",
            reason: "Return item DB relation test",
            quantity: 1,
            unitRefundAmount: 100,
            lineRefundAmount: 100,
            saleItemId: saleItem.id,
            itemId: saleItem.itemId || null,
            serialId: saleItem.serialId || null,
          },
        ],
      },
    },
    include: {
      branch: true,
      customer: true,
      sale: true,
      items: {
        include: {
          saleItem: true,
          item: true,
          serial: true,
        },
      },
      createdBy: true,
      updatedBy: true,
    },
  });

  assert(Boolean(created.id), "ReturnRequest create works");
  assert(created.status === "DRAFT", "ReturnRequest status saved as DRAFT");
  assert(created.refundMethod === "NONE", "ReturnRequest refund method saved");
  assert(created.items.length === 1, "ReturnItem nested create works");
  assert(created.items[0].saleItemId === saleItem.id, "ReturnItem linked to sale item");
  assert(Boolean(created.branch), "ReturnRequest branch relation works");
  assert(Boolean(created.sale), "ReturnRequest sale relation works");
  assert(Boolean(created.createdBy), "ReturnRequest createdBy relation works");
  assert(Boolean(created.updatedBy), "ReturnRequest updatedBy relation works");

  const fetched = await prisma.returnRequest.findUnique({
    where: {
      id: created.id,
    },
    include: {
      items: true,
    },
  });

  assert(Boolean(fetched), "ReturnRequest fetch works");
  assert(fetched.items.length === 1, "ReturnRequest items relation works");

  await prisma.returnRequest.delete({
    where: {
      id: created.id,
    },
  });

  const leftoverItems = await prisma.returnItem.count({
    where: {
      returnRequestId: created.id,
    },
  });

  assert(leftoverItems === 0, "ReturnItem cascade cleanup works");

  console.log("\nPHASE 12 MODULE 12G RETURN DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 12 MODULE 12G RETURN DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
