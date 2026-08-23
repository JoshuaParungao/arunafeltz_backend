require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";
const unique = Date.now();

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

  console.log(`PASS: ${message}`);
};

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  assert(result.status === 200, `${user.identifier} login status is 200`);
  assert(Boolean(result.body?.data?.token), `${user.identifier} login returns token`);

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const getRyzenItem = async (token) => {
  const overview = await request("/inventory/overview?search=Ryzen", {
    token,
  });

  assert(overview.status === 200, "Inventory overview loads for final sales test");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Final sales test item found");

  const dbItem = await prisma.item.findUnique({
    where: {
      id: item.id,
    },
  });

  assert(Boolean(dbItem), "Final sales DB item found");

  return {
    item,
    dbItem,
  };
};

const createCustomSale = async (token) => {
  const sale = await request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      remarks: "Phase 8 final custom sale.",
      items: [
        {
          description: "Phase 8 final custom labor",
          quantity: 1,
          unitPrice: 1200,
          discountAmount: 100,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 1100,
        },
      ],
    }),
  });

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Custom sale created");
  assert(sale.body.data.receiptCode.startsWith("RCPT-MAIN-"), "Custom sale receipt code generated");
  assert(sale.body.data.paymentStatus === "PAID", "Custom sale payment status PAID");
  assert(Number(sale.body.data.grandTotal) === 1100, "Custom sale grand total computed");

  return sale.body.data;
};

const createNonSerializedSale = async ({ token, userId, item, dbItem }) => {
  await prisma.item.update({
    where: {
      id: dbItem.id,
    },
    data: {
      isSerialized: false,
    },
  });

  const batch = await prisma.inventoryBatch.create({
    data: {
      batchCode: `BATCH-PHASE8-FINAL-NON-${unique}`,
      quantityIn: "10.00",
      quantityAvailable: "10.00",
      unitCost: dbItem.costPrice,
      sellingPrice1: dbItem.price1,
      sellingPrice2: dbItem.price2,
      sellingPrice3: dbItem.price3,
      sellingPrice4: dbItem.price4,
      sellingPrice5: dbItem.price5,
      supplierName: "Phase 8 Final Test",
      referenceNo: `PHASE8-FINAL-NON-${unique}`,
      remarks: "Temporary batch for Phase 8 final non-serialized sale.",
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
      remarks: "Phase 8 final non-serialized sale.",
      items: [
        {
          itemId: dbItem.id,
          batchId: batch.id,
          priceTier: 1,
          quantity: 3,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 50000,
        },
      ],
    }),
  });

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Non-serialized sale created");
  assert(sale.body.data.items[0].batchId === batch.id, "Non-serialized sale item linked to batch");

  const updatedBatch = await prisma.inventoryBatch.findUnique({
    where: {
      id: batch.id,
    },
  });

  assert(Number(updatedBatch.quantityAvailable) === 7, "Non-serialized stock deducted from 10 to 7");

  const movement = await prisma.inventoryMovement.findFirst({
    where: {
      branchId: item.branch.id,
      itemId: dbItem.id,
      batchId: batch.id,
      type: "SALE_OUT",
      source: "SALE",
      referenceNo: sale.body.data.receiptCode,
    },
  });

  assert(Boolean(movement), "Non-serialized SALE_OUT movement created");
  assert(Number(movement.quantity) === 3, "Non-serialized SALE_OUT movement quantity is 3");

  return {
    batch,
    sale: sale.body.data,
  };
};

