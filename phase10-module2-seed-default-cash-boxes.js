require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  console.log("PHASE 10 MODULE 2: SEED DEFAULT CASH BOXES");
  console.log("------------------------------------------");

  const branches = await prisma.branch.findMany({
    where: {
      status: "ACTIVE",
    },
    orderBy: {
      code: "asc",
    },
  });

  if (branches.length === 0) {
    throw new Error("No active branches found.");
  }

  for (const branch of branches) {
    const boxCode = `CASHBOX-${branch.code}`;

    const existing = await prisma.cashBox.findFirst({
      where: {
        branchId: branch.id,
        boxCode,
      },
    });

    if (existing) {
      console.log(`SKIP: ${boxCode} already exists for ${branch.name}`);
      continue;
    }

    const created = await prisma.cashBox.create({
      data: {
        boxCode,
        name: `${branch.code} Central Cash Box`,
        status: "ACTIVE",
        currentBalance: "0.00",
        remarks: "Default central cash box seeded by Phase 10 Module 2.",
        branchId: branch.id,
      },
    });

    console.log(`CREATED: ${created.boxCode} for ${branch.name}`);
  }

  const cashBoxes = await prisma.cashBox.findMany({
    include: {
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
    orderBy: [
      {
        branch: {
          code: "asc",
        },
      },
      {
        boxCode: "asc",
      },
    ],
  });

  console.log("\nCash boxes:");
  console.dir(cashBoxes, { depth: null });

  console.log("\nPHASE 10 MODULE 2 SEED PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 2 SEED FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
