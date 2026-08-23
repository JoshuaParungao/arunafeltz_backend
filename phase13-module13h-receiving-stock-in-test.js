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
  console.log("\nPHASE 13 MODULE 13H: Receiving Stock-In Logic Test");
  console.log("-------------------------------------------------");

  const adminLogin = await login(users.admin);
  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.purchaseReceiving.deleteMany({
    where: {
      branchId,
      receivingCode: {
        startsWith: "RECSTOCK-13H-",
      },
    },
  });

  await prisma.purchaseOrder.deleteMany({
    where: {
      branchId,
      poCode: {
        startsWith: "RECSTOCK-13H-",
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      branchId,
      referenceNo: {
        startsWith: "RECSTOCK-13H-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      branchId,
      batchCode: {
        startsWith: "RECSTOCK-13H-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "RECSTOCK-13H-",
      },
    },
  });

  assert(true, "Previous 13H stock-in test data cleared");

  const category = await prisma.itemCategory.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(category), "Active item category found for test item");

  const unit = await prisma.unit.findFirst({
    where: {
      status: "ACTIVE",
    },
  });

  assert(Boolean(unit), "Active unit found for test item");

  const item = await prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId,
        itemCode: "RECSTOCK-13H-ITEM",
      },
    },
    update: {
      itemName: "13H Non-Serialized Stock Test Item",
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
      branchId,
      itemCode: "RECSTOCK-13H-ITEM",
      itemName: "13H Non-Serialized Stock Test Item",
      description: "Temporary test item for Phase 13H receiving stock-in",
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

  assert(Boolean(item.id), "Active non-serialized test item ready");

  const supplier = await prisma.supplier.create({
    data: {
      supplierCode: "RECSTOCK-13H-SUPPLIER",
      name: "13H Stock-In Supplier",
      contactPerson: "13H Stock Contact",
      contactNo: "09170001380",
      email: "stock13h@supplier.test",
      status: "ACTIVE",
      branchId,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(supplier.id), "Supplier test data ready");

  const po = await prisma.purchaseOrder.create({
    data: {
      poCode: "RECSTOCK-13H-PO-0001",
      status: "ORDERED",
      supplierNameSnapshot: supplier.name,
      supplierContactSnapshot: supplier.contactNo,
      subtotal: 5000,
      totalDiscount: 0,
      grandTotal: 5000,
      orderedAt: new Date(),
      branchId,
      supplierId: supplier.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      orderedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: item.itemName,
            quantity: 5,
            receivedQuantity: 0,
            unitCost: 1000,
            discountAmount: 0,
            lineTotal: 5000,
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

  const firstReceiving = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSTOCK-13H-0001",
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      supplierDeliveryNo: "RECSTOCK-13H-DR-0001",
      supplierInvoiceNo: "RECSTOCK-13H-INV-0001",
      referenceNo: "RECSTOCK-13H-REF-0001",
      notes: "13H first receiving stock-in test",
      items: [
        {
          itemId: item.id,
          purchaseOrderItemId: poItem.id,
          description: item.itemName,
          quantityReceived: 2,
          unitCost: 1000,
          discountAmount: 0,
          batchCode: "RECSTOCK-13H-BATCH-0001",
        },
      ],
    }),
  });

  if (firstReceiving.status !== 201) {
    console.dir(firstReceiving.body, { depth: null });
  }

  assert(firstReceiving.status === 201, "First draft receiving created");

  const postFirst = await request(`/purchase-receivings/${firstReceiving.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  if (postFirst.status !== 200) {
    console.dir(postFirst.body, { depth: null });
  }

  assert(postFirst.status === 200, "First receiving can be posted");
  assert(postFirst.body.data.status === "POSTED", "First receiving status is POSTED");
  assert(Boolean(postFirst.body.data.postedAt), "First receiving postedAt saved");
  assert(postFirst.body.data.postedBy.id === adminLogin.user.id, "First receiving postedBy saved");

  const batch1 = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId,
        batchCode: "RECSTOCK-13H-BATCH-0001",
      },
    },
  });

  assert(Boolean(batch1), "Inventory batch created from first receiving");
  assert(Number(batch1.quantityIn) === 2, "Batch quantityIn increased to 2");
  assert(Number(batch1.quantityAvailable) === 2, "Batch quantityAvailable increased to 2");
  assert(batch1.supplierName === supplier.name, "Batch supplier snapshot saved");
  assert(batch1.referenceNo === "RECSTOCK-13H-INV-0001", "Batch reference number saved");

  const movement1 = await prisma.inventoryMovement.findFirst({
    where: {
      branchId,
      batchId: batch1.id,
      type: "STOCK_IN",
      source: "PURCHASE",
      referenceNo: "RECSTOCK-13H-INV-0001",
    },
  });

  assert(Boolean(movement1), "Purchase inventory movement created");
  assert(Number(movement1.quantity) === 2, "Movement quantity saved");
  assert(Number(movement1.previousQuantity) === 0, "Movement previousQuantity saved");
  assert(Number(movement1.newQuantity) === 2, "Movement newQuantity saved");

  const poItemAfterFirst = await prisma.purchaseOrderItem.findUnique({
    where: {
      id: poItem.id,
    },
  });

  assert(Number(poItemAfterFirst.receivedQuantity) === 2, "PO item receivedQuantity updated to 2");

  const poAfterFirst = await prisma.purchaseOrder.findUnique({
    where: {
      id: po.id,
    },
  });

  assert(poAfterFirst.status === "PARTIALLY_RECEIVED", "PO status updated to PARTIALLY_RECEIVED");

  const updatePosted = await request(`/purchase-receivings/${firstReceiving.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      notes: "Should not update posted receiving",
    }),
  });

  assert(updatePosted.status === 400, "Posted receiving cannot be updated");

  const secondReceiving = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSTOCK-13H-0002",
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      supplierDeliveryNo: "RECSTOCK-13H-DR-0002",
      supplierInvoiceNo: "RECSTOCK-13H-INV-0002",
      referenceNo: "RECSTOCK-13H-REF-0002",
      notes: "13H second receiving stock-in test",
      items: [
        {
          itemId: item.id,
          purchaseOrderItemId: poItem.id,
          description: item.itemName,
          quantityReceived: 3,
          unitCost: 1000,
          discountAmount: 0,
          batchCode: "RECSTOCK-13H-BATCH-0002",
        },
      ],
    }),
  });

  if (secondReceiving.status !== 201) {
    console.dir(secondReceiving.body, { depth: null });
  }

  assert(secondReceiving.status === 201, "Second draft receiving created");

  const postSecond = await request(`/purchase-receivings/${secondReceiving.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  if (postSecond.status !== 200) {
    console.dir(postSecond.body, { depth: null });
  }

  assert(postSecond.status === 200, "Second receiving can be posted");
  assert(postSecond.body.data.status === "POSTED", "Second receiving status is POSTED");

  const poItemAfterSecond = await prisma.purchaseOrderItem.findUnique({
    where: {
      id: poItem.id,
    },
  });

  assert(Number(poItemAfterSecond.receivedQuantity) === 5, "PO item receivedQuantity updated to full quantity");

  const poAfterSecond = await prisma.purchaseOrder.findUnique({
    where: {
      id: po.id,
    },
  });

  assert(poAfterSecond.status === "RECEIVED", "PO status updated to RECEIVED");
  assert(Boolean(poAfterSecond.receivedAt), "PO receivedAt saved");

  const excessReceiving = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSTOCK-13H-EXCESS",
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      items: [
        {
          itemId: item.id,
          purchaseOrderItemId: poItem.id,
          description: item.itemName,
          quantityReceived: 1,
          unitCost: 1000,
          batchCode: "RECSTOCK-13H-BATCH-EXCESS",
        },
      ],
    }),
  });

  assert(excessReceiving.status === 400, "Cannot create receiving over fully received PO");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 13 MODULE 13H RECEIVING STOCK-IN LOGIC TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13H RECEIVING STOCK-IN LOGIC TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
