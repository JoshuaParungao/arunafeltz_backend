require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  console.log("\nPhase 8 Sales Models Check");
  console.log("--------------------------");

  const saleCount = await prisma.sale.count();
  const saleItemCount = await prisma.saleItem.count();
  const salePaymentCount = await prisma.salePayment.count();

  console.log("Sale table OK. Count:", saleCount);
  console.log("SaleItem table OK. Count:", saleItemCount);
  console.log("SalePayment table OK. Count:", salePaymentCount);

  console.log("\nPHASE 8 MODULE 1 SALES MODELS CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 8 MODULE 1 SALES MODELS CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
