require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";
const unique = Date.now();

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

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.success || !result.body?.data?.token) {
    throw new Error(`Login failed for ${user.identifier}: ${JSON.stringify(result.body)}`);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const createNonSerializedSale = async ({ token, userId, item, dbItem }) => {
  const batch = await prisma.inventoryBatch.create({
    data: {
      batchCode: `BATCH-PHASE8-M6-NON-SERIAL-${unique}`,
      quantityIn: "5.00",
      quantityAvailable: "5.00",
      unitCost: dbItem.costPrice,
      sellingPrice1: dbItem.price1,
      sellingPrice2: dbItem.price2,
      sellingPrice3: dbItem.price3,
      sellingPrice4: dbItem.price4,
      sellingPrice5: dbItem.price5,
      supplierName: "Phase 8 Module 6 Test",
      referenceNo: `PHASE8-M6-NON-${unique}`,
      remarks: "Temporary batch for sale cancellation test.",
      branchId: item.branch.id,
      itemId: dbItem.id,
      createdById: userId,
      updatedById: userId,
    },
  });

  const sale = await request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      remarks: "Phase 8 Module 6 non-serialized cancel test sale.",
      items: [
        {
          itemId: dbItem.id,
          batchId: batch.id,
          priceTier: 1,
          quantity: 2,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 20000,
        },
      ],
    }),
  });

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Non-serialized sale created for cancel test");

  return {
    batch,
    sale: sale.body.data,
  };
};

const createSerializedSale = async ({ token, userId, item, dbItem }) => {
  const batch = await prisma.inventoryBatch.create({
    data: {
      batchCode: `BATCH-PHASE8-M6-SERIAL-${unique}`,
      quantityIn: "2.00",
      quantityAvailable: "2.00",
      unitCost: dbItem.costPrice,
      sellingPrice1: dbItem.price1,
      sellingPrice2: dbItem.price2,
      sellingPrice3: dbItem.price3,
      sellingPrice4: dbItem.price4,
      sellingPrice5: dbItem.price5,
      supplierName: "Phase 8 Module 6 Test",
      referenceNo: `PHASE8-M6-SERIAL-${unique}`,
      remarks: "Temporary serialized batch for sale cancellation test.",
      branchId: item.branch.id,
      itemId: dbItem.id,
      createdById: userId,
      updatedById: userId,
    },
  });

  const serial = await prisma.itemSerial.create({
    data: {
      serialNumber: `SN-PHASE8-M6-${unique}`,
      status: "AVAILABLE",
      branchId: item.branch.id,
      itemId: dbItem.id,
      batchId: batch.id,
      createdById: userId,
      updatedById: userId,
    },
  });

  const sale = await request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      remarks: "Phase 8 Module 6 serialized cancel test sale.",
      items: [
        {
          itemId: dbItem.id,
          serialId: serial.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 20000,
        },
      ],
    }),
  });

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Serialized sale created for cancel test");

  return {
    batch,
    serial,
    sale: sale.body.data,
  };
};

