require("./src/config/env");

const prisma = require("./src/config/prisma");

function money(value) {
  return Number(value).toFixed(2);
}

async function main() {
  const units = await prisma.unit.findMany({
    orderBy: {
      unitCode: "asc",
    },
    select: {
      unitCode: true,
      name: true,
      status: true,
      createdBy: {
        select: {
          username: true,
        },
      },
      updatedBy: {
        select: {
          username: true,
        },
      },
    },
  });

  const categories = await prisma.itemCategory.findMany({
    orderBy: [
      {
        branch: {
          code: "asc",
        },
      },
      {
        categoryCode: "asc",
      },
    ],
    select: {
      categoryCode: true,
      name: true,
      status: true,
      branch: {
        select: {
          code: true,
        },
      },
      createdBy: {
        select: {
          username: true,
        },
      },
      updatedBy: {
        select: {
          username: true,
        },
      },
    },
  });

  const items = await prisma.item.findMany({
    orderBy: [
      {
        branch: {
          code: "asc",
        },
      },
      {
        itemCode: "asc",
      },
    ],
    select: {
      itemCode: true,
      itemName: true,
      brand: true,
      modelName: true,
      status: true,
      isSerialized: true,
      hasWarranty: true,
      costPrice: true,
      price1: true,
      price2: true,
      price3: true,
      price4: true,
      price5: true,
      branch: {
        select: {
          code: true,
        },
      },
      category: {
        select: {
          categoryCode: true,
          name: true,
        },
      },
      unit: {
        select: {
          unitCode: true,
        },
      },
      createdBy: {
        select: {
          username: true,
        },
      },
      updatedBy: {
        select: {
          username: true,
        },
      },
    },
  });

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
  console.log("Item Catalog Seed Check");
  console.log("-----------------------");
  console.log(`Units: ${units.length}`);
  console.log(`Item categories: ${categories.length}`);
  console.log(`Items: ${items.length}`);
  console.log("");

  console.log("Units:");
  console.table(
    units.map((unit) => ({
      unitCode: unit.unitCode,
      name: unit.name,
      status: unit.status,
      createdBy: unit.createdBy?.username || null,
      updatedBy: unit.updatedBy?.username || null,
    }))
  );

  console.log("Categories:");
  console.table(
    categories.map((category) => ({
      branch: category.branch.code,
      categoryCode: category.categoryCode,
      name: category.name,
      status: category.status,
      createdBy: category.createdBy?.username || null,
      updatedBy: category.updatedBy?.username || null,
    }))
  );

  console.log("Items:");
  console.table(
    items.map((item) => ({
      branch: item.branch.code,
      itemCode: item.itemCode,
      itemName: item.itemName,
      brand: item.brand,
      category: item.category.categoryCode,
      unit: item.unit.unitCode,
      isSerialized: item.isSerialized,
      hasWarranty: item.hasWarranty,
      costPrice: money(item.costPrice),
      price1: money(item.price1),
      price5: money(item.price5),
      status: item.status,
      createdBy: item.createdBy?.username || null,
      updatedBy: item.updatedBy?.username || null,
    }))
  );

  console.log("Branch catalog counts:");
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
    console.error("Item catalog check failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
