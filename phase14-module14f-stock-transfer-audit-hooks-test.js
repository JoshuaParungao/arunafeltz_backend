require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
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

const getMainBranchId = (user) => {
  return user.branch?.id || user.branchId;
};

const main = async () => {
  console.log("\nPHASE 14 MODULE 14F: Stock Transfer Audit Hooks Test");
  console.log("----------------------------------------------------");

  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const mainBranchId = getMainBranchId(adminLogin.user);

  assert(Boolean(mainBranchId), "MAIN branch detected");

  const toBranch = await prisma.branch.findFirst({
    where: {
      id: {
        not: mainBranchId,
      },
      status: "ACTIVE",
    },
    orderBy: {
      code: "asc",
    },
  });

  assert(Boolean(toBranch), "Second active branch detected");

  await prisma.auditLog.deleteMany({
    where: {
      action: {
        in: [
          "STOCK_TRANSFER_CREATED",
          "STOCK_TRANSFER_UPDATED",
          "STOCK_TRANSFER_REQUESTED",
          "STOCK_TRANSFER_APPROVED",
          "STOCK_TRANSFER_REJECTED",
          "STOCK_TRANSFER_POSTED",
          "STOCK_TRANSFER_CANCELLED",
        ],
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      referenceNo: {
        startsWith: "PHASE14F-",
      },
    },
  });

  await prisma.stockTransfer.deleteMany({
    where: {
      transferCode: {
        startsWith: "PHASE14F-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      batchCode: {
        startsWith: "PHASE14F-",
      },
    },
  });

  await prisma.item.deleteMany({
    where: {
      itemCode: {
        startsWith: "PHASE14F-",
      },
    },
  });

  assert(true, "Previous 14F stock transfer/audit test data cleared");

  const mainCategory = await prisma.itemCategory.findFirst({
    where: {
      branchId: mainBranchId,
      status: "ACTIVE",
    },
  });

  const toCategory = await prisma.itemCategory.findFirst({
    where: {
      branchId: toBranch.id,
      status: "ACTIVE",
    },
  });

  const unit = await prisma.unit.findFirst({
    where: {
      status: "ACTIVE",
    },
  });

  assert(Boolean(mainCategory), "MAIN active category found");
  assert(Boolean(toCategory), "Destination branch active category found");
  assert(Boolean(unit), "Active unit found");

  const sourceItem = await prisma.item.create({
    data: {
      branchId: mainBranchId,
      itemCode: "PHASE14F-ITEM",
      itemName: "Phase 14F Item",
      description: "Temporary source item for stock transfer audit test",
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

  const destinationItem = await prisma.item.create({
    data: {
      branchId: toBranch.id,
      itemCode: "PHASE14F-ITEM",
      itemName: "Phase 14F Item",
      description: "Temporary destination item for stock transfer audit test",
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
      categoryId: toCategory.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const sourceBatch = await prisma.inventoryBatch.create({
    data: {
      branchId: mainBranchId,
      itemId: sourceItem.id,
      batchCode: "PHASE14F-BATCH-0001",
      quantityIn: "100",
      quantityAvailable: "100",
      unitCost: "1000",
      sellingPrice1: "1200",
      sellingPrice2: "1250",
      sellingPrice3: "1300",
      sellingPrice4: "1350",
      sellingPrice5: "1400",
      supplierName: "Phase 14F Test Supplier",
      referenceNo: "PHASE14F-STOCK-SEED",
      remarks: "Temporary batch for stock transfer audit test",
      status: "ACTIVE",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(sourceItem.id), "Source item ready");
  assert(Boolean(destinationItem.id), "Destination matching item ready");
  assert(Boolean(sourceBatch.id), "Source batch ready");

  const createTransfer = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      fromBranchId: mainBranchId,
      toBranchId: toBranch.id,
      transferCode: "PHASE14F-ST-0001",
      notes: "Phase 14F create audit",
      internalNotes: "Internal create audit",
      items: [
        {
          itemId: sourceItem.id,
          fromBatchId: sourceBatch.id,
          description: sourceItem.itemName,
          quantity: 5,
        },
      ],
    }),
  });

  if (createTransfer.status !== 201) {
    console.dir(createTransfer.body, { depth: null });
  }

  assert(createTransfer.status === 201, "Stock transfer created through API");
  assert(createTransfer.body.data.transferCode === "PHASE14F-ST-0001", "Transfer code saved");

  const transferId = createTransfer.body.data.id;

  const createdAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "STOCK_TRANSFER_CREATED",
      entityType: "StockTransfer",
      entityId: transferId,
    },
  });

  assert(Boolean(createdAuditLog), "STOCK_TRANSFER_CREATED audit log created");
  assert(createdAuditLog.actorId === adminLogin.user.id, "Create audit actorId saved");
  assert(createdAuditLog.branchId === mainBranchId, "Create audit branchId saved");
  assert(createdAuditLog.metadata.transferCode === "PHASE14F-ST-0001", "Create audit transferCode metadata saved");
  assert(createdAuditLog.metadata.itemCount === 1, "Create audit itemCount metadata saved");

  const updateTransfer = await request(`/stock-transfers/${transferId}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Phase 14F updated notes",
      internalNotes: "Phase 14F updated internal notes",
    }),
  });

  if (updateTransfer.status !== 200) {
    console.dir(updateTransfer.body, { depth: null });
  }

  assert(updateTransfer.status === 200, "Stock transfer updated through API");
  assert(updateTransfer.body.data.notes === "Phase 14F updated notes", "Transfer notes update saved");

  const updatedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "STOCK_TRANSFER_UPDATED",
      entityType: "StockTransfer",
      entityId: transferId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(updatedAuditLog), "STOCK_TRANSFER_UPDATED audit log created");
  assert(updatedAuditLog.actorId === adminLogin.user.id, "Update audit actorId saved");
  assert(updatedAuditLog.branchId === mainBranchId, "Update audit branchId saved");
  assert(Array.isArray(updatedAuditLog.metadata.changedFields), "Update audit changedFields saved");
  assert(updatedAuditLog.metadata.changedFields.includes("notes"), "Update audit tracks notes field");
  assert(updatedAuditLog.metadata.previous.notes === "Phase 14F create audit", "Update audit previous notes saved");
  assert(updatedAuditLog.metadata.current.notes === "Phase 14F updated notes", "Update audit current notes saved");

  const requestTransfer = await request(`/stock-transfers/${transferId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "REQUESTED",
    }),
  });

  if (requestTransfer.status !== 200) {
    console.dir(requestTransfer.body, { depth: null });
  }

  assert(requestTransfer.status === 200, "Stock transfer requested through API");
  assert(requestTransfer.body.data.status === "REQUESTED", "Transfer status saved as REQUESTED");

  const requestedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "STOCK_TRANSFER_REQUESTED",
      entityType: "StockTransfer",
      entityId: transferId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(requestedAuditLog), "STOCK_TRANSFER_REQUESTED audit log created");
  assert(requestedAuditLog.metadata.previousStatus === "DRAFT", "Requested audit previousStatus saved");
  assert(requestedAuditLog.metadata.currentStatus === "REQUESTED", "Requested audit currentStatus saved");

  const approveTransfer = await request(`/stock-transfers/${transferId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  if (approveTransfer.status !== 200) {
    console.dir(approveTransfer.body, { depth: null });
  }

  assert(approveTransfer.status === 200, "Stock transfer approved through API");
  assert(approveTransfer.body.data.status === "APPROVED", "Transfer status saved as APPROVED");

  const approvedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "STOCK_TRANSFER_APPROVED",
      entityType: "StockTransfer",
      entityId: transferId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(approvedAuditLog), "STOCK_TRANSFER_APPROVED audit log created");
  assert(approvedAuditLog.metadata.previousStatus === "REQUESTED", "Approved audit previousStatus saved");
  assert(approvedAuditLog.metadata.currentStatus === "APPROVED", "Approved audit currentStatus saved");

  const postTransfer = await request(`/stock-transfers/${transferId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  if (postTransfer.status !== 200) {
    console.dir(postTransfer.body, { depth: null });
  }

  assert(postTransfer.status === 200, "Stock transfer posted through API");
  assert(postTransfer.body.data.status === "POSTED", "Transfer status saved as POSTED");

  const postedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "STOCK_TRANSFER_POSTED",
      entityType: "StockTransfer",
      entityId: transferId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(postedAuditLog), "STOCK_TRANSFER_POSTED audit log created");
  assert(postedAuditLog.metadata.previousStatus === "APPROVED", "Posted audit previousStatus saved");
  assert(postedAuditLog.metadata.currentStatus === "POSTED", "Posted audit currentStatus saved");
  assert(Boolean(postedAuditLog.metadata.postedAt), "Posted audit postedAt saved");

  const sourceBatchAfterPost = await prisma.inventoryBatch.findUnique({
    where: {
      id: sourceBatch.id,
    },
  });

  assert(Number(sourceBatchAfterPost.quantityAvailable) === 95, "Source batch deducted after posted transfer");

  const destinationBatchAfterPost = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId: toBranch.id,
        batchCode: "PHASE14F-BATCH-0001",
      },
    },
  });

  assert(Boolean(destinationBatchAfterPost), "Destination batch created after posted transfer");
  assert(Number(destinationBatchAfterPost.quantityAvailable) === 5, "Destination batch quantity added after posted transfer");

  const createRejectTransfer = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      fromBranchId: mainBranchId,
      toBranchId: toBranch.id,
      transferCode: "PHASE14F-ST-REJECT-0001",
      notes: "Phase 14F reject audit",
      items: [
        {
          itemId: sourceItem.id,
          fromBatchId: sourceBatch.id,
          description: sourceItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  if (createRejectTransfer.status !== 201) {
    console.dir(createRejectTransfer.body, { depth: null });
  }

  assert(createRejectTransfer.status === 201, "Second transfer created for rejection test");

  const rejectTransfer = await request(`/stock-transfers/${createRejectTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "REJECTED",
      rejectionReason: "Phase 14F rejection audit test",
    }),
  });

  if (rejectTransfer.status !== 200) {
    console.dir(rejectTransfer.body, { depth: null });
  }

  assert(rejectTransfer.status === 200, "Stock transfer rejected through API");
  assert(rejectTransfer.body.data.status === "REJECTED", "Transfer status saved as REJECTED");

  const rejectedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "STOCK_TRANSFER_REJECTED",
      entityType: "StockTransfer",
      entityId: createRejectTransfer.body.data.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(rejectedAuditLog), "STOCK_TRANSFER_REJECTED audit log created");
  assert(rejectedAuditLog.metadata.previousStatus === "DRAFT", "Rejected audit previousStatus saved");
  assert(rejectedAuditLog.metadata.currentStatus === "REJECTED", "Rejected audit currentStatus saved");
  assert(rejectedAuditLog.metadata.rejectionReason === "Phase 14F rejection audit test", "Rejected audit rejectionReason saved");

  const createCancelTransfer = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      fromBranchId: mainBranchId,
      toBranchId: toBranch.id,
      transferCode: "PHASE14F-ST-CANCEL-0001",
      notes: "Phase 14F cancel audit",
      items: [
        {
          itemId: sourceItem.id,
          fromBatchId: sourceBatch.id,
          description: sourceItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  if (createCancelTransfer.status !== 201) {
    console.dir(createCancelTransfer.body, { depth: null });
  }

  assert(createCancelTransfer.status === 201, "Third transfer created for cancellation test");

  const cancelTransfer = await request(`/stock-transfers/${createCancelTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      cancellationReason: "Phase 14F cancellation audit test",
    }),
  });

  if (cancelTransfer.status !== 200) {
    console.dir(cancelTransfer.body, { depth: null });
  }

  assert(cancelTransfer.status === 200, "Stock transfer cancelled through API");
  assert(cancelTransfer.body.data.status === "CANCELLED", "Transfer status saved as CANCELLED");

  const cancelledAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "STOCK_TRANSFER_CANCELLED",
      entityType: "StockTransfer",
      entityId: createCancelTransfer.body.data.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(cancelledAuditLog), "STOCK_TRANSFER_CANCELLED audit log created");
  assert(cancelledAuditLog.metadata.previousStatus === "DRAFT", "Cancelled audit previousStatus saved");
  assert(cancelledAuditLog.metadata.currentStatus === "CANCELLED", "Cancelled audit currentStatus saved");
  assert(
    cancelledAuditLog.metadata.cancellationReason === "Phase 14F cancellation audit test",
    "Cancelled audit cancellationReason saved"
  );

  const auditList = await request("/audit-logs?search=PHASE14F-ST&page=1&limit=30", {
    token: adminLogin.token,
  });

  if (auditList.status !== 200) {
    console.dir(auditList.body, { depth: null });
  }

  assert(auditList.status === 200, "Audit logs API can search stock transfer audit logs");
  assert(auditList.body.data.some((log) => log.action === "STOCK_TRANSFER_CREATED"), "Audit logs API returns transfer created log");
  assert(auditList.body.data.some((log) => log.action === "STOCK_TRANSFER_UPDATED"), "Audit logs API returns transfer updated log");
  assert(auditList.body.data.some((log) => log.action === "STOCK_TRANSFER_REQUESTED"), "Audit logs API returns transfer requested log");
  assert(auditList.body.data.some((log) => log.action === "STOCK_TRANSFER_APPROVED"), "Audit logs API returns transfer approved log");
  assert(auditList.body.data.some((log) => log.action === "STOCK_TRANSFER_POSTED"), "Audit logs API returns transfer posted log");
  assert(auditList.body.data.some((log) => log.action === "STOCK_TRANSFER_REJECTED"), "Audit logs API returns transfer rejected log");
  assert(auditList.body.data.some((log) => log.action === "STOCK_TRANSFER_CANCELLED"), "Audit logs API returns transfer cancelled log");

  const technicianTransferCreate = await request("/stock-transfers", {
    method: "POST",
    token: technicianLogin.token,
    body: JSON.stringify({
      fromBranchId: mainBranchId,
      toBranchId: toBranch.id,
      transferCode: "PHASE14F-TECH-BLOCKED",
      notes: "Technician blocked test",
      items: [
        {
          itemId: sourceItem.id,
          fromBatchId: sourceBatch.id,
          description: sourceItem.itemName,
          quantity: 1,
        },
      ],
    }),
  });

  assert(technicianTransferCreate.status === 403, "Technician still blocked from stock transfer create");

  const blockedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "STOCK_TRANSFER_CREATED",
      metadata: {
        path: ["transferCode"],
        equals: "PHASE14F-TECH-BLOCKED",
      },
    },
  });

  assert(!blockedAuditLog, "Blocked stock transfer action did not create audit log");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14 MODULE 14F STOCK TRANSFER AUDIT HOOKS TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14 MODULE 14F STOCK TRANSFER AUDIT HOOKS TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
