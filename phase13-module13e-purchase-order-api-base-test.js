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
  console.log("\nPHASE 13 MODULE 13E: Purchase Order API Base Test");
  console.log("------------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.purchaseOrder.deleteMany({
    where: {
      branchId,
      poCode: {
        startsWith: "POTEST-13E-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "POTEST-13E-",
      },
    },
  });

  assert(true, "Previous 13E purchase order API test data cleared");

  const branchSupplier = await prisma.supplier.create({
    data: {
      supplierCode: "POTEST-13E-BRANCH-SUPPLIER",
      name: "13E Branch PO Supplier",
      contactPerson: "13E Branch Contact",
      contactNo: "09170001350",
      email: "branch13e@supplier.test",
      status: "ACTIVE",
      branchId,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const globalSupplier = await prisma.supplier.create({
    data: {
      supplierCode: "POTEST-13E-GLOBAL-SUPPLIER",
      name: "13E Global PO Supplier",
      contactPerson: "13E Global Contact",
      contactNo: "09170001351",
      email: "global13e@supplier.test",
      status: "ACTIVE",
      createdById: superLogin.user.id,
      updatedById: superLogin.user.id,
    },
  });

  assert(Boolean(branchSupplier.id), "Branch supplier test data ready");
  assert(Boolean(globalSupplier.id), "Global supplier test data ready");

  const item = await prisma.item.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(item), "Active branch item found");

  const missingTokenList = await request("/purchase-orders");
  assert(missingTokenList.status === 401, "List purchase orders blocks missing token");

  const technicianList = await request("/purchase-orders", {
    token: technicianLogin.token,
  });

  assert(technicianList.status === 403, "Technician cannot list purchase orders");

  const missingSupplier = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 1,
          unitCost: 100,
        },
      ],
    }),
  });

  assert(missingSupplier.status === 400, "Create purchase order validates missing supplier");

  const missingItems = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      supplierId: branchSupplier.id,
      items: [],
    }),
  });

  assert(missingItems.status === 400, "Create purchase order validates missing items");

  const adminCreate = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      poCode: "POTEST-13E-BRANCH",
      supplierId: branchSupplier.id,
      notes: "13E branch PO API test",
      internalNotes: "Internal 13E branch PO note",
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 2,
          unitCost: 1000,
          discountAmount: 100,
        },
      ],
    }),
  });

  if (adminCreate.status !== 201) {
    console.dir(adminCreate.body, { depth: null });
  }

  assert(adminCreate.status === 201, "Admin can create branch purchase order");
  assert(adminCreate.body.data.poCode === "POTEST-13E-BRANCH", "PO code saved uppercase");
  assert(adminCreate.body.data.status === "DRAFT", "PO starts as DRAFT");
  assert(adminCreate.body.data.branch.id === branchId, "PO linked to admin branch");
  assert(adminCreate.body.data.supplier.id === branchSupplier.id, "PO linked to supplier");
  assert(Number(adminCreate.body.data.subtotal) === 2000, "PO subtotal computed");
  assert(Number(adminCreate.body.data.totalDiscount) === 100, "PO total discount computed");
  assert(Number(adminCreate.body.data.grandTotal) === 1900, "PO grand total computed");
  assert(adminCreate.body.data.items.length === 1, "PO item created");
  assert(adminCreate.body.data.items[0].item.id === item.id, "PO item linked to item");

  const duplicate = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      poCode: "POTEST-13E-BRANCH",
      supplierId: branchSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 1,
          unitCost: 100,
        },
      ],
    }),
  });

  assert(duplicate.status === 409, "Duplicate PO code is blocked in same branch");

  const invalidDiscount = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      poCode: "POTEST-13E-BAD-DISCOUNT",
      supplierId: branchSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 1,
          unitCost: 100,
          discountAmount: 101,
        },
      ],
    }),
  });

  assert(invalidDiscount.status === 400, "Line discount greater than subtotal is blocked");

  const adminGlobalCreate = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      poCode: "POTEST-13E-GLOBAL-SUPPLIER",
      supplierId: globalSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 1,
          unitCost: 500,
        },
      ],
    }),
  });

  assert(adminGlobalCreate.status === 201, "Admin can create PO using global supplier");
  assert(adminGlobalCreate.body.data.supplier.id === globalSupplier.id, "Global supplier linked to PO");

  const superMissingBranch = await request("/purchase-orders", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      supplierId: globalSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 1,
          unitCost: 100,
        },
      ],
    }),
  });

  assert(superMissingBranch.status === 400, "Super Owner must provide branchId");

  const superCreate = await request("/purchase-orders", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId,
      poCode: "POTEST-13E-SUPER",
      supplierId: globalSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantity: 1,
          unitCost: 700,
        },
      ],
    }),
  });

  assert(superCreate.status === 201, "Super Owner can create PO with branchId");
  assert(superCreate.body.data.branch.id === branchId, "Super Owner PO linked to selected branch");

  const listAdmin = await request("/purchase-orders", {
    token: adminLogin.token,
  });

  assert(listAdmin.status === 200, "Admin can list purchase orders");
  assert(Array.isArray(listAdmin.body.data.items), "PO list returns items array");
  assert(
    listAdmin.body.data.items.some((purchaseOrder) => purchaseOrder.id === adminCreate.body.data.id),
    "PO list includes created PO"
  );

  const searchList = await request("/purchase-orders?search=POTEST-13E-BRANCH", {
    token: adminLogin.token,
  });

  assert(searchList.status === 200, "PO search works");
  assert(
    searchList.body.data.items.some((purchaseOrder) => purchaseOrder.id === adminCreate.body.data.id),
    "PO search finds created PO"
  );

  const statusList = await request("/purchase-orders?status=DRAFT", {
    token: adminLogin.token,
  });

  assert(statusList.status === 200, "PO status filter works");
  assert(statusList.body.data.items.every((purchaseOrder) => purchaseOrder.status === "DRAFT"), "PO status filter returns DRAFT only");

  const pageList = await request("/purchase-orders?page=1&limit=1", {
    token: adminLogin.token,
  });

  assert(pageList.status === 200, "PO pagination works");
  assert(pageList.body.data.items.length <= 1, "PO pagination limit respected");

  const viewOne = await request(`/purchase-orders/${adminCreate.body.data.id}`, {
    token: adminLogin.token,
  });

  assert(viewOne.status === 200, "Admin can view PO");
  assert(viewOne.body.data.id === adminCreate.body.data.id, "View returns correct PO");

  const updateDraft = await request(`/purchase-orders/${adminCreate.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "13E updated PO notes",
      items: [
        {
          itemId: item.id,
          description: item.itemName + " Updated",
          quantity: 3,
          unitCost: 600,
          discountAmount: 0,
        },
      ],
    }),
  });

  if (updateDraft.status !== 200) {
    console.dir(updateDraft.body, { depth: null });
  }

  assert(updateDraft.status === 200, "Admin can update draft PO");
  assert(updateDraft.body.data.notes === "13E updated PO notes", "PO notes updated");
  assert(updateDraft.body.data.items.length === 1, "PO items replaced on update");
  assert(Number(updateDraft.body.data.grandTotal) === 1800, "Updated PO grand total recomputed");

  const orderStatus = await request(`/purchase-orders/${adminCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "ORDERED",
    }),
  });

  assert(orderStatus.status === 200, "Admin can update PO status to ORDERED");
  assert(orderStatus.body.data.status === "ORDERED", "PO status updated to ORDERED");
  assert(Boolean(orderStatus.body.data.orderedAt), "PO orderedAt saved");
  assert(orderStatus.body.data.orderedBy.id === adminLogin.user.id, "PO orderedBy saved");

  const updateOrdered = await request(`/purchase-orders/${adminCreate.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Should not update ordered PO",
    }),
  });

  assert(updateOrdered.status === 400, "Ordered PO cannot be updated");

  const cancelWithoutReason = await request(`/purchase-orders/${adminGlobalCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
    }),
  });

  assert(cancelWithoutReason.status === 400, "Cancel PO requires reason");

  const cancelStatus = await request(`/purchase-orders/${adminGlobalCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      cancellationReason: "13E API cancel test",
    }),
  });

  assert(cancelStatus.status === 200, "Admin can cancel DRAFT PO");
  assert(cancelStatus.body.data.status === "CANCELLED", "PO status updated to CANCELLED");
  assert(Boolean(cancelStatus.body.data.cancelledAt), "PO cancelledAt saved");
  assert(cancelStatus.body.data.cancelledBy.id === adminLogin.user.id, "PO cancelledBy saved");

  const invalidStatus = await request(`/purchase-orders/${superCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "RECEIVED",
    }),
  });

  assert(invalidStatus.status === 400, "Invalid manual PO status is blocked");

  const missingPo = await request("/purchase-orders/not-existing-po-id", {
    token: adminLogin.token,
  });

  assert(missingPo.status === 404, "Missing PO view returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 13 MODULE 13E PURCHASE ORDER API BASE TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13E PURCHASE ORDER API BASE TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
