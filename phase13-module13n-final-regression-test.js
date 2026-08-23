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

const upsertTestItem = async ({
  branchId,
  categoryId,
  unitId,
  itemCode,
  itemName,
  isSerialized,
  userId,
}) => {
  return prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId,
        itemCode,
      },
    },
    update: {
      itemName,
      status: "ACTIVE",
      isSerialized,
      hasWarranty: isSerialized,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      categoryId,
      unitId,
      updatedById: userId,
    },
    create: {
      branchId,
      itemCode,
      itemName,
      description: "Temporary Phase 13 final regression item",
      status: "ACTIVE",
      isSerialized,
      hasWarranty: isSerialized,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      minimumStock: "0",
      reorderLevel: "0",
      categoryId,
      unitId,
      createdById: userId,
      updatedById: userId,
    },
  });
};

const main = async () => {
  console.log("\nPHASE 13 MODULE 13N: FINAL REGRESSION TEST");
  console.log("------------------------------------------");

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

  assert(Boolean(mainBranchId), "MAIN branch detected");
  assert(Boolean(mabBranch), "MAB branch detected");

  await prisma.stockTransfer.deleteMany({
    where: {
      transferCode: {
        startsWith: "FINAL13-",
      },
    },
  });

  await prisma.purchaseReceiving.deleteMany({
    where: {
      receivingCode: {
        startsWith: "FINAL13-",
      },
    },
  });

  await prisma.purchaseOrder.deleteMany({
    where: {
      poCode: {
        startsWith: "FINAL13-",
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      referenceNo: {
        startsWith: "FINAL13-",
      },
    },
  });

  await prisma.itemSerial.deleteMany({
    where: {
      serialNumber: {
        startsWith: "FINAL13-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      batchCode: {
        startsWith: "FINAL13-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "FINAL13-",
      },
    },
  });

  assert(true, "Previous Phase 13 final regression data cleared");

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

  const mainNormalItem = await upsertTestItem({
    branchId: mainBranchId,
    categoryId: mainCategory.id,
    unitId: unit.id,
    itemCode: "FINAL13-NORMAL-ITEM",
    itemName: "Final 13 Normal Item",
    isSerialized: false,
    userId: adminLogin.user.id,
  });

  const mabNormalItem = await upsertTestItem({
    branchId: mabBranch.id,
    categoryId: mabCategory.id,
    unitId: unit.id,
    itemCode: "FINAL13-NORMAL-ITEM",
    itemName: "Final 13 Normal Item",
    isSerialized: false,
    userId: adminLogin.user.id,
  });

  const mainSerializedItem = await upsertTestItem({
    branchId: mainBranchId,
    categoryId: mainCategory.id,
    unitId: unit.id,
    itemCode: "FINAL13-SERIAL-ITEM",
    itemName: "Final 13 Serialized Item",
    isSerialized: true,
    userId: adminLogin.user.id,
  });

  const mabSerializedItem = await upsertTestItem({
    branchId: mabBranch.id,
    categoryId: mabCategory.id,
    unitId: unit.id,
    itemCode: "FINAL13-SERIAL-ITEM",
    itemName: "Final 13 Serialized Item",
    isSerialized: true,
    userId: adminLogin.user.id,
  });

  assert(Boolean(mainNormalItem.id), "MAIN normal item ready");
  assert(Boolean(mabNormalItem.id), "MAB normal item ready");
  assert(Boolean(mainSerializedItem.id), "MAIN serialized item ready");
  assert(Boolean(mabSerializedItem.id), "MAB serialized item ready");

  const techSuppliers = await request("/suppliers", {
    token: technicianLogin.token,
  });

  assert(techSuppliers.status === 403, "Technician cannot view suppliers");

  const createSupplier = await request("/suppliers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      supplierCode: "FINAL13-SUPPLIER",
      name: "Final 13 Supplier",
      contactPerson: "Final Contact",
      contactNo: "09170001400",
      email: "final13@supplier.test",
      address: "Final 13 Address",
      tin: "FINAL13-TIN",
      notes: "Phase 13 final regression supplier",
    }),
  });

  if (createSupplier.status !== 201) {
    console.dir(createSupplier.body, { depth: null });
  }

  assert(createSupplier.status === 201, "Admin can create supplier");
  assert(createSupplier.body.data.supplierCode === "FINAL13-SUPPLIER", "Supplier code saved");

  const supplierId = createSupplier.body.data.id;

  const duplicateSupplier = await request("/suppliers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      supplierCode: "FINAL13-SUPPLIER",
      name: "Duplicate Final 13 Supplier",
    }),
  });

  assert(duplicateSupplier.status === 409, "Duplicate supplier code blocked");

  const createPO = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      poCode: "FINAL13-PO-0001",
      supplierId,
      notes: "Final 13 PO",
      items: [
        {
          itemId: mainNormalItem.id,
          description: mainNormalItem.itemName,
          quantity: 5,
          unitCost: 1000,
        },
      ],
    }),
  });

  if (createPO.status !== 201) {
    console.dir(createPO.body, { depth: null });
  }

  assert(createPO.status === 201, "Purchase order can be created");
  assert(createPO.body.data.status === "DRAFT", "PO starts as DRAFT");

  const orderPO = await request(`/purchase-orders/${createPO.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "ORDERED",
    }),
  });

  assert(orderPO.status === 200, "PO can be ordered");
  assert(orderPO.body.data.status === "ORDERED", "PO status is ORDERED");

  const poItemId = createPO.body.data.items[0].id;

  const createReceiving = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "FINAL13-REC-0001",
      supplierId,
      purchaseOrderId: createPO.body.data.id,
      supplierInvoiceNo: "FINAL13-INV-0001",
      referenceNo: "FINAL13-REC-REF-0001",
      items: [
        {
          itemId: mainNormalItem.id,
          purchaseOrderItemId: poItemId,
          description: mainNormalItem.itemName,
          quantityReceived: 5,
          unitCost: 1000,
          batchCode: "FINAL13-NORMAL-BATCH",
        },
      ],
    }),
  });

  if (createReceiving.status !== 201) {
    console.dir(createReceiving.body, { depth: null });
  }

  assert(createReceiving.status === 201, "Purchase receiving can be created");

  const postReceiving = await request(`/purchase-receivings/${createReceiving.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  if (postReceiving.status !== 200) {
    console.dir(postReceiving.body, { depth: null });
  }

  assert(postReceiving.status === 200, "Purchase receiving can be posted");
  assert(postReceiving.body.data.status === "POSTED", "Receiving status is POSTED");

  const normalBatch = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId: mainBranchId,
        batchCode: "FINAL13-NORMAL-BATCH",
      },
    },
  });

  assert(Boolean(normalBatch), "Normal receiving created inventory batch");
  assert(Number(normalBatch.quantityAvailable) === 5, "Normal receiving quantityAvailable saved");

  const poAfterReceiving = await prisma.purchaseOrder.findUnique({
    where: {
      id: createPO.body.data.id,
    },
  });

  assert(poAfterReceiving.status === "RECEIVED", "PO becomes RECEIVED after full receiving");

  const createSerializedPO = await request("/purchase-orders", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      poCode: "FINAL13-SERIAL-PO-0001",
      supplierId,
      items: [
        {
          itemId: mainSerializedItem.id,
          description: mainSerializedItem.itemName,
          quantity: 2,
          unitCost: 1000,
        },
      ],
    }),
  });

  assert(createSerializedPO.status === 201, "Serialized PO can be created");

  const orderSerializedPO = await request(`/purchase-orders/${createSerializedPO.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "ORDERED",
    }),
  });

  assert(orderSerializedPO.status === 200, "Serialized PO can be ordered");

  const createSerializedReceiving = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "FINAL13-SERIAL-REC-0001",
      supplierId,
      purchaseOrderId: createSerializedPO.body.data.id,
      supplierInvoiceNo: "FINAL13-SERIAL-INV-0001",
      referenceNo: "FINAL13-SERIAL-REC-REF-0001",
      items: [
        {
          itemId: mainSerializedItem.id,
          purchaseOrderItemId: createSerializedPO.body.data.items[0].id,
          description: mainSerializedItem.itemName,
          quantityReceived: 2,
          unitCost: 1000,
          batchCode: "FINAL13-SERIAL-BATCH",
          serialNumbers: ["FINAL13-SERIAL-001", "FINAL13-SERIAL-002"],
        },
      ],
    }),
  });

  if (createSerializedReceiving.status !== 201) {
    console.dir(createSerializedReceiving.body, { depth: null });
  }

  assert(createSerializedReceiving.status === 201, "Serialized receiving can be created");

  const postSerializedReceiving = await request(`/purchase-receivings/${createSerializedReceiving.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  assert(postSerializedReceiving.status === 200, "Serialized receiving can be posted");

  const serializedBatch = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId: mainBranchId,
        batchCode: "FINAL13-SERIAL-BATCH",
      },
    },
  });

  const receivedSerials = await prisma.itemSerial.findMany({
    where: {
      branchId: mainBranchId,
      serialNumber: {
        in: ["FINAL13-SERIAL-001", "FINAL13-SERIAL-002"],
      },
    },
  });

  assert(Boolean(serializedBatch), "Serialized receiving created inventory batch");
  assert(Number(serializedBatch.quantityAvailable) === 2, "Serialized receiving quantityAvailable saved");
  assert(receivedSerials.length === 2, "Serialized receiving created ItemSerial records");

  const createTransfer = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "FINAL13-TR-0001",
      notes: "Final 13 normal transfer",
      items: [
        {
          itemId: mainNormalItem.id,
          fromBatchId: normalBatch.id,
          description: mainNormalItem.itemName,
          quantity: 3,
        },
      ],
    }),
  });

  if (createTransfer.status !== 201) {
    console.dir(createTransfer.body, { depth: null });
  }

  assert(createTransfer.status === 201, "Normal stock transfer can be created");

  const approveTransfer = await request(`/stock-transfers/${createTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(approveTransfer.status === 200, "Normal stock transfer can be approved");

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

  assert(postTransfer.status === 200, "Normal stock transfer can be posted");
  assert(postTransfer.body.data.status === "POSTED", "Normal stock transfer status is POSTED");

  const normalMainBatchAfterTransfer = await prisma.inventoryBatch.findUnique({
    where: {
      id: normalBatch.id,
    },
  });

  const normalMabBatch = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId: mabBranch.id,
        batchCode: "FINAL13-NORMAL-BATCH",
      },
    },
  });

  assert(Number(normalMainBatchAfterTransfer.quantityAvailable) === 2, "MAIN normal batch deducted after transfer");
  assert(Boolean(normalMabBatch), "MAB normal destination batch created");
  assert(normalMabBatch.itemId === mabNormalItem.id, "MAB normal destination batch linked to matching item");
  assert(Number(normalMabBatch.quantityAvailable) === 3, "MAB normal destination quantity saved");

  const createSerializedTransfer = await request("/stock-transfers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      toBranchId: mabBranch.id,
      transferCode: "FINAL13-SERIAL-TR-0001",
      notes: "Final 13 serialized transfer",
      items: [
        {
          itemId: mainSerializedItem.id,
          fromBatchId: serializedBatch.id,
          description: mainSerializedItem.itemName,
          quantity: 2,
          serialIds: receivedSerials.map((serial) => serial.id),
        },
      ],
    }),
  });

  if (createSerializedTransfer.status !== 201) {
    console.dir(createSerializedTransfer.body, { depth: null });
  }

  assert(createSerializedTransfer.status === 201, "Serialized stock transfer can be created");

  const approveSerializedTransfer = await request(`/stock-transfers/${createSerializedTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(approveSerializedTransfer.status === 200, "Serialized stock transfer can be approved");

  const postSerializedTransfer = await request(`/stock-transfers/${createSerializedTransfer.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  if (postSerializedTransfer.status !== 200) {
    console.dir(postSerializedTransfer.body, { depth: null });
  }

  assert(postSerializedTransfer.status === 200, "Serialized stock transfer can be posted");
  assert(postSerializedTransfer.body.data.status === "POSTED", "Serialized stock transfer status is POSTED");

  const serializedMainBatchAfterTransfer = await prisma.inventoryBatch.findUnique({
    where: {
      id: serializedBatch.id,
    },
  });

  const serializedMabBatch = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId: mabBranch.id,
        batchCode: "FINAL13-SERIAL-BATCH",
      },
    },
  });

  const movedSerials = await prisma.itemSerial.findMany({
    where: {
      serialNumber: {
        in: ["FINAL13-SERIAL-001", "FINAL13-SERIAL-002"],
      },
    },
  });

  assert(Number(serializedMainBatchAfterTransfer.quantityAvailable) === 0, "MAIN serialized batch deducted to zero");
  assert(serializedMainBatchAfterTransfer.status === "DEPLETED", "MAIN serialized batch marked DEPLETED");
  assert(Boolean(serializedMabBatch), "MAB serialized destination batch created");
  assert(serializedMabBatch.itemId === mabSerializedItem.id, "MAB serialized batch linked to matching item");
  assert(Number(serializedMabBatch.quantityAvailable) === 2, "MAB serialized destination quantity saved");
  assert(movedSerials.length === 2, "Serialized transfer kept both serial records");
  assert(movedSerials.every((serial) => serial.branchId === mabBranch.id), "Serialized transfer moved serials to MAB");
  assert(movedSerials.every((serial) => serial.itemId === mabSerializedItem.id), "Serialized transfer moved serials to MAB matching item");
  assert(movedSerials.every((serial) => serial.batchId === serializedMabBatch.id), "Serialized transfer moved serials to MAB batch");
  assert(movedSerials.every((serial) => serial.status === "AVAILABLE"), "Serialized transfer keeps serials AVAILABLE");

  const supplierList = await request("/suppliers?search=FINAL13", {
    token: adminLogin.token,
  });

  assert(supplierList.status === 200, "Supplier search still works");

  const poList = await request("/purchase-orders?search=FINAL13", {
    token: adminLogin.token,
  });

  assert(poList.status === 200, "Purchase order search still works");

  const receivingList = await request("/purchase-receivings?search=FINAL13", {
    token: adminLogin.token,
  });

  assert(receivingList.status === 200, "Purchase receiving search still works");

  const transferList = await request("/stock-transfers?search=FINAL13", {
    token: adminLogin.token,
  });

  assert(transferList.status === 200, "Stock transfer search still works");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 13 MODULE 13N FINAL REGRESSION TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13N FINAL REGRESSION TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
