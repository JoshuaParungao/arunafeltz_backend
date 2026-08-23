require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const main = async () => {
  console.log("PHASE 13 MODULE 13B: SUPPLIER DB CHECK");
  console.log("--------------------------------------");

  assert(Boolean(prisma.supplier), "Prisma supplier model is available");

  const supplierCount = await prisma.supplier.count();

  assert(Number.isInteger(supplierCount), "Supplier count works");

  const branch = await prisma.branch.findFirst({
    where: {
      code: "MAIN",
    },
    include: {
      suppliers: true,
    },
  });

  assert(Boolean(branch), "MAIN branch found");
  assert(Array.isArray(branch.suppliers), "Branch suppliers relation works");

  const user = await prisma.user.findFirst({
    where: {
      username: "mainadmin",
    },
    include: {
      createdSuppliers: true,
      updatedSuppliers: true,
    },
  });

  assert(Boolean(user), "User found");
  assert(Array.isArray(user.createdSuppliers), "User createdSuppliers relation works");
  assert(Array.isArray(user.updatedSuppliers), "User updatedSuppliers relation works");

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "STEST-13B-",
      },
    },
  });

  assert(true, "Previous 13B supplier test data cleared");

  const globalSupplier = await prisma.supplier.create({
    data: {
      supplierCode: "STEST-13B-GLOBAL",
      name: "13B Global Test Supplier",
      contactPerson: "Global Contact",
      contactNo: "09170001313",
      email: "global13b@supplier.test",
      address: "Global Supplier Address",
      tin: "TIN-13B-GLOBAL",
      notes: "Global supplier DB test only",
      status: "ACTIVE",
      createdById: user.id,
      updatedById: user.id,
    },
    include: {
      branch: true,
      createdBy: true,
      updatedBy: true,
    },
  });

  assert(Boolean(globalSupplier.id), "Global Supplier create works");
  assert(globalSupplier.branchId === null, "Global Supplier branch is null");
  assert(globalSupplier.status === "ACTIVE", "Global Supplier status saved");
  assert(globalSupplier.createdBy.id === user.id, "Global Supplier createdBy relation works");
  assert(globalSupplier.updatedBy.id === user.id, "Global Supplier updatedBy relation works");

  const branchSupplier = await prisma.supplier.create({
    data: {
      supplierCode: "STEST-13B-BRANCH",
      name: "13B Branch Test Supplier",
      contactPerson: "Branch Contact",
      contactNo: "09170001314",
      email: "branch13b@supplier.test",
      address: "Branch Supplier Address",
      tin: "TIN-13B-BRANCH",
      notes: "Branch supplier DB test only",
      status: "ACTIVE",
      branchId: branch.id,
      createdById: user.id,
      updatedById: user.id,
    },
    include: {
      branch: true,
      createdBy: true,
      updatedBy: true,
    },
  });

  assert(Boolean(branchSupplier.id), "Branch Supplier create works");
  assert(branchSupplier.branchId === branch.id, "Branch Supplier linked to branch");
  assert(branchSupplier.branch.id === branch.id, "Branch Supplier branch relation works");
  assert(branchSupplier.createdBy.id === user.id, "Branch Supplier createdBy relation works");
  assert(branchSupplier.updatedBy.id === user.id, "Branch Supplier updatedBy relation works");

  const fetchedBranch = await prisma.branch.findUnique({
    where: {
      id: branch.id,
    },
    include: {
      suppliers: {
        where: {
          supplierCode: "STEST-13B-BRANCH",
        },
      },
    },
  });

  assert(fetchedBranch.suppliers.length === 1, "Branch can fetch linked supplier");

  const updated = await prisma.supplier.update({
    where: {
      id: branchSupplier.id,
    },
    data: {
      status: "INACTIVE",
      notes: "Updated 13B supplier note",
      updatedById: user.id,
    },
  });

  assert(updated.status === "INACTIVE", "Supplier update status works");
  assert(updated.notes === "Updated 13B supplier note", "Supplier update notes works");

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "STEST-13B-",
      },
    },
  });

  const leftover = await prisma.supplier.count({
    where: {
      supplierCode: {
        startsWith: "STEST-13B-",
      },
    },
  });

  assert(leftover === 0, "Supplier cleanup works");

  console.log("\nPHASE 13 MODULE 13B SUPPLIER DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13B SUPPLIER DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
