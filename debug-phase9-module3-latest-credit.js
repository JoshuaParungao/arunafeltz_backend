require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  const latest = await prisma.creditAccount.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      branch: true,
      customer: true,
      sale: true,
    },
  });

  console.log("LATEST CREDIT ACCOUNT:");
  console.dir(latest, { depth: null });

  if (latest) {
    console.log("\nTYPE CHECK:");
    console.log("termBasis:", latest.termBasis, "type:", typeof latest.termBasis);
    console.log("Number(termBasis):", Number(latest.termBasis));
    console.log("cashPromoTotalAmount:", latest.cashPromoTotalAmount, "type:", typeof latest.cashPromoTotalAmount);
    console.log("regularPriceTotalAmount:", latest.regularPriceTotalAmount, "type:", typeof latest.regularPriceTotalAmount);
    console.log("balanceAmount:", latest.balanceAmount, "type:", typeof latest.balanceAmount);
    console.log("monthlyDueAmount:", latest.monthlyDueAmount, "type:", typeof latest.monthlyDueAmount);
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