const createSerializedSale = async ({ token, userId, item, dbItem }) => {
  await prisma.item.update({
    where: {
      id: dbItem.id,
    },
    data: {
      isSerialized: true,
    },
  });

  const batch = await prisma.inventoryBatch.create({
    data: {
      batchCode: `BATCH-PHASE8-FINAL-SERIAL-${unique}`,
      quantityIn: "2.00",
      quantityAvailable: "2.00",
      unitCost: dbItem.costPrice,
      sellingPrice1: dbItem.price1,
      sellingPrice2: dbItem.price2,
      sellingPrice3: dbItem.price3,
      sellingPrice4: dbItem.price4,
      sellingPrice5: dbItem.price5,
      supplierName: "Phase 8 Final Test",
      referenceNo: `PHASE8-FINAL-SERIAL-${unique}`,
      remarks: "Temporary batch for Phase 8 final serialized sale.",
      branchId: item.branch.id,
      itemId: dbItem.id,
      createdById: userId,
      updatedById: userId,
    },
  });

  const serial = await prisma.itemSerial.create({
    data: {
      serialNumber: `SN-PHASE8-FINAL-${unique}`,
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
      remarks: "Phase 8 final serialized sale.",
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
          amount: 50000,
        },
      ],
    }),
  });

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Serialized sale created");
  assert(sale.body.data.items[0].serialId === serial.id, "Serialized sale item linked to serial");
  assert(sale.body.data.items[0].batchId === batch.id, "Serialized sale item linked to serial batch");

  const updatedBatch = await prisma.inventoryBatch.findUnique({
    where: {
      id: batch.id,
    },
  });

  assert(Number(updatedBatch.quantityAvailable) === 1, "Serialized stock deducted from 2 to 1");

  const updatedSerial = await prisma.itemSerial.findUnique({
    where: {
      id: serial.id,
    },
  });

  assert(updatedSerial.status === "SOLD", "Serialized sale changed serial to SOLD");

  const movement = await prisma.inventoryMovement.findFirst({
    where: {
      branchId: item.branch.id,
      itemId: dbItem.id,
      batchId: batch.id,
      serialId: serial.id,
      type: "SALE_OUT",
      source: "SALE",
      referenceNo: sale.body.data.receiptCode,
    },
  });

  assert(Boolean(movement), "Serialized SALE_OUT movement created with serialId");
  assert(Number(movement.quantity) === 1, "Serialized SALE_OUT movement quantity is 1");

  return {
    batch,
    serial,
    sale: sale.body.data,
  };
};

