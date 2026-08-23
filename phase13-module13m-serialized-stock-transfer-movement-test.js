require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
  admin: {
    identifier: "mainadmin",
    password: "Password123!",
  },
};

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...options,
  });

  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.data?.token) {
    console.dir(result.body, { depth: null });
    throw new Error("Login failed for " + user.identifier);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const main = async () => {
  console.log("\nPHASE 13 MODULE 13M: Serialized Stock Transfer Movement Test");
  console.log("------------------------------------------------------------");

  const adminLogin = await login(users.admin);
  const mainBranchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  const mabBranch = await prisma.branch.findFirst({
    where: {
      code: "MAB",
      status: "ACTIVE",
    },
  });

  assert(Boolean(mainBranchId), "Admin MAIN branch detected");
  assert(Boolean(mabBranch), "MAB branch detected");

  await prisma.stockTransfer.deleteMany({
    where: {
      transferCode: {
        startsWith: "TRSERIAL-13M-",
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      referenceNo: {
        startsWith: "TRSERIAL-13M-",
      },
    },
  });

  await prisma.itemSerial.deleteMany({
    where: {
      serialNumber: {
        startsWith: "TRSERIAL-13M-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      batchCode: {
        startsWith: "TRSERIAL-13M-",
      },
    },
  });

  assert(true, "Previous 13M serialized transfer test data cleared");

  const mainCategory = await prisma.itemCategory.findFirst({
    where: {
      branchId: mainBranchId,
      status: "ACTIVE",
    },
  });

  const mabCategory = await prisma.itemCategory.findFirst({
    where: {
      branchId: mabBranch.id,
      status: "ACTIVE",
    },
  });

  const unit = await prisma.unit.findFirst({
    where: {
      status: "ACTIVE",
    },
  });

  assert(Boolean(mainCategory), "MAIN active category found");
  assert(Boolean(mabCategory), "MAB active category found");
  assert(Boolean(unit), "Active unit found");

  const mainSerializedItem = await prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId: mainBranchId,
        itemCode: "TRSERIAL-13M-ITEM",
      },
    },
    update: {
      itemName: "13M Serialized Transfer Test Item",
      status: "ACTIVE",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      categoryId: mainCategory.id,
      unitId: unit.id,
      updatedById: adminLogin.user.id,
    },
    create: {
      branchId: mainBranchId,
      itemCode: "TRSERIAL-13M-ITEM",
      itemName: "13M Serialized Transfer Test Item",
      description: "Temporary MAIN serialized item for Phase 13M",
      status: "ACTIVE",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      minimumStock: "0",
      reorderLevel: "0",
      categoryId: mainCategory.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const mabSerializedItem = await prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId: mabBranch.id,
        itemCode: "TRSERIAL-13M-ITEM",
      },
    },
    update: {
      itemName: "13M Serialized Transfer Test Item",
      status: "ACTIVE",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      categoryId: mabCategory.id,
      unitId: unit.id,
      updatedById: adminLogin.user.id,
    },
    create: {
      branchId: mabBranch.id,
      itemCode: "TRSERIAL-13M-ITEM",
      itemName: "13M Serialized Transfer Test Item",
      description: "Temporary MAB serialized item for Phase 13M",
      status: "ACTIVE",
      isSerialized: true,
      hasWarranty: true,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      minimumStock: "0",
      reorderLevel: "0",
      categoryId: mabCategory.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(mainSerializedItem.id), "MAIN serialized matching item ready");
  assert(Boolean(mabSerializedItem.id), "MAB serialized matching item ready");

  const sourceBatch = await prisma.inventoryBatch.create({
    data: {
      branchId: mainBranchId,
      itemId: mainSerializedItem.id,
      batchCode: "TRSERIAL-13M-BATCH-0001",
      quantityIn: "2",
      quantityAvailable: "2",
      unitCost: "1000",
      sellingPrice1: "1200",
      sellingPrice2: "1250",
      sellingPrice3: "1300",
      sellingPrice4: "1350",
      sellingPrice5: "1400",
      supplierName: "13M Test Supplier",
      referenceNo: "TRSERIAL-13M-SOURCE-REF",
      remarks: "13M source serialized batch",
      status: "ACTIVE",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(sourceBatch.id), "Source serialized batch ready");

  const serialOne = await prisma.itemSerial.create({
    data: {
      branchId: mainBranchId,
      itemId: mainSerializedItem.id,
      batchId: sourceBatch.id,
      serialNumber: "TRSERIAL-13M-SN-001",
      status: "AVAILABLE",
      remarks: "13M source serial one",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const serialTwo = await prisma.itemSerial.create({
    data: {
      branchId: mainBranchId,
      itemId: mainSerializedItem.id,
      batchId: sourceBatch.id,
      serialNumber: "TRSERIAL-13M-SN-002",
      status: "AVAILABLE",
      remarks: "13M source serial two",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(serialOne.id), "Source serial one ready");
  assert(Boolean(serialTwo.id), "Source serial two ready");

  const missingSerialIds = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRSERIAL-13M-MISSING-SERIALS",
      items: [
        {
          itemId: mainSerializedItem.id,
          fromBatchId: sourceBatch.id,
          description: mainSerializedItem.itemName,
          quantity: 2,
        },
      ],
    }),
  });

  assert(missingSerialIds.status === 400, "Serialized transfer requires serialIds");

  const serialCountMismatch = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRSERIAL-13M-COUNT-MISMATCH",
      items: [
        {
          itemId: mainSerializedItem.id,
          fromBatchId: sourceBatch.id,
          description: mainSerializedItem.itemName,
          quantity: 2,
          serialIds: [serialOne.id],
        },
      ],
    }),
  });

  assert(serialCountMismatch.status === 400, "Serialized transfer validates serial count mismatch");

  const duplicateSerialRequest = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRSERIAL-13M-DUPLICATE",
      items: [
        {
          itemId: mainSerializedItem.id,
          fromBatchId: sourceBatch.id,
          description: mainSerializedItem.itemName,
          quantity: 2,
          serialIds: [serialOne.id, serialOne.id],
        },
      ],
    }),
  });

  assert(duplicateSerialRequest.status === 400, "Duplicate serial in request is blocked");

  const createTransfer = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRSERIAL-13M-0001",
      notes: "13M serialized transfer movement test",
      items: [
        {
          itemId: mainSerializedItem.id,
          fromBatchId: sourceBatch.id,
          description: mainSerializedItem.itemName,
          quantity: 2,
          serialIds: [serialOne.id, serialTwo.id],
        },
      ],
    }),
  });

  if (createTransfer.status !== 201) {
    console.dir(createTransfer.body, { depth: null });
  }

  assert(createTransfer.status === 201, "Serialized draft transfer created");
  assert(createTransfer.body.data.items.length === 1, "Serialized transfer item created");
  assert(createTransfer.body.data.items[0].serials.length === 2, "StockTransferSerial records created in draft transfer");

  const postWithoutApproval = await request(`/stock-transfers/${createTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  assert(postWithoutApproval.status === 400, "Cannot post serialized transfer before approval");

  const approveTransfer = await request(`/stock-transfers/${createTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(approveTransfer.status === 200, "Serialized transfer approved");
  assert(approveTransfer.body.data.status === "APPROVED", "Serialized transfer status is APPROVED");

  const postTransfer = await request(`/stock-transfers/${createTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  if (postTransfer.status !== 200) {
    console.dir(postTransfer.body, { depth: null });
  }

  assert(postTransfer.status === 200, "Approved serialized transfer can be posted");
  assert(postTransfer.body.data.status === "POSTED", "Serialized transfer status is POSTED");
  assert(Boolean(postTransfer.body.data.postedAt), "postedAt saved");
  assert(postTransfer.body.data.postedBy.id === adminLogin.user.id, "postedBy saved");

  const updatedSourceBatch = await prisma.inventoryBatch.findUnique({
    where: {
      id: sourceBatch.id,
    },
  });

  assert(Number(updatedSourceBatch.quantityAvailable) === 0, "Source serialized batch quantityAvailable deducted to 0");
  assert(updatedSourceBatch.status === "DEPLETED", "Source serialized batch marked DEPLETED");

  const destinationBatch = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId: mabBranch.id,
        batchCode: "TRSERIAL-13M-BATCH-0001",
      },
    },
  });

  assert(Boolean(destinationBatch), "Destination serialized batch created");
  assert(destinationBatch.itemId === mabSerializedItem.id, "Destination serialized batch linked to MAB matching item");
  assert(Number(destinationBatch.quantityIn) === 2, "Destination serialized batch quantityIn increased to 2");
  assert(Number(destinationBatch.quantityAvailable) === 2, "Destination serialized batch quantityAvailable increased to 2");

  const movedSerials = await prisma.itemSerial.findMany({
    where: {
      id: {
        in: [serialOne.id, serialTwo.id],
      },
    },
    orderBy: {
      serialNumber: "asc",
    },
  });

  assert(movedSerials.length === 2, "Both serials still exist after transfer");
  assert(movedSerials.every((serial) => serial.branchId === mabBranch.id), "Serials moved to MAB branch");
  assert(movedSerials.every((serial) => serial.itemId === mabSerializedItem.id), "Serials moved to MAB matching item");
  assert(movedSerials.every((serial) => serial.batchId === destinationBatch.id), "Serials moved to destination batch");
  assert(movedSerials.every((serial) => serial.status === "AVAILABLE"), "Serials remain AVAILABLE");

  const transferOutMovement = await prisma.inventoryMovement.findFirst({
    where: {
      branchId: mainBranchId,
      itemId: mainSerializedItem.id,
      batchId: sourceBatch.id,
      type: "TRANSFER_OUT",
      source: "TRANSFER",
      referenceNo: "TRSERIAL-13M-0001",
    },
  });

  assert(Boolean(transferOutMovement), "Serialized TRANSFER_OUT movement created");
  assert(Number(transferOutMovement.quantity) === 2, "Serialized TRANSFER_OUT quantity saved");
  assert(Number(transferOutMovement.previousQuantity) === 2, "Serialized TRANSFER_OUT previousQuantity saved");
  assert(Number(transferOutMovement.newQuantity) === 0, "Serialized TRANSFER_OUT newQuantity saved");

  const transferInMovement = await prisma.inventoryMovement.findFirst({
    where: {
      branchId: mabBranch.id,
      itemId: mabSerializedItem.id,
      batchId: destinationBatch.id,
      type: "TRANSFER_IN",
      source: "TRANSFER",
      referenceNo: "TRSERIAL-13M-0001",
    },
  });

  assert(Boolean(transferInMovement), "Serialized TRANSFER_IN movement created");
  assert(Number(transferInMovement.quantity) === 2, "Serialized TRANSFER_IN quantity saved");
  assert(Number(transferInMovement.previousQuantity) === 0, "Serialized TRANSFER_IN previousQuantity saved");
  assert(Number(transferInMovement.newQuantity) === 2, "Serialized TRANSFER_IN newQuantity saved");

  const updatePosted = await request(`/stock-transfers/${createTransfer.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Should not update posted serialized transfer",
    }),
  });

  assert(updatePosted.status === 400, "Posted serialized transfer cannot be updated");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 13 MODULE 13M SERIALIZED STOCK TRANSFER MOVEMENT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13M SERIALIZED STOCK TRANSFER MOVEMENT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
