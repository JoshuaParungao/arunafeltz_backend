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
  console.log("\nPHASE 14 MODULE 14D: Purchase Order Audit Hooks Test");
  console.log("----------------------------------------------------");

  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const mainBranchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(mainBranchId), "MAIN branch detected");

  await prisma.auditLog.deleteMany({
    where: {
      action: {
        in: [
          "PURCHASE_ORDER_CREATED",
          "PURCHASE_ORDER_UPDATED",
          "PURCHASE_ORDER_ORDERED",
          "PURCHASE_ORDER_CANCELLED",
        ],
      },
    },
  });

  await prisma.purchaseReceiving.deleteMany({
    where: {
      receivingCode: {
        startsWith: "PHASE14D-",
      },
    },
  });

  await prisma.purchaseOrder.deleteMany({
    where: {
      poCode: {
        startsWith: "PHASE14D-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "PHASE14D-",
      },
    },
  });

  await prisma.item.deleteMany({
    where: {
      itemCode: {
        startsWith: "PHASE14D-",
      },
    },
  });

  assert(true, "Previous 14D PO/audit test data cleared");

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
      supplierCode: "PHASE14D-SUPPLIER",
      name: "Phase 14D Supplier",
      contactPerson: "PO Audit Tester",
      contactNo: "09171400004",
      email: "phase14d@supplier.test",
      address: "Phase 14D Address",
      tin: "PHASE14D-TIN",
      notes: "Temporary supplier for Phase 14D",
      status: "ACTIVE",
      branchId: mainBranchId,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const item = await prisma.item.create({
    data: {
      branchId: mainBranchId,
      itemCode: "PHASE14D-ITEM",
      itemName: "Phase 14D Item",
      description: "Temporary item for PO audit test",
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

  const createPO = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      poCode: "PHASE14D-PO-0001",
      supplierId: supplier.id,
      notes: "Phase 14D create audit",
      internalNotes: "Internal create audit",
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 3,
          unitCost: 1000,
        },
      ],
    }),
  });

  if (createPO.status !== 201) {
    console.dir(createPO.body, { depth: null });
  }

  assert(createPO.status === 201, "Purchase order created through API");
  assert(createPO.body.data.poCode === "PHASE14D-PO-0001", "PO code saved");

  const poId = createPO.body.data.id;

  const createdAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_ORDER_CREATED",
      entityType: "PurchaseOrder",
      entityId: poId,
    },
  });

  assert(Boolean(createdAuditLog), "PURCHASE_ORDER_CREATED audit log created");
  assert(createdAuditLog.actorId === adminLogin.user.id, "Create audit actorId saved");
  assert(createdAuditLog.branchId === mainBranchId, "Create audit branchId saved");
  assert(createdAuditLog.metadata.poCode === "PHASE14D-PO-0001", "Create audit poCode metadata saved");
  assert(createdAuditLog.metadata.itemCount === 1, "Create audit itemCount metadata saved");

  const updatePO = await request(`/purchase-orders/${poId}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Phase 14D updated notes",
      internalNotes: "Phase 14D updated internal notes",
    }),
  });

  if (updatePO.status !== 200) {
    console.dir(updatePO.body, { depth: null });
  }

  assert(updatePO.status === 200, "Purchase order updated through API");
  assert(updatePO.body.data.notes === "Phase 14D updated notes", "PO notes update saved");

  const updatedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_ORDER_UPDATED",
      entityType: "PurchaseOrder",
      entityId: poId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(updatedAuditLog), "PURCHASE_ORDER_UPDATED audit log created");
  assert(updatedAuditLog.actorId === adminLogin.user.id, "Update audit actorId saved");
  assert(updatedAuditLog.branchId === mainBranchId, "Update audit branchId saved");
  assert(Array.isArray(updatedAuditLog.metadata.changedFields), "Update audit changedFields saved");
  assert(updatedAuditLog.metadata.changedFields.includes("notes"), "Update audit tracks notes field");
  assert(updatedAuditLog.metadata.previous.notes === "Phase 14D create audit", "Update audit previous notes saved");
  assert(updatedAuditLog.metadata.current.notes === "Phase 14D updated notes", "Update audit current notes saved");

  const orderPO = await request(`/purchase-orders/${poId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "ORDERED",
    }),
  });

  if (orderPO.status !== 200) {
    console.dir(orderPO.body, { depth: null });
  }

  assert(orderPO.status === 200, "Purchase order ordered through API");
  assert(orderPO.body.data.status === "ORDERED", "PO status saved as ORDERED");

  const orderedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_ORDER_ORDERED",
      entityType: "PurchaseOrder",
      entityId: poId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(orderedAuditLog), "PURCHASE_ORDER_ORDERED audit log created");
  assert(orderedAuditLog.actorId === adminLogin.user.id, "Ordered audit actorId saved");
  assert(orderedAuditLog.branchId === mainBranchId, "Ordered audit branchId saved");
  assert(orderedAuditLog.metadata.previousStatus === "DRAFT", "Ordered audit previousStatus saved");
  assert(orderedAuditLog.metadata.currentStatus === "ORDERED", "Ordered audit currentStatus saved");

  const createCancelPO = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      poCode: "PHASE14D-PO-CANCEL-0001",
      supplierId: supplier.id,
      notes: "Phase 14D cancel audit",
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 2,
          unitCost: 1000,
        },
      ],
    }),
  });

  if (createCancelPO.status !== 201) {
    console.dir(createCancelPO.body, { depth: null });
  }

  assert(createCancelPO.status === 201, "Second PO created for cancellation test");

  const cancelPO = await request(`/purchase-orders/${createCancelPO.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      cancellationReason: "Phase 14D cancellation audit test",
    }),
  });

  if (cancelPO.status !== 200) {
    console.dir(cancelPO.body, { depth: null });
  }

  assert(cancelPO.status === 200, "Purchase order cancelled through API");
  assert(cancelPO.body.data.status === "CANCELLED", "PO status saved as CANCELLED");

  const cancelledAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_ORDER_CANCELLED",
      entityType: "PurchaseOrder",
      entityId: createCancelPO.body.data.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(cancelledAuditLog), "PURCHASE_ORDER_CANCELLED audit log created");
  assert(cancelledAuditLog.actorId === adminLogin.user.id, "Cancelled audit actorId saved");
  assert(cancelledAuditLog.branchId === mainBranchId, "Cancelled audit branchId saved");
  assert(cancelledAuditLog.metadata.previousStatus === "DRAFT", "Cancelled audit previousStatus saved");
  assert(cancelledAuditLog.metadata.currentStatus === "CANCELLED", "Cancelled audit currentStatus saved");
  assert(
    cancelledAuditLog.metadata.cancellationReason === "Phase 14D cancellation audit test",
    "Cancelled audit cancellationReason saved"
  );

  const auditList = await request("/audit-logs?search=PHASE14D-PO&page=1&limit=20", {
    token: adminLogin.token,
  });

  if (auditList.status !== 200) {
    console.dir(auditList.body, { depth: null });
  }

  assert(auditList.status === 200, "Audit logs API can search PO audit logs");
  assert(
    auditList.body.data.some((log) => log.action === "PURCHASE_ORDER_CREATED"),
    "Audit logs API returns PO created log"
  );
  assert(
    auditList.body.data.some((log) => log.action === "PURCHASE_ORDER_UPDATED"),
    "Audit logs API returns PO updated log"
  );
  assert(
    auditList.body.data.some((log) => log.action === "PURCHASE_ORDER_ORDERED"),
    "Audit logs API returns PO ordered log"
  );
  assert(
    auditList.body.data.some((log) => log.action === "PURCHASE_ORDER_CANCELLED"),
    "Audit logs API returns PO cancelled log"
  );

  const technicianPOCreate = await request("/purchase-orders", {
    method: "POST",
    token: technicianLogin.token,
    body: JSON.stringify({
      poCode: "PHASE14D-TECH-BLOCKED",
      supplierId: supplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 1,
          unitCost: 1000,
        },
      ],
    }),
  });

  assert(technicianPOCreate.status === 403, "Technician still blocked from PO create");

  const blockedAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "PURCHASE_ORDER_CREATED",
      metadata: {
        path: ["poCode"],
        equals: "PHASE14D-TECH-BLOCKED",
      },
    },
  });

  assert(!blockedAuditLog, "Blocked PO action did not create PO audit log");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14 MODULE 14D PURCHASE ORDER AUDIT HOOKS TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14 MODULE 14D PURCHASE ORDER AUDIT HOOKS TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
