require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const main = async () => {
  console.log("PHASE 10 MODULE 2: CASH BOX SEED CHECK");
  console.log("--------------------------------------");

  const branches = await prisma.branch.findMany({
    where: {
      status: "ACTIVE",
    },
    include: {
      cashBoxes: true,
    },
    orderBy: {
      code: "asc",
    },
  });

  assert(branches.length >= 1, "Active branches found");

  for (const branch of branches) {
    const expectedBoxCode = `CASHBOX-${branch.code}`;

    const cashBox = branch.cashBoxes.find((box) => box.boxCode === expectedBoxCode);

    assert(Boolean(cashBox), `${branch.code} default cash box exists`);
    assert(cashBox.status === "ACTIVE", `${branch.code} default cash box is ACTIVE`);
    assert(Number(cashBox.currentBalance) === 0, `${branch.code} default cash box starts at 0`);
  }

  const duplicateCheck = await prisma.cashBox.groupBy({
    by: ["branchId", "boxCode"],
    _count: {
      id: true,
    },
  });

  const duplicates = duplicateCheck.filter((item) => item._count.id > 1);

  assert(duplicates.length === 0, "No duplicate cash box codes per branch");

  const cashTransactionCount = await prisma.cashTransaction.count();

  assert(cashTransactionCount === 0, "No cash transactions created in Module 2");

  console.log("\nPHASE 10 MODULE 2 CASH BOX SEED CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 2 CASH BOX SEED CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
