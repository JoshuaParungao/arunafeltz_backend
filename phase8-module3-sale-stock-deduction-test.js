require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";
const unique = Date.now();

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

const main = async () => {
  console.log("\nPhase 8 Module 3: Sale Stock Deduction Test");
  console.log("-------------------------------------------");

  const adminLogin = await login(users.admin);

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load item for stock deduction test");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Stock deduction test item found");

  const dbItem = await prisma.item.findUnique({
    where: {
      id: item.id,
    },
  });

  assert(Boolean(dbItem), "DB item found");

  const originalIsSerialized = dbItem.isSerialized;
  const batchCode = `BATCH-PHASE8-M3-NON-SERIAL-${unique}`;

  let batch = null;

  try {
    await prisma.item.update({
      where: {
        id: dbItem.id,
      },
      data: {
        isSerialized: false,
      },
    });

    batch = await prisma.inventoryBatch.create({
      data: {
        batchCode,
        quantityIn: "5.00",
        quantityAvailable: "5.00",
        unitCost: dbItem.costPrice,
        sellingPrice1: dbItem.price1,
        sellingPrice2: dbItem.price2,
        sellingPrice3: dbItem.price3,
        sellingPrice4: dbItem.price4,
        sellingPrice5: dbItem.price5,
        supplierName: "Phase 8 Module 3 Test",
        referenceNo: `PHASE8-M3-${unique}`,
        remarks: "Temporary batch for non-serialized stock deduction test.",
        branchId: item.branch.id,
        itemId: dbItem.id,
        createdById: adminLogin.user.id,
        updatedById: adminLogin.user.id,
      },
    });

    assert(Boolean(batch.id), "Temporary test batch created");

    const missingBatchSale = await request("/sales", {
      method: "POST",
      token: adminLogin.token,
      body: JSON.stringify({
        items: [
          {
            itemId: dbItem.id,
            priceTier: 1,
            quantity: 1,
            discountAmount: 0,
          },
        ],
        payments: [
          {
            paymentMethod: "CASH",
            amount: 10000,
          },
        ],
      }),
    });

    assert(missingBatchSale.status === 400, "Non-serialized item requires batchId");

    const insufficientSale = await request("/sales", {
      method: "POST",
      token: adminLogin.token,
      body: JSON.stringify({
        items: [
          {
            itemId: dbItem.id,
            batchId: batch.id,
            priceTier: 1,
            quantity: 999,
            discountAmount: 0,
          },
        ],
        payments: [
          {
            paymentMethod: "CASH",
            amount: 999999,
          },
        ],
      }),
    });

    assert(insufficientSale.status === 400, "Insufficient stock is blocked");

    const sale = await request("/sales", {
      method: "POST",
      token: adminLogin.token,
      body: JSON.stringify({
        remarks: "Phase 8 Module 3 non-serialized deduction sale.",
        items: [
          {
            itemId: dbItem.id,
            batchId: batch.id,
            priceTier: 1,
            quantity: 2,
            discountAmount: 0,
          },
          {
            description: "Custom labor no stock deduction",
            quantity: 1,
            unitPrice: 500,
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

    assert(sale.status === 201, "Sale with non-serialized item created");
    assert(sale.body.data.items.length === 2, "Sale contains inventory and custom line");
    assert(sale.body.data.items[0].batchId === batch.id, "Sale item linked to test batch");

    const updatedBatch = await prisma.inventoryBatch.findUnique({
      where: {
        id: batch.id,
      },
    });

    assert(Number(updatedBatch.quantityAvailable) === 3, "Batch quantity deducted from 5 to 3");

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

    assert(Boolean(movement), "SALE_OUT inventory movement created");
    assert(Number(movement.quantity) === 2, "Inventory movement quantity is 2");
    assert(Number(movement.previousQuantity) === 5, "Movement previous quantity is 5");
    assert(Number(movement.newQuantity) === 3, "Movement new quantity is 3");

    console.log("\nPHASE 8 MODULE 3 SALE STOCK DEDUCTION TEST PASSED");
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
  console.error("\nPHASE 8 MODULE 3 SALE STOCK DEDUCTION TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
