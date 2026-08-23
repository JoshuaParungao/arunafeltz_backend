require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  console.log("\nInventory Models Check");
  console.log("----------------------");

  const inventoryBatchCount = await prisma.inventoryBatch.count();
  const inventoryMovementCount = await prisma.inventoryMovement.count();
  const itemSerialCount = await prisma.itemSerial.count();

  console.log("Inventory batches:", inventoryBatchCount);
  console.log("Inventory movements:", inventoryMovementCount);
  console.log("Item serials:", itemSerialCount);

  const branches = await prisma.branch.findMany({
    orderBy: {
      code: "asc",
    },
    select: {
      code: true,
      name: true,
      _count: {
        select: {
          inventoryBatches: true,
          inventoryMovements: true,
          itemSerials: true,
        },
      },
    },
  });

  console.log("\nBranch inventory counts:");
  console.table(
    branches.map((branch) => ({
      branchCode: branch.code,
      branchName: branch.name,
      inventoryBatches: branch._count.inventoryBatches,
      inventoryMovements: branch._count.inventoryMovements,
      itemSerials: branch._count.itemSerials,
    }))
  );

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
      branch: {
        select: {
          code: true,
        },
      },
      _count: {
        select: {
          inventoryBatches: true,
          inventoryMovements: true,
          itemSerials: true,
        },
      },
    },
  });

  console.log("\nItem inventory counts:");
  console.table(
    items.map((item) => ({
      branch: item.branch.code,
      itemCode: item.itemCode,
      itemName: item.itemName,
      inventoryBatches: item._count.inventoryBatches,
      inventoryMovements: item._count.inventoryMovements,
      itemSerials: item._count.itemSerials,
    }))
  );
};

main()
  .catch((error) => {
    console.error("Inventory model check failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
