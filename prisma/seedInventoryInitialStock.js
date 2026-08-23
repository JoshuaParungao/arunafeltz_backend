require("dotenv").config();

const prisma = require("../src/config/prisma");

const initialStocks = [
  {
    branchCode: "MAB",
    itemCode: "ITEM-MAB-001",
    batchCode: "BATCH-MAB-ITEM-MAB-001-001",
    movementCode: "MOV-MAB-ITEM-MAB-001-INITIAL-001",
    supplierName: "Initial Inventory",
    referenceNo: "INIT-MAB-001",
    remarks: "Initial stock seed for Mabalacat branch motherboard item.",
    serialNumbers: ["SN-MAB-B550M-001", "SN-MAB-B550M-002"],
  },
  {
    branchCode: "MAB",
    itemCode: "ITEM-MAB-002",
    batchCode: "BATCH-MAB-ITEM-MAB-002-001",
    movementCode: "MOV-MAB-ITEM-MAB-002-INITIAL-001",
    supplierName: "Initial Inventory",
    referenceNo: "INIT-MAB-002",
    remarks: "Initial stock seed for Mabalacat branch RAM item.",
    serialNumbers: ["SN-MAB-TFORCE-RAM-001", "SN-MAB-TFORCE-RAM-002", "SN-MAB-TFORCE-RAM-003"],
  },
  {
    branchCode: "MAIN",
    itemCode: "ITEM-MAIN-001",
    batchCode: "BATCH-MAIN-ITEM-MAIN-001-001",
    movementCode: "MOV-MAIN-ITEM-MAIN-001-INITIAL-001",
    supplierName: "Initial Inventory",
    referenceNo: "INIT-MAIN-001",
    remarks: "Initial stock seed for Main branch Ryzen processor item.",
    serialNumbers: ["SN-MAIN-R5600G-001", "SN-MAIN-R5600G-002"],
  },
  {
    branchCode: "MAIN",
    itemCode: "ITEM-MAIN-002",
    batchCode: "BATCH-MAIN-ITEM-MAIN-002-001",
    movementCode: "MOV-MAIN-ITEM-MAIN-002-INITIAL-001",
    supplierName: "Initial Inventory",
    referenceNo: "INIT-MAIN-002",
    remarks: "Initial stock seed for Main branch motherboard item.",
    serialNumbers: ["SN-MAIN-A320M-001", "SN-MAIN-A320M-002"],
  },
  {
    branchCode: "MAIN",
    itemCode: "ITEM-MAIN-003",
    batchCode: "BATCH-MAIN-ITEM-MAIN-003-001",
    movementCode: "MOV-MAIN-ITEM-MAIN-003-INITIAL-001",
    supplierName: "Initial Inventory",
    referenceNo: "INIT-MAIN-003",
    remarks: "Initial stock seed for Main branch NVMe SSD item.",
    serialNumbers: ["SN-MAIN-KNV2-001", "SN-MAIN-KNV2-002", "SN-MAIN-KNV2-003"],
  },
  {
    branchCode: "MAIN",
    itemCode: "ITEM-MAIN-API",
    batchCode: "BATCH-MAIN-ITEM-MAIN-API-001",
    movementCode: "MOV-MAIN-ITEM-MAIN-API-INITIAL-001",
    supplierName: "Initial Inventory",
    referenceNo: "INIT-MAIN-API-001",
    remarks: "Initial stock seed for API test processor item.",
    serialNumbers: ["SN-MAIN-API-PROC-001"],
  },
  {
    branchCode: "MAIN",
    itemCode: "ITEM-MAIN-API-001",
    batchCode: "BATCH-MAIN-ITEM-MAIN-API-001-001",
    movementCode: "MOV-MAIN-ITEM-MAIN-API-001-INITIAL-001",
    supplierName: "Initial Inventory",
    referenceNo: "INIT-MAIN-API-002",
    remarks: "Initial stock seed for admin auto code SSD item.",
    serialNumbers: ["SN-MAIN-API-SSD-001", "SN-MAIN-API-SSD-002"],
  },
];

const toDecimalString = (value) => {
  if (value === null || value === undefined) {
    return "0";
  }

  return value.toString();
};

