require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
  superOwner: {
    identifier: "superowner",
    password: "Password123!",
  },
  admin: {
    identifier: "mainadmin",
    password: "Password123!",
  },
  technician: {
    identifier: "pendingtech",
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
  console.log("\nPHASE 13 MODULE 13K: Stock Transfer API Base Test");
  console.log("------------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

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
        startsWith: "TRAPI-13K-",
      },
    },
  });

  await prisma.itemSerial.deleteMany({
    where: {
      branchId: mainBranchId,
      serialNumber: {
        startsWith: "TRAPI-13K-",
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      branchId: mainBranchId,
      referenceNo: {
        startsWith: "TRAPI-13K-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      branchId: mainBranchId,
      batchCode: {
        startsWith: "TRAPI-13K-",
      },
    },
  });

  assert(true, "Previous 13K stock transfer API test data cleared");

  const category = await prisma.itemCategory.findFirst({
    where: {
      branchId: mainBranchId,
      status: "ACTIVE",
    },
  });

  const unit = await prisma.unit.findFirst({
    where: {
      status: "ACTIVE",
    },
  });

  assert(Boolean(category), "Active item category found");
  assert(Boolean(unit), "Active unit found");

  const nonSerializedItem = await prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId: mainBranchId,
        itemCode: "TRAPI-13K-ITEM",
      },
    },
    update: {
      itemName: "13K Stock Transfer Test Item",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      categoryId: category.id,
      unitId: unit.id,
      updatedById: adminLogin.user.id,
    },
    create: {
      branchId: mainBranchId,
      itemCode: "TRAPI-13K-ITEM",
      itemName: "13K Stock Transfer Test Item",
      description: "Temporary test item for Phase 13K stock transfer API",
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
      categoryId: category.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(nonSerializedItem.id), "Non-serialized transfer test item ready");

  const nonSerializedBatch = await prisma.inventoryBatch.create({
    data: {
      branchId: mainBranchId,
      itemId: nonSerializedItem.id,
      batchCode: "TRAPI-13K-BATCH-0001",
      quantityIn: "10",
      quantityAvailable: "10",
      unitCost: "1000",
      sellingPrice1: "1200",
      sellingPrice2: "1250",
      sellingPrice3: "1300",
      sellingPrice4: "1350",
      sellingPrice5: "1400",
      supplierName: "13K Test Supplier",
      referenceNo: "TRAPI-13K-REF-0001",
      remarks: "13K transfer test batch",
      status: "ACTIVE",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(nonSerializedBatch.id), "Non-serialized transfer batch ready");

  const missingTokenList = await request("/stock-transfers");
  assert(missingTokenList.status === 401, "List stock transfers blocks missing token");

  const technicianList = await request("/stock-transfers", {
    token: technicianLogin.token,
  });

  assert(technicianList.status === 403, "Technician cannot list stock transfers");

  const missingToBranch = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  assert(missingToBranch.status === 400, "Create stock transfer validates missing toBranchId");

  const sameBranch = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mainBranchId,
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  assert(sameBranch.status === 400, "Same-branch transfer is blocked");

  const missingItems = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      items: [],
    }),
  });

  assert(missingItems.status === 400, "Create stock transfer validates missing items");

  const insufficientBatch = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRAPI-13K-INSUFFICIENT",
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName,
          quantity: 11,
        },
      ],
    }),
  });

  assert(insufficientBatch.status === 400, "Transfer quantity over batch available is blocked");

  const adminCreate = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRAPI-13K-0001",
      notes: "13K stock transfer API test",
      internalNotes: "Internal 13K transfer note",
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName,
          quantity: 2,
        },
      ],
    }),
  });

  if (adminCreate.status !== 201) {
    console.dir(adminCreate.body, { depth: null });
  }

  assert(adminCreate.status === 201, "Admin can create stock transfer from own branch");
  assert(adminCreate.body.data.transferCode === "TRAPI-13K-0001", "Transfer code saved uppercase");
  assert(adminCreate.body.data.status === "DRAFT", "Stock transfer starts as DRAFT");
  assert(adminCreate.body.data.fromBranch.id === mainBranchId, "Stock transfer fromBranch linked");
  assert(adminCreate.body.data.toBranch.id === mabBranch.id, "Stock transfer toBranch linked");
  assert(adminCreate.body.data.items.length === 1, "Stock transfer item created");
  assert(adminCreate.body.data.items[0].item.id === nonSerializedItem.id, "Stock transfer item linked to item");
  assert(adminCreate.body.data.items[0].fromBatch.id === nonSerializedBatch.id, "Stock transfer item linked to batch");

  const duplicateCode = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRAPI-13K-0001",
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  assert(duplicateCode.status === 409, "Duplicate transfer code is blocked in same from branch");

  const superMissingFromBranch = await request("/stock-transfers", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  assert(superMissingFromBranch.status === 400, "Super Owner must provide fromBranchId");

  const superCreate = await request("/stock-transfers", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      fromBranchId: mainBranchId,
      toBranchId: mabBranch.id,
      transferCode: "TRAPI-13K-SUPER",
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  assert(superCreate.status === 201, "Super Owner can create stock transfer with fromBranchId");

  const listAdmin = await request("/stock-transfers", {
    token: adminLogin.token,
  });

  assert(listAdmin.status === 200, "Admin can list stock transfers");
  assert(Array.isArray(listAdmin.body.data.items), "Stock transfer list returns items array");
  assert(
    listAdmin.body.data.items.some((transfer) => transfer.id === adminCreate.body.data.id),
    "Stock transfer list includes created transfer"
  );

  const searchList = await request("/stock-transfers?search=TRAPI-13K-0001", {
    token: adminLogin.token,
  });

  assert(searchList.status === 200, "Stock transfer search works");
  assert(
    searchList.body.data.items.some((transfer) => transfer.id === adminCreate.body.data.id),
    "Stock transfer search finds created transfer"
  );

  const statusList = await request("/stock-transfers?status=DRAFT", {
    token: adminLogin.token,
  });

  assert(statusList.status === 200, "Stock transfer status filter works");
  assert(statusList.body.data.items.every((transfer) => transfer.status === "DRAFT"), "Status filter returns DRAFT only");

  const pageList = await request("/stock-transfers?page=1&limit=1", {
    token: adminLogin.token,
  });

  assert(pageList.status === 200, "Stock transfer pagination works");
  assert(pageList.body.data.items.length <= 1, "Stock transfer pagination limit respected");

  const viewOne = await request(`/stock-transfers/${adminCreate.body.data.id}`, {
    token: adminLogin.token,
  });

  assert(viewOne.status === 200, "Admin can view stock transfer");
  assert(viewOne.body.data.id === adminCreate.body.data.id, "View returns correct stock transfer");

  const updateDraft = await request(`/stock-transfers/${adminCreate.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "13K updated stock transfer notes",
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName + " Updated",
          quantity: 3,
        },
      ],
    }),
  });

  if (updateDraft.status !== 200) {
    console.dir(updateDraft.body, { depth: null });
  }

  assert(updateDraft.status === 200, "Admin can update draft stock transfer");
  assert(updateDraft.body.data.notes === "13K updated stock transfer notes", "Stock transfer notes updated");
  assert(updateDraft.body.data.items.length === 1, "Stock transfer items replaced on update");
  assert(Number(updateDraft.body.data.items[0].quantity) === 3, "Updated stock transfer item quantity saved");

  const requestStatus = await request(`/stock-transfers/${adminCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "REQUESTED",
    }),
  });

  assert(requestStatus.status === 200, "Admin can update stock transfer to REQUESTED");
  assert(requestStatus.body.data.status === "REQUESTED", "Stock transfer status is REQUESTED");
  assert(Boolean(requestStatus.body.data.requestedAt), "requestedAt saved");
  assert(requestStatus.body.data.requestedBy.id === adminLogin.user.id, "requestedBy saved");

  const updateRequested = await request(`/stock-transfers/${adminCreate.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Should not update requested transfer",
    }),
  });

  assert(updateRequested.status === 400, "Requested stock transfer cannot be updated");

  const approveStatus = await request(`/stock-transfers/${adminCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(approveStatus.status === 200, "Admin can approve requested stock transfer");
  assert(approveStatus.body.data.status === "APPROVED", "Stock transfer status is APPROVED");
  assert(Boolean(approveStatus.body.data.approvedAt), "approvedAt saved");
  assert(approveStatus.body.data.approvedBy.id === adminLogin.user.id, "approvedBy saved");

  const postStatus = await request(`/stock-transfers/${adminCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  assert(postStatus.status === 400, "POSTED status is blocked until inventory transfer movement module");

  const rejectWithoutReason = await request(`/stock-transfers/${superCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "REJECTED",
    }),
  });

  assert(rejectWithoutReason.status === 400, "Reject stock transfer requires reason");

  const rejectStatus = await request(`/stock-transfers/${superCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "REJECTED",
      rejectionReason: "13K API reject test",
    }),
  });

  assert(rejectStatus.status === 200, "Admin can reject DRAFT stock transfer");
  assert(rejectStatus.body.data.status === "REJECTED", "Stock transfer status is REJECTED");
  assert(Boolean(rejectStatus.body.data.rejectedAt), "rejectedAt saved");
  assert(rejectStatus.body.data.rejectedBy.id === adminLogin.user.id, "rejectedBy saved");

  const cancelTransfer = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "TRAPI-13K-CANCEL",
      items: [
        {
          itemId: nonSerializedItem.id,
          fromBatchId: nonSerializedBatch.id,
          description: nonSerializedItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  assert(cancelTransfer.status === 201, "Cancel test transfer created");

  const cancelWithoutReason = await request(`/stock-transfers/${cancelTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
    }),
  });

  assert(cancelWithoutReason.status === 400, "Cancel stock transfer requires reason");

  const cancelStatus = await request(`/stock-transfers/${cancelTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      cancellationReason: "13K API cancel test",
    }),
  });

  assert(cancelStatus.status === 200, "Admin can cancel DRAFT stock transfer");
  assert(cancelStatus.body.data.status === "CANCELLED", "Stock transfer status is CANCELLED");
  assert(Boolean(cancelStatus.body.data.cancelledAt), "cancelledAt saved");
  assert(cancelStatus.body.data.cancelledBy.id === adminLogin.user.id, "cancelledBy saved");

  const missingTransfer = await request("/stock-transfers/not-existing-transfer-id", {
    token: adminLogin.token,
  });

  assert(missingTransfer.status === 404, "Missing stock transfer view returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 13 MODULE 13K STOCK TRANSFER API BASE TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13K STOCK TRANSFER API BASE TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
