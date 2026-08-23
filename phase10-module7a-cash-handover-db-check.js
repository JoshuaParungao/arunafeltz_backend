require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const main = async () => {
  console.log("PHASE 10 MODULE 7A: CASH HANDOVER DB CHECK");
  console.log("------------------------------------------");

  const handoverCount = await prisma.cashHandover.count();

  assert(Number.isInteger(handoverCount), "CashHandover model is accessible");

  const branches = await prisma.branch.findMany({
    include: {
      cashBoxes: true,
      cashHandovers: true,
    },
    orderBy: {
      code: "asc",
    },
  });

  assert(branches.length >= 1, "Branches found");

  for (const branch of branches) {
    assert(Array.isArray(branch.cashBoxes), `${branch.code} cashBoxes relation works`);
    assert(Array.isArray(branch.cashHandovers), `${branch.code} cashHandovers relation works`);
  }

  const cashBoxes = await prisma.cashBox.findMany({
    include: {
      cashHandovers: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
    orderBy: {
      boxCode: "asc",
    },
  });

  assert(cashBoxes.length >= 1, "Cash boxes found");

  for (const cashBox of cashBoxes) {
    assert(Array.isArray(cashBox.cashHandovers), `${cashBox.boxCode} cashHandovers relation works`);
  }

  const users = await prisma.user.findMany({
    take: 1,
    include: {
      cashHandoversFrom: true,
      cashHandoversTo: true,
      createdCashHandovers: true,
      receivedCashHandovers: true,
      cancelledCashHandovers: true,
    },
  });

  assert(users.length >= 1, "Users found");
  assert(Array.isArray(users[0].cashHandoversFrom), "User cashHandoversFrom relation works");
  assert(Array.isArray(users[0].cashHandoversTo), "User cashHandoversTo relation works");
  assert(Array.isArray(users[0].createdCashHandovers), "User createdCashHandovers relation works");
  assert(Array.isArray(users[0].receivedCashHandovers), "User receivedCashHandovers relation works");
  assert(Array.isArray(users[0].cancelledCashHandovers), "User cancelledCashHandovers relation works");

  console.log("\nPHASE 10 MODULE 7A CASH HANDOVER DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 7A CASH HANDOVER DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
