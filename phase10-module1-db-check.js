require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  console.log("PHASE 10 MODULE 1 DB CHECK");
  console.log("--------------------------");

  const cashBoxCount = await prisma.cashBox.count();
  const cashTransactionCount = await prisma.cashTransaction.count();

  console.log("CashBox model OK. Count:", cashBoxCount);
  console.log("CashTransaction model OK. Count:", cashTransactionCount);

  const branches = await prisma.branch.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      _count: {
        select: {
          cashBoxes: true,
          cashTransactions: true,
        },
      },
    },
    orderBy: {
      code: "asc",
    },
  });

  console.log("Branch cash relation check:");
  console.dir(branches, { depth: null });

  console.log("\nPHASE 10 MODULE 1 DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 1 DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
