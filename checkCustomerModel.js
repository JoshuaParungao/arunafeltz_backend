require("./src/config/env");
const prisma = require("./src/config/prisma");

async function main() {
  const customerCount = await prisma.customer.count();

  const branches = await prisma.branch.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      _count: {
        select: {
          customers: true,
        },
      },
    },
    orderBy: {
      code: "asc",
    },
  });

  console.log("");
  console.log("Customer model check");
  console.log("--------------------");
  console.log("Customer count:", customerCount);
  console.log("");

  console.log("Branches with customer count:");
  console.table(
    branches.map((branch) => ({
      code: branch.code,
      name: branch.name,
      status: branch.status,
      customerCount: branch._count.customers,
    }))
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
