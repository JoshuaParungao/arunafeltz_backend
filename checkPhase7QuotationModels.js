require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  console.log("\nPhase 7 Quotation Models Check");
  console.log("------------------------------");

  const quotationCount = await prisma.quotation.count();
  const quotationItemCount = await prisma.quotationItem.count();

  console.log("Quotation table OK. Count:", quotationCount);
  console.log("QuotationItem table OK. Count:", quotationItemCount);

  console.log("\nPHASE 7 MODULE 1 QUOTATION MODELS CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 7 MODULE 1 QUOTATION MODELS CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