const main = async () => {
  console.log("\nPhase 8 Module 6: Sale Cancel API Test");
  console.log("--------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load item for sale cancel test");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Sale cancel test item found");

  const dbItem = await prisma.item.findUnique({
    where: {
      id: item.id,
    },
  });

  assert(Boolean(dbItem), "DB item found");

  const originalIsSerialized = dbItem.isSerialized;

  try {
    await prisma.item.update({
      where: {
        id: dbItem.id,
      },
      data: {
        isSerialized: false,
      },
    });

    const nonSerialized = await createNonSerializedSale({
      token: adminLogin.token,
      userId: adminLogin.user.id,
      item,
      dbItem,
    });

    const batchAfterSale = await prisma.inventoryBatch.findUnique({
      where: {
        id: nonSerialized.batch.id,
      },
    });

    assert(Number(batchAfterSale.quantityAvailable) === 3, "Non-serialized sale deducted batch from 5 to 3");

    const noTokenCancel = await request(`/sales/${nonSerialized.sale.id}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({
        cancellationReason: "Should fail missing token.",
      }),
    });

    assert(noTokenCancel.status === 401, "Sale cancel blocks missing token");

    const missingReason = await request(`/sales/${nonSerialized.sale.id}/cancel`, {
      method: "PATCH",
      token: adminLogin.token,
      body: JSON.stringify({}),
    });

    assert(missingReason.status === 400, "Sale cancel requires cancellationReason");

    const techCancel = await request(`/sales/${nonSerialized.sale.id}/cancel`, {
      method: "PATCH",
      token: techLogin.token,
      body: JSON.stringify({
        cancellationReason: "Technician should not cancel.",
      }),
    });

    assert(techCancel.status === 403, "Technician cannot cancel sale");

    const cancelNonSerialized = await request(`/sales/${nonSerialized.sale.id}/cancel`, {
      method: "PATCH",
      token: adminLogin.token,
      body: JSON.stringify({
        cancellationReason: "Phase 8 Module 6 non-serialized cancel.",
      }),
    });

    if (cancelNonSerialized.status !== 200) {
      console.dir(cancelNonSerialized.body, { depth: null });
    }

    assert(cancelNonSerialized.status === 200, "Admin can cancel non-serialized sale");
    assert(cancelNonSerialized.body.data.status === "CANCELLED", "Non-serialized sale status became CANCELLED");
    assert(Boolean(cancelNonSerialized.body.data.cancelledAt), "Non-serialized sale cancelledAt is set");
    assert(cancelNonSerialized.body.data.cancellationReason === "Phase 8 Module 6 non-serialized cancel.", "Cancellation reason saved");

    const batchAfterCancel = await prisma.inventoryBatch.findUnique({
      where: {
        id: nonSerialized.batch.id,
      },
    });

    assert(Number(batchAfterCancel.quantityAvailable) === 5, "Non-serialized cancel restored batch from 3 to 5");

    const nonSerializedReturnMovement = await prisma.inventoryMovement.findFirst({
      where: {
        branchId: item.branch.id,
        itemId: dbItem.id,
        batchId: nonSerialized.batch.id,
        type: "RETURN_IN",
        source: "SALE",
        referenceNo: nonSerialized.sale.receiptCode,
      },
    });

    assert(Boolean(nonSerializedReturnMovement), "Non-serialized cancel created RETURN_IN movement");
    assert(Number(nonSerializedReturnMovement.quantity) === 2, "Non-serialized RETURN_IN movement quantity is 2");
    assert(Number(nonSerializedReturnMovement.previousQuantity) === 3, "Non-serialized RETURN_IN previous quantity is 3");
    assert(Number(nonSerializedReturnMovement.newQuantity) === 5, "Non-serialized RETURN_IN new quantity is 5");

    const doubleCancel = await request(`/sales/${nonSerialized.sale.id}/cancel`, {
      method: "PATCH",
      token: adminLogin.token,
      body: JSON.stringify({
        cancellationReason: "Should not double cancel.",
      }),
    });

    assert(doubleCancel.status === 400, "Double cancellation is blocked");

    await prisma.item.update({
      where: {
        id: dbItem.id,
      },
      data: {
        isSerialized: true,
      },
    });

    const serialized = await createSerializedSale({
      token: adminLogin.token,
      userId: adminLogin.user.id,
      item,
      dbItem,
    });

    const serialAfterSale = await prisma.itemSerial.findUnique({
      where: {
        id: serialized.serial.id,
      },
    });

    assert(serialAfterSale.status === "SOLD", "Serialized sale changed serial to SOLD");

    const serializedBatchAfterSale = await prisma.inventoryBatch.findUnique({
      where: {
        id: serialized.batch.id,
      },
    });

    assert(Number(serializedBatchAfterSale.quantityAvailable) === 1, "Serialized sale deducted batch from 2 to 1");

    const cancelSerialized = await request(`/sales/${serialized.sale.id}/cancel`, {
      method: "PATCH",
      token: adminLogin.token,
      body: JSON.stringify({
        cancellationReason: "Phase 8 Module 6 serialized cancel.",
      }),
    });

    if (cancelSerialized.status !== 200) {
      console.dir(cancelSerialized.body, { depth: null });
    }

    assert(cancelSerialized.status === 200, "Admin can cancel serialized sale");
    assert(cancelSerialized.body.data.status === "CANCELLED", "Serialized sale status became CANCELLED");

    const serialAfterCancel = await prisma.itemSerial.findUnique({
      where: {
        id: serialized.serial.id,
      },
    });

    assert(serialAfterCancel.status === "AVAILABLE", "Serialized cancel restored serial to AVAILABLE");

    const serializedBatchAfterCancel = await prisma.inventoryBatch.findUnique({
      where: {
        id: serialized.batch.id,
      },
    });

    assert(Number(serializedBatchAfterCancel.quantityAvailable) === 2, "Serialized cancel restored batch from 1 to 2");

    const serializedReturnMovement = await prisma.inventoryMovement.findFirst({
      where: {
        branchId: item.branch.id,
        itemId: dbItem.id,
        batchId: serialized.batch.id,
        serialId: serialized.serial.id,
        type: "RETURN_IN",
        source: "SALE",
        referenceNo: serialized.sale.receiptCode,
      },
    });

    assert(Boolean(serializedReturnMovement), "Serialized cancel created RETURN_IN movement with serialId");
    assert(Number(serializedReturnMovement.quantity) === 1, "Serialized RETURN_IN movement quantity is 1");
    assert(Number(serializedReturnMovement.previousQuantity) === 1, "Serialized RETURN_IN previous quantity is 1");
    assert(Number(serializedReturnMovement.newQuantity) === 2, "Serialized RETURN_IN new quantity is 2");

    const missingSale = await request("/sales/not-existing-sale-id/cancel", {
      method: "PATCH",
      token: adminLogin.token,
      body: JSON.stringify({
        cancellationReason: "Missing sale.",
      }),
    });

    assert(missingSale.status === 404, "Missing sale cancel returns 404");

    console.log("\nPHASE 8 MODULE 6 SALE CANCEL API TEST PASSED");
  } finally {
    await prisma.item.update({
      where: {
        id: dbItem.id,
      },
      data: {
        isSerialized: originalIsSerialized,
      },
    });

    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error("\nPHASE 8 MODULE 6 SALE CANCEL API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
