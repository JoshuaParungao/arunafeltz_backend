require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  console.log("\nPhase 6 Module 2: Inventory Seed Check");
  console.log("--------------------------------------");

  const batchCount = await prisma.inventoryBatch.count();
  const movementCount = await prisma.inventoryMovement.count();
  const serialCount = await prisma.itemSerial.count();

  console.log("Inventory batches:", batchCount);
  console.log("Inventory movements:", movementCount);
  console.log("Item serials:", serialCount);

  const byBranch = await prisma.branch.findMany({
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

  console.log("\nInventory counts by branch:");
  console.table(
    byBranch.map((branch) => ({
      branchCode: branch.code,
      branchName: branch.name,
      batches: branch._count.inventoryBatches,
      movements: branch._count.inventoryMovements,
      serials: branch._count.itemSerials,
    }))
  );

  const batches = await prisma.inventoryBatch.findMany({
    orderBy: [
      {
        branch: {
          code: "asc",
        },
      },
      {
        batchCode: "asc",
      },
    ],
    select: {
      batchCode: true,
      quantityIn: true,
      quantityAvailable: true,
      status: true,
      branch: {
        select: {
          code: true,
        },
      },
      item: {
        select: {
          itemCode: true,
          itemName: true,
        },
      },
      _count: {
        select: {
          serials: true,
          movements: true,
        },
      },
    },
  });

  console.log("\nInventory batches:");
  console.table(
    batches.map((batch) => ({
      branch: batch.branch.code,
      itemCode: batch.item.itemCode,
      batchCode: batch.batchCode,
      quantityIn: batch.quantityIn.toString(),
      quantityAvailable: batch.quantityAvailable.toString(),
      serials: batch._count.serials,
      movements: batch._count.movements,
      status: batch.status,
    }))
  );

  const movements = await prisma.inventoryMovement.findMany({
    orderBy: [
      {
        branch: {
          code: "asc",
        },
      },
      {
        movementCode: "asc",
      },
    ],
    select: {
      movementCode: true,
      type: true,
      source: true,
      quantity: true,
      branch: {
        select: {
          code: true,
        },
      },
      item: {
        select: {
          itemCode: true,
        },
      },
    },
  });

  console.log("\nInventory movements:");
  console.table(
    movements.map((movement) => ({
      branch: movement.branch.code,
      itemCode: movement.item.itemCode,
      movementCode: movement.movementCode,
      type: movement.type,
      source: movement.source,
      quantity: movement.quantity.toString(),
    }))
  );

  const serialStatusCounts = await prisma.itemSerial.groupBy({
    by: ["status"],
    _count: {
      status: true,
    },
    orderBy: {
      status: "asc",
    },
  });

  console.log("\nSerial status counts:");
  console.table(
    serialStatusCounts.map((row) => ({
      status: row.status,
      count: row._count.status,
    }))
  );

  if (batchCount !== 7 || movementCount !== 7 || serialCount !== 15) {
    console.log("\nWARNING: Expected 7 batches, 7 movements, and 15 serials.");
    console.log("This may be okay only if seed data was intentionally changed.");
    process.exitCode = 1;
    return;
  }

  console.log("\nInventory seed check passed.");
};

main()
  .catch((error) => {
    console.error("\nInventory seed check failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
