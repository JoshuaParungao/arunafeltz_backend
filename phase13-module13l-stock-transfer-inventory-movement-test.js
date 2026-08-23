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
  console.log("\nPHASE 13 MODULE 13L: Stock Transfer Inventory Movement Test");
  console.log("----------------------------------------------------------");

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
        startsWith: "TRMOVE-13L-",
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      referenceNo: {
        startsWith: "TRMOVE-13L-",
      },
    },
  });

  await prisma.itemSerial.deleteMany({
    where: {
      serialNumber: {
        startsWith: "TRMOVE-13L-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      batchCode: {
        startsWith: "TRMOVE-13L-",
      },
    },
  });

  assert(true, "Previous 13L transfer movement test data cleared");

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

  const mainItem = await prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId: mainBranchId,
        itemCode: "TRMOVE-13L-ITEM",
      },
    },
    update: {
      itemName: "13L Transfer Movement Test Item",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
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
      itemCode: "TRMOVE-13L-ITEM",
      itemName: "13L Transfer Movement Test Item",
      description: "Temporary MAIN item for Phase 13L transfer movement",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
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

  const mabItem = await prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId: mabBranch.id,
        itemCode: "TRMOVE-13L-ITEM",
      },
    },
    update: {
      itemName: "13L Transfer Movement Test Item",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
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
      itemCode: "TRMOVE-13L-ITEM",
      itemName: "13L Transfer Movement Test Item",
      description: "Temporary MAB item for Phase 13L transfer movement",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
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

  assert(Boolean(mainItem.id), "MAIN matching item ready");
  assert(Boolean(mabItem.id), "MAB matching item ready");

  const sourceBatch = await prisma.inventoryBatch.create({
    data: {
      branchId: mainBranchId,
      itemId: mainItem.id,
      batchCode: "TRMOVE-13L-BATCH-0001",
      quantityIn: "10",
      quantityAvailable: "10",
      unitCost: "1000",
      sellingPrice1: "1200",
      sellingPrice2: "1250",
      sellingPrice3: "1300",
      sellingPrice4: "1350",
      sellingPrice5: "1400",
      supplierName: "13L Test Supplier",
      referenceNo: "TRMOVE-13L-SOURCE-REF",
      remarks: "13L source batch",
      status: "ACTIVE",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(sourceBatch.id), "Source batch ready");

  const createTransfer = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRMOVE-13L-0001",
      notes: "13L transfer movement test",
      items: [
        {
          itemId: mainItem.id,
          fromBatchId: sourceBatch.id,
          description: mainItem.itemName,
          quantity: 4,
        },
      ],
    }),
  });

  if (createTransfer.status !== 201) {
    console.dir(createTransfer.body, { depth: null });
  }

  assert(createTransfer.status === 201, "Draft transfer created");

  const postWithoutApproval = await request(`/stock-transfers/${createTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  assert(postWithoutApproval.status === 400, "Cannot post transfer before approval");

  const approveTransfer = await request(`/stock-transfers/${createTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(approveTransfer.status === 200, "Transfer approved");
  assert(approveTransfer.body.data.status === "APPROVED", "Transfer status is APPROVED");

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

  assert(postTransfer.status === 200, "Approved transfer can be posted");
  assert(postTransfer.body.data.status === "POSTED", "Transfer status is POSTED");
  assert(Boolean(postTransfer.body.data.postedAt), "postedAt saved");
  assert(postTransfer.body.data.postedBy.id === adminLogin.user.id, "postedBy saved");

  const updatedSourceBatch = await prisma.inventoryBatch.findUnique({
    where: {
      id: sourceBatch.id,
    },
  });

  assert(Number(updatedSourceBatch.quantityAvailable) === 6, "Source batch quantityAvailable deducted to 6");
  assert(Number(updatedSourceBatch.quantityIn) === 10, "Source batch quantityIn unchanged");

  const destinationBatch = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId: mabBranch.id,
        batchCode: "TRMOVE-13L-BATCH-0001",
      },
    },
  });

  assert(Boolean(destinationBatch), "Destination batch created");
  assert(destinationBatch.itemId === mabItem.id, "Destination batch linked to MAB matching item");
  assert(Number(destinationBatch.quantityIn) === 4, "Destination batch quantityIn increased to 4");
  assert(Number(destinationBatch.quantityAvailable) === 4, "Destination batch quantityAvailable increased to 4");

  const transferOutMovement = await prisma.inventoryMovement.findFirst({
    where: {
      branchId: mainBranchId,
      itemId: mainItem.id,
      batchId: sourceBatch.id,
      type: "TRANSFER_OUT",
      source: "TRANSFER",
      referenceNo: "TRMOVE-13L-0001",
    },
  });

  assert(Boolean(transferOutMovement), "TRANSFER_OUT movement created");
  assert(Number(transferOutMovement.quantity) === 4, "TRANSFER_OUT movement quantity saved");
  assert(Number(transferOutMovement.previousQuantity) === 10, "TRANSFER_OUT previousQuantity saved");
  assert(Number(transferOutMovement.newQuantity) === 6, "TRANSFER_OUT newQuantity saved");

  const transferInMovement = await prisma.inventoryMovement.findFirst({
    where: {
      branchId: mabBranch.id,
      itemId: mabItem.id,
      batchId: destinationBatch.id,
      type: "TRANSFER_IN",
      source: "TRANSFER",
      referenceNo: "TRMOVE-13L-0001",
    },
  });

  assert(Boolean(transferInMovement), "TRANSFER_IN movement created");
  assert(Number(transferInMovement.quantity) === 4, "TRANSFER_IN movement quantity saved");
  assert(Number(transferInMovement.previousQuantity) === 0, "TRANSFER_IN previousQuantity saved");
  assert(Number(transferInMovement.newQuantity) === 4, "TRANSFER_IN newQuantity saved");

  const updatePosted = await request(`/stock-transfers/${createTransfer.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Should not update posted transfer",
    }),
  });

  assert(updatePosted.status === 400, "Posted transfer cannot be updated");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 13 MODULE 13L STOCK TRANSFER INVENTORY MOVEMENT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13L STOCK TRANSFER INVENTORY MOVEMENT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
