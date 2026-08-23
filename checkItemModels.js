require("./src/config/env");

const prisma = require("./src/config/prisma");

async function main() {
  const categoryCount = await prisma.itemCategory.count();
  const unitCount = await prisma.unit.count();
  const itemCount = await prisma.item.count();

  const branchCounts = await prisma.branch.findMany({
    orderBy: {
      code: "asc",
    },
    select: {
      code: true,
      name: true,
      _count: {
        select: {
          itemCategories: true,
          items: true,
        },
      },
    },
  });

  console.log("");
  console.log("Phase 5 Item Models Check");
  console.log("-------------------------");
  console.log(`Item categories: ${categoryCount}`);
  console.log(`Units: ${unitCount}`);
  console.log(`Items: ${itemCount}`);
  console.log("");

  console.table(
    branchCounts.map((branch) => ({
      branchCode: branch.code,
      branchName: branch.name,
      categoryCount: branch._count.itemCategories,
      itemCount: branch._count.items,
    }))
  );
}

main()
  .catch((error) => {
    console.error("Item model check failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
