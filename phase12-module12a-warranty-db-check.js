require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const main = async () => {
  console.log("PHASE 12 MODULE 12A: WARRANTY DB CHECK");
  console.log("---------------------------------------");

  assert(Boolean(prisma.warrantyClaim), "Prisma warrantyClaim model is available");

  const count = await prisma.warrantyClaim.count();
  assert(Number.isInteger(count), "WarrantyClaim count works");

  const branches = await prisma.branch.findMany({
    orderBy: {
      code: "asc",
    },
    include: {
      warrantyClaims: true,
    },
  });

  assert(branches.length > 0, "Branches found");
  assert(Array.isArray(branches[0].warrantyClaims), "Branch warrantyClaims relation works");

  const customer = await prisma.customer.findFirst({
    include: {
      warrantyClaims: true,
    },
  });

  if (customer) {
    assert(Array.isArray(customer.warrantyClaims), "Customer warrantyClaims relation works");
  } else {
    console.log("SKIP: No customer found for relation check");
  }

  const item = await prisma.item.findFirst({
    include: {
      warrantyClaims: true,
    },
  });

  if (item) {
    assert(Array.isArray(item.warrantyClaims), "Item warrantyClaims relation works");
  } else {
    console.log("SKIP: No item found for relation check");
  }

  const serial = await prisma.itemSerial.findFirst({
    include: {
      warrantyClaims: true,
    },
  });

  if (serial) {
    assert(Array.isArray(serial.warrantyClaims), "ItemSerial warrantyClaims relation works");
  } else {
    console.log("SKIP: No item serial found for relation check");
  }

  const sale = await prisma.sale.findFirst({
    include: {
      warrantyClaims: true,
    },
  });

  if (sale) {
    assert(Array.isArray(sale.warrantyClaims), "Sale warrantyClaims relation works");
  } else {
    console.log("SKIP: No sale found for relation check");
  }

  const saleItem = await prisma.saleItem.findFirst({
    include: {
      warrantyClaims: true,
    },
  });

  if (saleItem) {
    assert(Array.isArray(saleItem.warrantyClaims), "SaleItem warrantyClaims relation works");
  } else {
    console.log("SKIP: No sale item found for relation check");
  }

  const user = await prisma.user.findFirst({
    include: {
      createdWarrantyClaims: true,
      updatedWarrantyClaims: true,
      statusUpdatedWarrantyClaims: true,
      releasedWarrantyClaims: true,
    },
  });

  assert(Boolean(user), "User found");
  assert(Array.isArray(user.createdWarrantyClaims), "User createdWarrantyClaims relation works");
  assert(Array.isArray(user.updatedWarrantyClaims), "User updatedWarrantyClaims relation works");
  assert(Array.isArray(user.statusUpdatedWarrantyClaims), "User statusUpdatedWarrantyClaims relation works");
  assert(Array.isArray(user.releasedWarrantyClaims), "User releasedWarrantyClaims relation works");

  const branch = branches.find((item) => item.code === "MAIN") || branches[0];

  const created = await prisma.warrantyClaim.create({
    data: {
      claimCode: "WTEST-12A-0001",
      status: "IN",
      issueDescription: "Phase 12A warranty DB test only",
      branchId: branch.id,
      customerId: customer ? customer.id : null,
      itemId: item ? item.id : null,
      serialId: serial ? serial.id : null,
      saleId: sale ? sale.id : null,
      saleItemId: saleItem ? saleItem.id : null,
      createdById: user.id,
      updatedById: user.id,
      statusUpdatedById: user.id,
    },
  });

  assert(Boolean(created.id), "WarrantyClaim create works");
  assert(created.status === "IN", "WarrantyClaim default/current status works");

  const fetched = await prisma.warrantyClaim.findUnique({
    where: {
      id: created.id,
    },
    include: {
      branch: true,
      customer: true,
      item: true,
      serial: true,
      sale: true,
      saleItem: true,
      createdBy: true,
      updatedBy: true,
      statusUpdatedBy: true,
      releasedBy: true,
    },
  });

  assert(Boolean(fetched), "WarrantyClaim fetch works");
  assert(Boolean(fetched.branch), "WarrantyClaim branch relation works");
  assert(Boolean(fetched.createdBy), "WarrantyClaim createdBy relation works");
  assert(Boolean(fetched.updatedBy), "WarrantyClaim updatedBy relation works");
  assert(Boolean(fetched.statusUpdatedBy), "WarrantyClaim statusUpdatedBy relation works");

  await prisma.warrantyClaim.delete({
    where: {
      id: created.id,
    },
  });

  assert(true, "WarrantyClaim cleanup works");

  console.log("\nPHASE 12 MODULE 12A WARRANTY DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 12 MODULE 12A WARRANTY DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
