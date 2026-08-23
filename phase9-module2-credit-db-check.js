require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  console.log("\nPhase 9 Module 2: Credit / Installment DB Check");
  console.log("------------------------------------------------");

  const modelNames = Object.keys(prisma).filter((key) =>
    key.toLowerCase().includes("credit")
  );

  console.log("Detected credit models:", modelNames);

  if (!modelNames.includes("creditAccount")) {
    throw new Error("creditAccount Prisma model not detected");
  }

  if (!modelNames.includes("creditCollection")) {
    throw new Error("creditCollection Prisma model not detected");
  }

  const creditAccountCount = await prisma.creditAccount.count();
  const creditCollectionCount = await prisma.creditCollection.count();

  console.log("CreditAccount count:", creditAccountCount);
  console.log("CreditCollection count:", creditCollectionCount);

  const enumCheck = {
    terms: [
      "STRAIGHT",
      "MONTH_3",
      "MONTH_6",
      "MONTH_9",
      "MONTH_12",
      "MONTH_18",
      "MONTH_24",
    ],
    accountStatuses: ["ACTIVE", "PAID", "CANCELLED", "DEFAULTED"],
    collectionStatuses: ["POSTED", "CANCELLED"],
  };

  console.log("Enum values expected:");
  console.dir(enumCheck, { depth: null });

  console.log("\nPHASE 9 MODULE 2 CREDIT / INSTALLMENT DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 9 MODULE 2 CREDIT / INSTALLMENT DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
