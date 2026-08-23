require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const main = async () => {
  console.log("PHASE 13 MODULE 13J: STOCK TRANSFER DB CHECK");
  console.log("---------------------------------------------");

  assert(Boolean(prisma.stockTransfer), "Prisma stockTransfer model is available");
  assert(Boolean(prisma.stockTransferItem), "Prisma stockTransferItem model is available");
  assert(Boolean(prisma.stockTransferSerial), "Prisma stockTransferSerial model is available");

  const transferCount = await prisma.stockTransfer.count();
  const transferItemCount = await prisma.stockTransferItem.count();
  const transferSerialCount = await prisma.stockTransferSerial.count();

  assert(Number.isInteger(transferCount), "StockTransfer count works");
  assert(Number.isInteger(transferItemCount), "StockTransferItem count works");
  assert(Number.isInteger(transferSerialCount), "StockTransferSerial count works");

  const mainBranch = await prisma.branch.findFirst({
    where: {
      code: "MAIN",
    },
    include: {
      stockTransfersFrom: true,
      stockTransfersTo: true,
    },
  });

  const mabBranch = await prisma.branch.findFirst({
    where: {
      code: "MAB",
    },
    include: {
      stockTransfersFrom: true,
      stockTransfersTo: true,
    },
  });

  assert(Boolean(mainBranch), "MAIN branch found");
  assert(Boolean(mabBranch), "MAB branch found");
  assert(mainBranch.id !== mabBranch.id, "Branches are different");
  assert(Array.isArray(mainBranch.stockTransfersFrom), "Branch stockTransfersFrom relation works");
  assert(Array.isArray(mainBranch.stockTransfersTo), "Branch stockTransfersTo relation works");

  const user = await prisma.user.findFirst({
    where: {
      username: "mainadmin",
    },
    include: {
      requestedStockTransfers: true,
      approvedStockTransfers: true,
      rejectedStockTransfers: true,
      postedStockTransfers: true,
      cancelledStockTransfers: true,
      createdStockTransfers: true,
      updatedStockTransfers: true,
    },
  });

  assert(Boolean(user), "User found");
  assert(Array.isArray(user.requestedStockTransfers), "User requestedStockTransfers relation works");
  assert(Array.isArray(user.approvedStockTransfers), "User approvedStockTransfers relation works");
  assert(Array.isArray(user.rejectedStockTransfers), "User rejectedStockTransfers relation works");
  assert(Array.isArray(user.postedStockTransfers), "User postedStockTransfers relation works");
  assert(Array.isArray(user.cancelledStockTransfers), "User cancelledStockTransfers relation works");
  assert(Array.isArray(user.createdStockTransfers), "User createdStockTransfers relation works");
  assert(Array.isArray(user.updatedStockTransfers), "User updatedStockTransfers relation works");

  const item = await prisma.item.findFirst({
    where: {
      branchId: mainBranch.id,
      status: "ACTIVE",
    },
    include: {
      stockTransferItems: true,
    },
  });

  assert(Boolean(item), "Active MAIN item found");
  assert(Array.isArray(item.stockTransferItems), "Item stockTransferItems relation works");

  await prisma.stockTransfer.deleteMany({
    where: {
      fromBranchId: mainBranch.id,
      transferCode: {
        startsWith: "TRTEST-13J-",
      },
    },
  });

  await prisma.itemSerial.deleteMany({
    where: {
      branchId: mainBranch.id,
      serialNumber: {
        startsWith: "TRTEST-13J-",
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      branchId: mainBranch.id,
      referenceNo: {
        startsWith: "TRTEST-13J-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      branchId: mainBranch.id,
      batchCode: {
        startsWith: "TRTEST-13J-",
      },
    },
  });

  assert(true, "Previous 13J stock transfer test data cleared");

  const batch = await prisma.inventoryBatch.create({
    data: {
      branchId: mainBranch.id,
      itemId: item.id,
      batchCode: "TRTEST-13J-BATCH-0001",
      quantityIn: "10",
      quantityAvailable: "10",
      unitCost: item.costPrice.toString(),
      sellingPrice1: item.price1.toString(),
      sellingPrice2: item.price2.toString(),
      sellingPrice3: item.price3.toString(),
      sellingPrice4: item.price4.toString(),
      sellingPrice5: item.price5.toString(),
      supplierName: "13J Test Supplier",
      referenceNo: "TRTEST-13J-REF-0001",
      remarks: "13J stock transfer DB test batch",
      status: "ACTIVE",
      createdById: user.id,
      updatedById: user.id,
    },
    include: {
      stockTransferItemsFrom: true,
    },
  });

  assert(Boolean(batch.id), "InventoryBatch for stock transfer test created");
  assert(Array.isArray(batch.stockTransferItemsFrom), "InventoryBatch stockTransferItemsFrom relation works");

  const created = await prisma.stockTransfer.create({
    data: {
      transferCode: "TRTEST-13J-0001",
      status: "DRAFT",
      notes: "Phase 13J stock transfer DB test only",
      internalNotes: "Internal 13J note",
      fromBranchId: mainBranch.id,
      toBranchId: mabBranch.id,
      requestedById: user.id,
      createdById: user.id,
      updatedById: user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: item.itemName,
            quantity: "2",
            itemId: item.id,
            fromBatchId: batch.id,
          },
        ],
      },
    },
    include: {
      fromBranch: true,
      toBranch: true,
      requestedBy: true,
      createdBy: true,
      updatedBy: true,
      items: {
        include: {
          item: true,
          fromBatch: true,
          serials: true,
        },
      },
    },
  });

  assert(Boolean(created.id), "StockTransfer create works");
  assert(created.status === "DRAFT", "StockTransfer status saved as DRAFT");
  assert(created.fromBranch.id === mainBranch.id, "StockTransfer fromBranch relation works");
  assert(created.toBranch.id === mabBranch.id, "StockTransfer toBranch relation works");
  assert(created.requestedBy.id === user.id, "StockTransfer requestedBy relation works");
  assert(created.createdBy.id === user.id, "StockTransfer createdBy relation works");
  assert(created.updatedBy.id === user.id, "StockTransfer updatedBy relation works");
  assert(created.items.length === 1, "StockTransferItem nested create works");
  assert(created.items[0].item.id === item.id, "StockTransferItem item relation works");
  assert(created.items[0].fromBatch.id === batch.id, "StockTransferItem fromBatch relation works");
  assert(Number(created.items[0].quantity) === 2, "StockTransferItem quantity saved");

  const serialItem = await prisma.item.findFirst({
    where: {
      branchId: mainBranch.id,
      status: "ACTIVE",
      isSerialized: true,
    },
  });

  if (serialItem) {
    const serialBatch = await prisma.inventoryBatch.create({
      data: {
        branchId: mainBranch.id,
        itemId: serialItem.id,
        batchCode: "TRTEST-13J-SERIAL-BATCH-0001",
        quantityIn: "1",
        quantityAvailable: "1",
        unitCost: serialItem.costPrice.toString(),
        sellingPrice1: serialItem.price1.toString(),
        sellingPrice2: serialItem.price2.toString(),
        sellingPrice3: serialItem.price3.toString(),
        sellingPrice4: serialItem.price4.toString(),
        sellingPrice5: serialItem.price5.toString(),
        supplierName: "13J Test Supplier",
        referenceNo: "TRTEST-13J-SERIAL-REF-0001",
        remarks: "13J stock transfer serial DB test batch",
        status: "ACTIVE",
        createdById: user.id,
        updatedById: user.id,
      },
    });

    const serial = await prisma.itemSerial.create({
      data: {
        branchId: mainBranch.id,
        itemId: serialItem.id,
        batchId: serialBatch.id,
        serialNumber: "TRTEST-13J-SERIAL-0001",
        status: "AVAILABLE",
        remarks: "13J stock transfer DB test serial",
        createdById: user.id,
        updatedById: user.id,
      },
      include: {
        stockTransferSerials: true,
      },
    });

    assert(Boolean(serial.id), "ItemSerial for stock transfer test created");
    assert(Array.isArray(serial.stockTransferSerials), "ItemSerial stockTransferSerials relation works");

    const transferItem = await prisma.stockTransferItem.create({
      data: {
        stockTransferId: created.id,
        lineNo: 2,
        description: serialItem.itemName,
        quantity: "1",
        itemId: serialItem.id,
        fromBatchId: serialBatch.id,
        serials: {
          create: [
            {
              itemSerialId: serial.id,
              serialNumberSnapshot: serial.serialNumber,
            },
          ],
        },
      },
      include: {
        serials: {
          include: {
            itemSerial: true,
          },
        },
      },
    });

    assert(transferItem.serials.length === 1, "StockTransferSerial nested create works");
    assert(transferItem.serials[0].itemSerial.id === serial.id, "StockTransferSerial itemSerial relation works");
    assert(
      transferItem.serials[0].serialNumberSnapshot === serial.serialNumber,
      "StockTransferSerial serialNumberSnapshot saved"
    );
  } else {
    console.log("SKIP: No serialized MAIN item found, serial relation test skipped.");
  }

  const fetched = await prisma.stockTransfer.findUnique({
    where: {
      id: created.id,
    },
    include: {
      fromBranch: {
        include: {
          stockTransfersFrom: true,
        },
      },
      toBranch: {
        include: {
          stockTransfersTo: true,
        },
      },
      items: {
        include: {
          item: true,
          fromBatch: true,
          serials: true,
        },
      },
    },
  });

  assert(Boolean(fetched), "StockTransfer fetch works");
  assert(fetched.items.length >= 1, "StockTransfer items relation works");
  assert(
    fetched.fromBranch.stockTransfersFrom.some((transfer) => transfer.id === created.id),
    "From branch can fetch linked stock transfer"
  );
  assert(
    fetched.toBranch.stockTransfersTo.some((transfer) => transfer.id === created.id),
    "To branch can fetch linked stock transfer"
  );

  const approved = await prisma.stockTransfer.update({
    where: {
      id: created.id,
    },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: user.id,
      updatedById: user.id,
    },
    include: {
      approvedBy: true,
    },
  });

  assert(approved.status === "APPROVED", "StockTransfer status can update to APPROVED");
  assert(Boolean(approved.approvedAt), "StockTransfer approvedAt saved");
  assert(approved.approvedBy.id === user.id, "StockTransfer approvedBy relation works");

  await prisma.stockTransfer.delete({
    where: {
      id: created.id,
    },
  });

  const leftoverItems = await prisma.stockTransferItem.count({
    where: {
      stockTransferId: created.id,
    },
  });

  assert(leftoverItems === 0, "StockTransferItem cascade cleanup works");

  console.log("\nPHASE 13 MODULE 13J STOCK TRANSFER DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13J STOCK TRANSFER DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
