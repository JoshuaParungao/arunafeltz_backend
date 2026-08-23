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
  console.log("\nPHASE 13 MODULE 13I: Serialized Receiving Support Test");
  console.log("-----------------------------------------------------");

  const adminLogin = await login(users.admin);
  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.purchaseReceiving.deleteMany({
    where: {
      branchId,
      receivingCode: {
        startsWith: "RECSERIAL-13I-",
      },
    },
  });

  await prisma.purchaseOrder.deleteMany({
    where: {
      branchId,
      poCode: {
        startsWith: "RECSERIAL-13I-",
      },
    },
  });

  await prisma.inventoryMovement.deleteMany({
    where: {
      branchId,
      referenceNo: {
        startsWith: "RECSERIAL-13I-",
      },
    },
  });

  await prisma.itemSerial.deleteMany({
    where: {
      branchId,
      serialNumber: {
        startsWith: "RECSERIAL-13I-",
      },
    },
  });

  await prisma.inventoryBatch.deleteMany({
    where: {
      branchId,
      batchCode: {
        startsWith: "RECSERIAL-13I-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "RECSERIAL-13I-",
      },
    },
  });

  assert(true, "Previous 13I serialized receiving test data cleared");

  const category = await prisma.itemCategory.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(category), "Active item category found");

  const unit = await prisma.unit.findFirst({
    where: {
      status: "ACTIVE",
    },
  });

  assert(Boolean(unit), "Active unit found");

  const serializedItem = await prisma.item.upsert({
    where: {
      branchId_itemCode: {
        branchId,
        itemCode: "RECSERIAL-13I-ITEM",
      },
    },
    update: {
      itemName: "13I Serialized Receiving Test Item",
      status: "ACTIVE",
      isSerialized: true,
      hasWarranty: true,
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
      itemCode: "RECSERIAL-13I-ITEM",
      itemName: "13I Serialized Receiving Test Item",
      description: "Temporary test item for Phase 13I serialized receiving",
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
      categoryId: category.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(serializedItem.id), "Active serialized test item ready");

  const supplier = await prisma.supplier.create({
    data: {
      supplierCode: "RECSERIAL-13I-SUPPLIER",
      name: "13I Serialized Supplier",
      contactPerson: "13I Serial Contact",
      contactNo: "09170001390",
      email: "serial13i@supplier.test",
      status: "ACTIVE",
      branchId,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(supplier.id), "Supplier test data ready");

  const po = await prisma.purchaseOrder.create({
    data: {
      poCode: "RECSERIAL-13I-PO-0001",
      status: "ORDERED",
      supplierNameSnapshot: supplier.name,
      supplierContactSnapshot: supplier.contactNo,
      subtotal: 2000,
      totalDiscount: 0,
      grandTotal: 2000,
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
            description: serializedItem.itemName,
            quantity: 2,
            receivedQuantity: 0,
            unitCost: 1000,
            discountAmount: 0,
            lineTotal: 2000,
            itemId: serializedItem.id,
          },
        ],
      },
    },
    include: {
      items: true,
    },
  });

  assert(Boolean(po.id), "Ordered serialized PO test data ready");
  assert(po.items.length === 1, "Ordered serialized PO item test data ready");

  const poItem = po.items[0];

  const missingSerials = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSERIAL-13I-MISSING-SERIALS",
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      items: [
        {
          itemId: serializedItem.id,
          purchaseOrderItemId: poItem.id,
          description: serializedItem.itemName,
          quantityReceived: 2,
          unitCost: 1000,
          batchCode: "RECSERIAL-13I-BATCH-MISSING",
        },
      ],
    }),
  });

  assert(missingSerials.status === 400, "Serialized receiving requires serialNumbers");

  const serialCountMismatch = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSERIAL-13I-COUNT-MISMATCH",
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      items: [
        {
          itemId: serializedItem.id,
          purchaseOrderItemId: poItem.id,
          description: serializedItem.itemName,
          quantityReceived: 2,
          unitCost: 1000,
          batchCode: "RECSERIAL-13I-BATCH-MISMATCH",
          serialNumbers: ["RECSERIAL-13I-MISMATCH-001"],
        },
      ],
    }),
  });

  assert(serialCountMismatch.status === 400, "Serialized receiving validates serial count mismatch");

  const duplicateInRequest = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSERIAL-13I-DUPLICATE-REQUEST",
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      items: [
        {
          itemId: serializedItem.id,
          purchaseOrderItemId: poItem.id,
          description: serializedItem.itemName,
          quantityReceived: 2,
          unitCost: 1000,
          batchCode: "RECSERIAL-13I-BATCH-DUPREQ",
          serialNumbers: ["RECSERIAL-13I-DUP-001", "RECSERIAL-13I-DUP-001"],
        },
      ],
    }),
  });

  assert(duplicateInRequest.status === 400, "Duplicate serial in request is blocked");

  const createSerialized = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSERIAL-13I-0001",
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      supplierDeliveryNo: "RECSERIAL-13I-DR-0001",
      supplierInvoiceNo: "RECSERIAL-13I-INV-0001",
      referenceNo: "RECSERIAL-13I-REF-0001",
      notes: "13I serialized receiving test",
      items: [
        {
          itemId: serializedItem.id,
          purchaseOrderItemId: poItem.id,
          description: serializedItem.itemName,
          quantityReceived: 2,
          unitCost: 1000,
          discountAmount: 0,
          batchCode: "RECSERIAL-13I-BATCH-0001",
          serialNumbers: ["RECSERIAL-13I-SN-001", "RECSERIAL-13I-SN-002"],
        },
      ],
    }),
  });

  if (createSerialized.status !== 201) {
    console.dir(createSerialized.body, { depth: null });
  }

  assert(createSerialized.status === 201, "Serialized draft receiving can be created");
  assert(createSerialized.body.data.items[0].serials.length === 2, "Draft receiving stores serial numbers");

  const duplicateDraftSerial = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSERIAL-13I-DRAFT-DUPLICATE",
      supplierId: supplier.id,
      purchaseOrderId: po.id,
      items: [
        {
          itemId: serializedItem.id,
          purchaseOrderItemId: poItem.id,
          description: serializedItem.itemName,
          quantityReceived: 1,
          unitCost: 1000,
          batchCode: "RECSERIAL-13I-BATCH-DRAFTDUP",
          serialNumbers: ["RECSERIAL-13I-SN-001"],
        },
      ],
    }),
  });

  assert(duplicateDraftSerial.status === 409, "Serial already in another draft receiving is blocked");

  const postSerialized = await request(`/purchase-receivings/${createSerialized.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "POSTED",
    }),
  });

  if (postSerialized.status !== 200) {
    console.dir(postSerialized.body, { depth: null });
  }

  assert(postSerialized.status === 200, "Serialized receiving can be posted");
  assert(postSerialized.body.data.status === "POSTED", "Serialized receiving status is POSTED");
  assert(Boolean(postSerialized.body.data.postedAt), "Serialized receiving postedAt saved");
  assert(postSerialized.body.data.postedBy.id === adminLogin.user.id, "Serialized receiving postedBy saved");

  const batch = await prisma.inventoryBatch.findUnique({
    where: {
      branchId_batchCode: {
        branchId,
        batchCode: "RECSERIAL-13I-BATCH-0001",
      },
    },
  });

  assert(Boolean(batch), "Inventory batch created from serialized receiving");
  assert(Number(batch.quantityIn) === 2, "Serialized batch quantityIn saved");
  assert(Number(batch.quantityAvailable) === 2, "Serialized batch quantityAvailable saved");

  const movement = await prisma.inventoryMovement.findFirst({
    where: {
      branchId,
      batchId: batch.id,
      type: "STOCK_IN",
      source: "PURCHASE",
      referenceNo: "RECSERIAL-13I-INV-0001",
    },
  });

  assert(Boolean(movement), "Purchase stock-in movement created for serialized receiving");
  assert(Number(movement.quantity) === 2, "Serialized movement quantity saved");

  const itemSerials = await prisma.itemSerial.findMany({
    where: {
      branchId,
      serialNumber: {
        in: ["RECSERIAL-13I-SN-001", "RECSERIAL-13I-SN-002"],
      },
    },
    orderBy: {
      serialNumber: "asc",
    },
  });

  assert(itemSerials.length === 2, "ItemSerial records created");
  assert(itemSerials.every((serial) => serial.status === "AVAILABLE"), "ItemSerial records are AVAILABLE");
  assert(itemSerials.every((serial) => serial.batchId === batch.id), "ItemSerial records linked to batch");
  assert(itemSerials.every((serial) => serial.itemId === serializedItem.id), "ItemSerial records linked to item");

  const poItemAfterPost = await prisma.purchaseOrderItem.findUnique({
    where: {
      id: poItem.id,
    },
  });

  assert(Number(poItemAfterPost.receivedQuantity) === 2, "PO item receivedQuantity updated for serialized receiving");

  const poAfterPost = await prisma.purchaseOrder.findUnique({
    where: {
      id: po.id,
    },
  });

  assert(poAfterPost.status === "RECEIVED", "PO status updated to RECEIVED after serialized receiving");
  assert(Boolean(poAfterPost.receivedAt), "PO receivedAt saved after serialized receiving");

  const duplicateExistingSerial = await request("/purchase-receivings", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      receivingCode: "RECSERIAL-13I-EXISTING-SERIAL",
      supplierId: supplier.id,
      items: [
        {
          itemId: serializedItem.id,
          description: serializedItem.itemName,
          quantityReceived: 1,
          unitCost: 1000,
          batchCode: "RECSERIAL-13I-BATCH-EXISTING",
          serialNumbers: ["RECSERIAL-13I-SN-001"],
        },
      ],
    }),
  });

  assert(duplicateExistingSerial.status === 409, "Existing ItemSerial duplicate is blocked");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 13 MODULE 13I SERIALIZED RECEIVING SUPPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13I SERIALIZED RECEIVING SUPPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
