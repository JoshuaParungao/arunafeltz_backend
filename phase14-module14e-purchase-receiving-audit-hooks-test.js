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

const main = async () => {
  console.log("\nPHASE 14 MODULE 14E: Purchase Receiving Audit Hooks Test");
  console.log("--------------------------------------------------------");

  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const mainBranchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(mainBranchId), "MAIN branch detected");

  await prisma.auditLog.deleteMany({
    where: {
      action: {
        in: [
          "PURCHASE_RECEIVING_CREATED",
          "PURCHASE_RECEIVING_UPDATED",
          "PURCHASE_RECEIVING_POSTED",
          "PURCHASE_RECEIVING_CANCELLED",
        ],
      },
    },
  });

  await prisma.purchaseReceiving.deleteMany({
    where: {
      receivingCode: {
        startsWith: "PHASE14E-",
      },
    },
  });

  await prisma.purchaseOrder.deleteMany({
    where: {
      poCode: {
        startsWith: "PHASE14E-",
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      referenceNo: {
        startsWith: "PHASE14E-",
      },
    },
  });

  await prisma.itemSerial.deleteMany({
    where: {
      serialNumber: {
        startsWith: "PHASE14E-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      batchCode: {
        startsWith: "PHASE14E-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "PHASE14E-",
      },
    },
  });

  await prisma.item.deleteMany({
    where: {
      itemCode: {
        startsWith: "PHASE14E-",
      },
    },
  });

  assert(true, "Previous 14E receiving/audit test data cleared");

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

  assert(Boolean(category), "MAIN active category found");
  assert(Boolean(unit), "Active unit found");

  const supplier = await prisma.supplier.create({
    data: {
      supplierCode: "PHASE14E-SUPPLIER",
      name: "Phase 14E Supplier",
      contactPerson: "Receiving Audit Tester",
      contactNo: "09171400005",
      email: "phase14e@supplier.test",
      address: "Phase 14E Address",
      tin: "PHASE14E-TIN",
      notes: "Temporary supplier for Phase 14E",
      status: "ACTIVE",
      branchId: mainBranchId,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const item = await prisma.item.create({
    data: {
      branchId: mainBranchId,
      itemCode: "PHASE14E-ITEM",
      itemName: "Phase 14E Item",
      description: "Temporary item for receiving audit test",
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

  assert(Boolean(supplier.id), "Supplier ready");
  assert(Boolean(item.id), "Item ready");

  const createReceiving = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "PHASE14E-REC-0001",
      supplierId: supplier.id,
      supplierDeliveryNo: "PHASE14E-DR-0001",
      supplierInvoiceNo: "PHASE14E-INV-0001",
      referenceNo: "PHASE14E-REF-0001",
      notes: "Phase 14E create audit",
      internalNotes: "Internal create audit",
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 3,
          unitCost: 1000,
          batchCode: "PHASE14E-BATCH-0001",
        },
      ],
    }),
  });

  if (createReceiving.status !== 201) {
    console.dir(createReceiving.body, { depth: null });
  }

  assert(createReceiving.status === 201, "Purchase receiving created through API");
  assert(createReceiving.body.data.receivingCode === "PHASE14E-REC-0001", "Receiving code saved");

  const receivingId = createReceiving.body.data.id;

  const createdAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_RECEIVING_CREATED",
      entityType: "PurchaseReceiving",
      entityId: receivingId,
    },
  });

  assert(Boolean(createdAuditLog), "PURCHASE_RECEIVING_CREATED audit log created");
  assert(createdAuditLog.actorId === adminLogin.user.id, "Create audit actorId saved");
  assert(createdAuditLog.branchId === mainBranchId, "Create audit branchId saved");
  assert(createdAuditLog.metadata.receivingCode === "PHASE14E-REC-0001", "Create audit receivingCode metadata saved");
  assert(createdAuditLog.metadata.itemCount === 1, "Create audit itemCount metadata saved");

  const updateReceiving = await request(`/purchase-receivings/${receivingId}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Phase 14E updated notes",
      internalNotes: "Phase 14E updated internal notes",
      referenceNo: "PHASE14E-REF-UPDATED",
    }),
  });

  if (updateReceiving.status !== 200) {
    console.dir(updateReceiving.body, { depth: null });
  }

  assert(updateReceiving.status === 200, "Purchase receiving updated through API");
  assert(updateReceiving.body.data.notes === "Phase 14E updated notes", "Receiving notes update saved");

  const updatedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_RECEIVING_UPDATED",
      entityType: "PurchaseReceiving",
      entityId: receivingId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(updatedAuditLog), "PURCHASE_RECEIVING_UPDATED audit log created");
  assert(updatedAuditLog.actorId === adminLogin.user.id, "Update audit actorId saved");
  assert(updatedAuditLog.branchId === mainBranchId, "Update audit branchId saved");
  assert(Array.isArray(updatedAuditLog.metadata.changedFields), "Update audit changedFields saved");
  assert(updatedAuditLog.metadata.changedFields.includes("notes"), "Update audit tracks notes field");
  assert(updatedAuditLog.metadata.previous.notes === "Phase 14E create audit", "Update audit previous notes saved");
  assert(updatedAuditLog.metadata.current.notes === "Phase 14E updated notes", "Update audit current notes saved");

  const postReceiving = await request(`/purchase-receivings/${receivingId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  if (postReceiving.status !== 200) {
    console.dir(postReceiving.body, { depth: null });
  }

  assert(postReceiving.status === 200, "Purchase receiving posted through API");
  assert(postReceiving.body.data.status === "POSTED", "Receiving status saved as POSTED");

  const postedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_RECEIVING_POSTED",
      entityType: "PurchaseReceiving",
      entityId: receivingId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(postedAuditLog), "PURCHASE_RECEIVING_POSTED audit log created");
  assert(postedAuditLog.actorId === adminLogin.user.id, "Posted audit actorId saved");
  assert(postedAuditLog.branchId === mainBranchId, "Posted audit branchId saved");
  assert(postedAuditLog.metadata.previousStatus === "DRAFT", "Posted audit previousStatus saved");
  assert(postedAuditLog.metadata.currentStatus === "POSTED", "Posted audit currentStatus saved");
  assert(Boolean(postedAuditLog.metadata.postedAt), "Posted audit postedAt saved");

  const createCancelReceiving = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "PHASE14E-REC-CANCEL-0001",
      supplierId: supplier.id,
      supplierDeliveryNo: "PHASE14E-DR-CANCEL-0001",
      supplierInvoiceNo: "PHASE14E-INV-CANCEL-0001",
      referenceNo: "PHASE14E-REF-CANCEL-0001",
      notes: "Phase 14E cancel audit",
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 2,
          unitCost: 1000,
          batchCode: "PHASE14E-BATCH-CANCEL-0001",
        },
      ],
    }),
  });

  if (createCancelReceiving.status !== 201) {
    console.dir(createCancelReceiving.body, { depth: null });
  }

  assert(createCancelReceiving.status === 201, "Second receiving created for cancellation test");

  const cancelReceiving = await request(`/purchase-receivings/${createCancelReceiving.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      cancellationReason: "Phase 14E cancellation audit test",
    }),
  });

  if (cancelReceiving.status !== 200) {
    console.dir(cancelReceiving.body, { depth: null });
  }

  assert(cancelReceiving.status === 200, "Purchase receiving cancelled through API");
  assert(cancelReceiving.body.data.status === "CANCELLED", "Receiving status saved as CANCELLED");

  const cancelledAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_RECEIVING_CANCELLED",
      entityType: "PurchaseReceiving",
      entityId: createCancelReceiving.body.data.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(cancelledAuditLog), "PURCHASE_RECEIVING_CANCELLED audit log created");
  assert(cancelledAuditLog.actorId === adminLogin.user.id, "Cancelled audit actorId saved");
  assert(cancelledAuditLog.branchId === mainBranchId, "Cancelled audit branchId saved");
  assert(cancelledAuditLog.metadata.previousStatus === "DRAFT", "Cancelled audit previousStatus saved");
  assert(cancelledAuditLog.metadata.currentStatus === "CANCELLED", "Cancelled audit currentStatus saved");
  assert(
    cancelledAuditLog.metadata.cancellationReason === "Phase 14E cancellation audit test",
    "Cancelled audit cancellationReason saved"
  );

  const auditList = await request("/audit-logs?search=PHASE14E-REC&page=1&limit=20", {
    token: adminLogin.token,
  });

  if (auditList.status !== 200) {
    console.dir(auditList.body, { depth: null });
  }

  assert(auditList.status === 200, "Audit logs API can search receiving audit logs");
  assert(
    auditList.body.data.some((log) => log.action === "PURCHASE_RECEIVING_CREATED"),
    "Audit logs API returns receiving created log"
  );
  assert(
    auditList.body.data.some((log) => log.action === "PURCHASE_RECEIVING_UPDATED"),
    "Audit logs API returns receiving updated log"
  );
  assert(
    auditList.body.data.some((log) => log.action === "PURCHASE_RECEIVING_POSTED"),
    "Audit logs API returns receiving posted log"
  );
  assert(
    auditList.body.data.some((log) => log.action === "PURCHASE_RECEIVING_CANCELLED"),
    "Audit logs API returns receiving cancelled log"
  );

  const technicianReceivingCreate = await request("/purchase-receivings", {
    method: "POST",
    token: technicianLogin.token,
    body: JSON.stringify({
      receivingCode: "PHASE14E-TECH-BLOCKED",
      supplierId: supplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 1000,
          batchCode: "PHASE14E-TECH-BLOCKED-BATCH",
        },
      ],
    }),
  });

  assert(technicianReceivingCreate.status === 403, "Technician still blocked from receiving create");

  const blockedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_RECEIVING_CREATED",
      metadata: {
        path: ["receivingCode"],
        equals: "PHASE14E-TECH-BLOCKED",
      },
    },
  });

  assert(!blockedAuditLog, "Blocked receiving action did not create receiving audit log");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14 MODULE 14E PURCHASE RECEIVING AUDIT HOOKS TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14 MODULE 14E PURCHASE RECEIVING AUDIT HOOKS TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
