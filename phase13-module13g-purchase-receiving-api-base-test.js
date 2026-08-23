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
  console.log("\\nPHASE 13 MODULE 13G: Purchase Receiving API Base Test");
  console.log("----------------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.purchaseReceiving.deleteMany({
    where: {
      branchId,
      receivingCode: {
        startsWith: "RECTEST-13G-",
      },
    },
  });

  await prisma.purchaseOrder.deleteMany({
    where: {
      branchId,
      poCode: {
        startsWith: "RECTEST-13G-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "RECTEST-13G-",
      },
    },
  });

  assert(true, "Previous 13G receiving API test data cleared");

  const branchSupplier = await prisma.supplier.create({
    data: {
      supplierCode: "RECTEST-13G-BRANCH-SUPPLIER",
      name: "13G Branch Receiving Supplier",
      contactPerson: "13G Branch Contact",
      contactNo: "09170001370",
      email: "branch13g@supplier.test",
      status: "ACTIVE",
      branchId,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const globalSupplier = await prisma.supplier.create({
    data: {
      supplierCode: "RECTEST-13G-GLOBAL-SUPPLIER",
      name: "13G Global Receiving Supplier",
      contactPerson: "13G Global Contact",
      contactNo: "09170001371",
      email: "global13g@supplier.test",
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

  const po = await prisma.purchaseOrder.create({
    data: {
      poCode: "RECTEST-13G-PO-0001",
      status: "ORDERED",
      supplierNameSnapshot: branchSupplier.name,
      supplierContactSnapshot: branchSupplier.contactNo,
      subtotal: 2000,
      totalDiscount: 0,
      grandTotal: 2000,
      orderedAt: new Date(),
      branchId,
      supplierId: branchSupplier.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      orderedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: item.itemName,
            quantity: 2,
            receivedQuantity: 0,
            unitCost: 1000,
            discountAmount: 0,
            lineTotal: 2000,
            itemId: item.id,
          },
        ],
      },
    },
    include: {
      items: true,
    },
  });

  assert(Boolean(po.id), "Ordered PO test data ready");
  assert(po.items.length === 1, "Ordered PO item test data ready");

  const poItem = po.items[0];

  const missingTokenList = await request("/purchase-receivings");
  assert(missingTokenList.status === 401, "List purchase receivings blocks missing token");

  const technicianList = await request("/purchase-receivings", {
    token: technicianLogin.token,
  });

  assert(technicianList.status === 403, "Technician cannot list purchase receivings");

  const missingSupplier = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 100,
        },
      ],
    }),
  });

  assert(missingSupplier.status === 400, "Create receiving validates missing supplier");

  const missingItems = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      supplierId: branchSupplier.id,
      items: [],
    }),
  });

  assert(missingItems.status === 400, "Create receiving validates missing items");

  const adminCreate = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECTEST-13G-BRANCH",
      supplierId: branchSupplier.id,
      purchaseOrderId: po.id,
      supplierDeliveryNo: "DR-13G-001",
      supplierInvoiceNo: "INV-13G-001",
      referenceNo: "REF-13G-001",
      notes: "13G receiving API test",
      internalNotes: "Internal 13G receiving note",
      items: [
        {
          itemId: item.id,
          purchaseOrderItemId: poItem.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 1000,
          discountAmount: 100,
          batchCode: "BATCH-13G-001",
        },
      ],
    }),
  });

  if (adminCreate.status !== 201) {
    console.dir(adminCreate.body, { depth: null });
  }

  assert(adminCreate.status === 201, "Admin can create branch receiving");
  assert(adminCreate.body.data.receivingCode === "RECTEST-13G-BRANCH", "Receiving code saved uppercase");
  assert(adminCreate.body.data.status === "DRAFT", "Receiving starts as DRAFT");
  assert(adminCreate.body.data.branch.id === branchId, "Receiving linked to admin branch");
  assert(adminCreate.body.data.supplier.id === branchSupplier.id, "Receiving linked to supplier");
  assert(adminCreate.body.data.purchaseOrder.id === po.id, "Receiving linked to PO");
  assert(Number(adminCreate.body.data.subtotal) === 1000, "Receiving subtotal computed");
  assert(Number(adminCreate.body.data.totalDiscount) === 100, "Receiving discount computed");
  assert(Number(adminCreate.body.data.grandTotal) === 900, "Receiving grand total computed");
  assert(adminCreate.body.data.items.length === 1, "Receiving item created");
  assert(adminCreate.body.data.items[0].item.id === item.id, "Receiving item linked to item");
  assert(adminCreate.body.data.items[0].purchaseOrderItem.id === poItem.id, "Receiving item linked to PO item");

  const duplicate = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECTEST-13G-BRANCH",
      supplierId: branchSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 100,
        },
      ],
    }),
  });

  assert(duplicate.status === 409, "Duplicate receiving code is blocked in same branch");

  const invalidDiscount = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECTEST-13G-BAD-DISCOUNT",
      supplierId: branchSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 100,
          discountAmount: 101,
        },
      ],
    }),
  });

  assert(invalidDiscount.status === 400, "Line discount greater than subtotal is blocked");

  const exceedPoQty = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECTEST-13G-EXCEED",
      supplierId: branchSupplier.id,
      purchaseOrderId: po.id,
      items: [
        {
          itemId: item.id,
          purchaseOrderItemId: poItem.id,
          description: item.itemName,
          quantityReceived: 3,
          unitCost: 1000,
        },
      ],
    }),
  });

  assert(exceedPoQty.status === 400, "Receiving quantity over PO remaining is blocked");

  const adminGlobalCreate = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECTEST-13G-GLOBAL-SUPPLIER",
      supplierId: globalSupplier.id,
      supplierDeliveryNo: "DR-13G-GLOBAL",
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 500,
        },
      ],
    }),
  });

  assert(adminGlobalCreate.status === 201, "Admin can create receiving using global supplier");
  assert(adminGlobalCreate.body.data.supplier.id === globalSupplier.id, "Global supplier linked to receiving");

  const superMissingBranch = await request("/purchase-receivings", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      supplierId: globalSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 100,
        },
      ],
    }),
  });

  assert(superMissingBranch.status === 400, "Super Owner must provide branchId");

  const superCreate = await request("/purchase-receivings", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId,
      receivingCode: "RECTEST-13G-SUPER",
      supplierId: globalSupplier.id,
      items: [
        {
          itemId: item.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 700,
        },
      ],
    }),
  });

  assert(superCreate.status === 201, "Super Owner can create receiving with branchId");
  assert(superCreate.body.data.branch.id === branchId, "Super Owner receiving linked to selected branch");

  const listAdmin = await request("/purchase-receivings", {
    token: adminLogin.token,
  });

  assert(listAdmin.status === 200, "Admin can list purchase receivings");
  assert(Array.isArray(listAdmin.body.data.items), "Receiving list returns items array");
  assert(
    listAdmin.body.data.items.some((receiving) => receiving.id === adminCreate.body.data.id),
    "Receiving list includes created receiving"
  );

  const searchList = await request("/purchase-receivings?search=RECTEST-13G-BRANCH", {
    token: adminLogin.token,
  });

  assert(searchList.status === 200, "Receiving search works");
  assert(
    searchList.body.data.items.some((receiving) => receiving.id === adminCreate.body.data.id),
    "Receiving search finds created receiving"
  );

  const statusList = await request("/purchase-receivings?status=DRAFT", {
    token: adminLogin.token,
  });

  assert(statusList.status === 200, "Receiving status filter works");
  assert(statusList.body.data.items.every((receiving) => receiving.status === "DRAFT"), "Receiving status filter returns DRAFT only");

  const pageList = await request("/purchase-receivings?page=1&limit=1", {
    token: adminLogin.token,
  });

  assert(pageList.status === 200, "Receiving pagination works");
  assert(pageList.body.data.items.length <= 1, "Receiving pagination limit respected");

  const viewOne = await request(`/purchase-receivings/${adminCreate.body.data.id}`, {
    token: adminLogin.token,
  });

  assert(viewOne.status === 200, "Admin can view receiving");
  assert(viewOne.body.data.id === adminCreate.body.data.id, "View returns correct receiving");

  const updateDraft = await request(`/purchase-receivings/${adminCreate.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "13G updated receiving notes",
      supplierInvoiceNo: "INV-13G-UPDATED",
      items: [
        {
          itemId: item.id,
          purchaseOrderItemId: poItem.id,
          description: item.itemName + " Updated",
          quantityReceived: 2,
          unitCost: 600,
          discountAmount: 0,
          batchCode: "BATCH-13G-UPDATED",
        },
      ],
    }),
  });

  if (updateDraft.status !== 200) {
    console.dir(updateDraft.body, { depth: null });
  }

  assert(updateDraft.status === 200, "Admin can update draft receiving");
  assert(updateDraft.body.data.notes === "13G updated receiving notes", "Receiving notes updated");
  assert(updateDraft.body.data.supplierInvoiceNo === "INV-13G-UPDATED", "Receiving invoice updated");
  assert(updateDraft.body.data.items.length === 1, "Receiving items replaced on update");
  assert(Number(updateDraft.body.data.grandTotal) === 1200, "Updated receiving grand total recomputed");

  const postStatus = await request(`/purchase-receivings/${adminCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  assert(postStatus.status === 400, "POSTED status is blocked until stock-in module");

  const cancelWithoutReason = await request(`/purchase-receivings/${adminGlobalCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
    }),
  });

  assert(cancelWithoutReason.status === 400, "Cancel receiving requires reason");

  const cancelStatus = await request(`/purchase-receivings/${adminGlobalCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "CANCELLED",
      cancellationReason: "13G API cancel test",
    }),
  });

  assert(cancelStatus.status === 200, "Admin can cancel DRAFT receiving");
  assert(cancelStatus.body.data.status === "CANCELLED", "Receiving status updated to CANCELLED");
  assert(Boolean(cancelStatus.body.data.cancelledAt), "Receiving cancelledAt saved");
  assert(cancelStatus.body.data.cancelledBy.id === adminLogin.user.id, "Receiving cancelledBy saved");

  const updateCancelled = await request(`/purchase-receivings/${adminGlobalCreate.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Should not update cancelled receiving",
    }),
  });

  assert(updateCancelled.status === 400, "Cancelled receiving cannot be updated");

  const missingReceiving = await request("/purchase-receivings/not-existing-receiving-id", {
    token: adminLogin.token,
  });

  assert(missingReceiving.status === 404, "Missing receiving view returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\\nPHASE 13 MODULE 13G PURCHASE RECEIVING API BASE TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\\nPHASE 13 MODULE 13G PURCHASE RECEIVING API BASE TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