const main = async () => {
  console.log("\nPhase 6 Module 2: Initial Inventory Seeder");
  console.log("------------------------------------------");

  let createdOrUpdatedBatches = 0;
  let createdOrUpdatedMovements = 0;
  let createdOrUpdatedSerials = 0;
  let skippedItems = 0;

  for (const stock of initialStocks) {
    const branch = await prisma.branch.findUnique({
      where: {
        code: stock.branchCode,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
    });

    if (!branch) {
      console.log(`SKIP: Branch not found: ${stock.branchCode}`);
      skippedItems += 1;
      continue;
    }

    const item = await prisma.item.findFirst({
      where: {
        branchId: branch.id,
        itemCode: stock.itemCode,
      },
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        isSerialized: true,
        costPrice: true,
        price1: true,
        price2: true,
        price3: true,
        price4: true,
        price5: true,
      },
    });

    if (!item) {
      console.log(`SKIP: Item not found: ${stock.branchCode} / ${stock.itemCode}`);
      skippedItems += 1;
      continue;
    }

    const quantity = stock.serialNumbers.length;

    if (quantity <= 0) {
      console.log(`SKIP: No serial numbers provided for ${stock.itemCode}`);
      skippedItems += 1;
      continue;
    }

    const batch = await prisma.inventoryBatch.upsert({
      where: {
        branchId_batchCode: {
          branchId: branch.id,
          batchCode: stock.batchCode,
        },
      },
      update: {
        quantityIn: quantity.toString(),
        quantityAvailable: quantity.toString(),
        unitCost: toDecimalString(item.costPrice),
        sellingPrice1: toDecimalString(item.price1),
        sellingPrice2: toDecimalString(item.price2),
        sellingPrice3: toDecimalString(item.price3),
        sellingPrice4: toDecimalString(item.price4),
        sellingPrice5: toDecimalString(item.price5),
        supplierName: stock.supplierName,
        referenceNo: stock.referenceNo,
        remarks: stock.remarks,
        status: "ACTIVE",
        itemId: item.id,
      },
      create: {
        branchId: branch.id,
        itemId: item.id,
        batchCode: stock.batchCode,
        quantityIn: quantity.toString(),
        quantityAvailable: quantity.toString(),
        unitCost: toDecimalString(item.costPrice),
        sellingPrice1: toDecimalString(item.price1),
        sellingPrice2: toDecimalString(item.price2),
        sellingPrice3: toDecimalString(item.price3),
        sellingPrice4: toDecimalString(item.price4),
        sellingPrice5: toDecimalString(item.price5),
        supplierName: stock.supplierName,
        referenceNo: stock.referenceNo,
        remarks: stock.remarks,
        status: "ACTIVE",
      },
    });

    createdOrUpdatedBatches += 1;

    await prisma.inventoryMovement.upsert({
      where: {
        branchId_movementCode: {
          branchId: branch.id,
          movementCode: stock.movementCode,
        },
      },
      update: {
        itemId: item.id,
        batchId: batch.id,
        type: "STOCK_IN",
        source: "SYSTEM",
        quantity: quantity.toString(),
        previousQuantity: "0",
        newQuantity: quantity.toString(),
        unitCost: toDecimalString(item.costPrice),
        referenceNo: stock.referenceNo,
        remarks: `Initial stock movement for ${item.itemCode}.`,
      },
      create: {
        branchId: branch.id,
        itemId: item.id,
        batchId: batch.id,
        movementCode: stock.movementCode,
        type: "STOCK_IN",
        source: "SYSTEM",
        quantity: quantity.toString(),
        previousQuantity: "0",
        newQuantity: quantity.toString(),
        unitCost: toDecimalString(item.costPrice),
        referenceNo: stock.referenceNo,
        remarks: `Initial stock movement for ${item.itemCode}.`,
      },
    });

    createdOrUpdatedMovements += 1;

    for (const serialNumber of stock.serialNumbers) {
      await prisma.itemSerial.upsert({
        where: {
          branchId_serialNumber: {
            branchId: branch.id,
            serialNumber,
          },
        },
        update: {
          itemId: item.id,
          batchId: batch.id,
          status: "AVAILABLE",
          remarks: `Initial serial seed for ${item.itemCode}.`,
        },
        create: {
          branchId: branch.id,
          itemId: item.id,
          batchId: batch.id,
          serialNumber,
          status: "AVAILABLE",
          remarks: `Initial serial seed for ${item.itemCode}.`,
        },
      });

      createdOrUpdatedSerials += 1;
    }

    console.log(
      `OK: ${branch.code} / ${item.itemCode} / batch ${stock.batchCode} / qty ${quantity}`
    );
  }

  console.log("\nSeeder Summary");
  console.log("--------------");
  console.log("Batches created/updated:", createdOrUpdatedBatches);
  console.log("Movements created/updated:", createdOrUpdatedMovements);
  console.log("Serials created/updated:", createdOrUpdatedSerials);
  console.log("Skipped items:", skippedItems);
};

main()
  .catch((error) => {
    console.error("\nInitial inventory seeder failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