const createAndApproveQuotation = async (token) => {
  const quotation = await request("/quotations", {
    method: "POST",
    token,
    body: JSON.stringify({
      title: "Phase 8 Final Conversion Quotation",
      items: [
        {
          description: "Phase 8 final quotation custom line",
          priceTier: 1,
          quantity: 1,
          unitPrice: 1500,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(quotation.status === 201, "Final conversion quotation created");

  const sent = await request(`/quotations/${quotation.body.data.id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      status: "SENT",
    }),
  });

  assert(sent.status === 200, "Final conversion quotation sent");

  const approved = await request(`/quotations/${quotation.body.data.id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      status: "APPROVED",
    }),
  });

  assert(approved.status === 200, "Final conversion quotation approved");

  return quotation.body.data;
};

const main = async () => {
  console.log("\nPHASE 8 FINAL SALES / POS TEST");
  console.log("------------------------------");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body?.success === true, "Health endpoint success true");
  assert(health.body?.data?.status === "healthy", "Backend status is healthy");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  assert(superLogin.user.role === "SUPER_OWNER", "Super Owner role verified");
  assert(adminLogin.user.role === "ADMIN", "Admin role verified");
  assert(techLogin.user.role === "TECHNICIAN", "Technician role verified");

  const { item, dbItem } = await getRyzenItem(adminLogin.token);
  const originalIsSerialized = dbItem.isSerialized;

  try {
    const noTokenCreate = await request("/sales", {
      method: "POST",
      body: JSON.stringify({}),
    });

    assert(noTokenCreate.status === 401, "Sale create blocks missing token");

    const techCreate = await request("/sales", {
      method: "POST",
      token: techLogin.token,
      body: JSON.stringify({
        items: [
          {
            description: "Tech should not create sale",
            quantity: 1,
            unitPrice: 100,
            discountAmount: 0,
          },
        ],
        payments: [
          {
            paymentMethod: "CASH",
            amount: 100,
          },
        ],
      }),
    });

    assert(techCreate.status === 403, "Technician cannot create sale");

    const customSale = await createCustomSale(adminLogin.token);

    const list = await request(`/sales?search=${encodeURIComponent(customSale.receiptCode)}`, {
      token: adminLogin.token,
    });

    assert(list.status === 200, "Sale list works");
    assert(list.body.data.data.some((sale) => sale.id === customSale.id), "Sale list includes custom sale");

    const view = await request(`/sales/${customSale.id}`, {
      token: adminLogin.token,
    });

    assert(view.status === 200, "Sale view works");
    assert(view.body.data.id === customSale.id, "Sale view returns correct sale");
    assert(view.body.data.items.length === 1, "Sale view includes items");
    assert(view.body.data.payments.length === 1, "Sale view includes payments");

    const nonSerialized = await createNonSerializedSale({
      token: adminLogin.token,
      userId: adminLogin.user.id,
      item,
      dbItem,
    });

    const cancelNonSerialized = await request(`/sales/${nonSerialized.sale.id}/cancel`, {
      method: "PATCH",
      token: adminLogin.token,
      body: JSON.stringify({
        cancellationReason: "Phase 8 final non-serialized cancel.",
      }),
    });

    assert(cancelNonSerialized.status === 200, "Non-serialized sale cancellation works");
    assert(cancelNonSerialized.body.data.status === "CANCELLED", "Non-serialized sale status CANCELLED");

    const nonSerializedBatchAfterCancel = await prisma.inventoryBatch.findUnique({
      where: {
        id: nonSerialized.batch.id,
      },
    });

    assert(Number(nonSerializedBatchAfterCancel.quantityAvailable) === 10, "Non-serialized cancel restored stock to 10");

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

    const serialized = await createSerializedSale({
      token: adminLogin.token,
      userId: adminLogin.user.id,
      item,
      dbItem,
    });

    const cancelSerialized = await request(`/sales/${serialized.sale.id}/cancel`, {
      method: "PATCH",
      token: adminLogin.token,
      body: JSON.stringify({
        cancellationReason: "Phase 8 final serialized cancel.",
      }),
    });

    assert(cancelSerialized.status === 200, "Serialized sale cancellation works");
    assert(cancelSerialized.body.data.status === "CANCELLED", "Serialized sale status CANCELLED");

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

    assert(Number(serializedBatchAfterCancel.quantityAvailable) === 2, "Serialized cancel restored stock to 2");

    const quotation = await createAndApproveQuotation(adminLogin.token);

    const conversionSale = await request("/sales", {
      method: "POST",
      token: adminLogin.token,
      body: JSON.stringify({
        quotationId: quotation.id,
        remarks: "Phase 8 final quotation conversion sale.",
        items: [
          {
            description: "Phase 8 final conversion custom sale line",
            quantity: 1,
            unitPrice: 1500,
            discountAmount: 0,
          },
        ],
        payments: [
          {
            paymentMethod: "CASH",
            amount: 1500,
          },
        ],
      }),
    });

    assert(conversionSale.status === 201, "Approved quotation converts to sale");
    assert(conversionSale.body.data.quotationId === quotation.id, "Converted sale stores quotationId");
    assert(conversionSale.body.data.quotation.status === "CONVERTED", "Converted sale response quotation status CONVERTED");

    const convertedQuotation = await prisma.quotation.findUnique({
      where: {
        id: quotation.id,
      },
    });

    assert(convertedQuotation.status === "CONVERTED", "Quotation status CONVERTED in database");
    assert(Boolean(convertedQuotation.convertedAt), "Quotation convertedAt saved");

    const duplicateConversion = await request("/sales", {
      method: "POST",
      token: adminLogin.token,
      body: JSON.stringify({
        quotationId: quotation.id,
        items: [
          {
            description: "Duplicate conversion should fail",
            quantity: 1,
            unitPrice: 100,
            discountAmount: 0,
          },
        ],
        payments: [
          {
            paymentMethod: "CASH",
            amount: 100,
          },
        ],
      }),
    });

    assert(duplicateConversion.status === 400, "Duplicate quotation conversion blocked");

    const superSale = await request("/sales", {
      method: "POST",
      token: superLogin.token,
      body: JSON.stringify({
        branchId: item.branch.id,
        remarks: "Phase 8 final Super Owner custom sale.",
        items: [
          {
            description: "Super Owner final custom sale line",
            quantity: 1,
            unitPrice: 500,
            discountAmount: 0,
          },
        ],
        payments: [
          {
            paymentMethod: "CASH",
            amount: 500,
          },
        ],
      }),
    });

    assert(superSale.status === 201, "Super Owner can create sale with branchId");

    const missingSale = await request("/sales/not-existing-sale-id", {
      token: adminLogin.token,
    });

    assert(missingSale.status === 404, "Missing sale view returns 404");

    const finalHealth = await request("/health");

    assert(finalHealth.status === 200, "Final health endpoint returns 200");
    assert(finalHealth.body?.data?.status === "healthy", "Final backend status is healthy");

    console.log("\nPHASE 8 FINAL SALES / POS TEST PASSED");
    console.log("-------------------------------------");
    console.log("Verified: create sale, stock deduction, serialized outbound, list/view, cancel restore, quotation conversion, permissions, and health.");
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
  console.error("\nPHASE 8 FINAL SALES / POS TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
