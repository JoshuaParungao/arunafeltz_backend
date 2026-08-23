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
  console.log("\nPhase 8 Module 4: Serialized Sale Outbound Test");
  console.log("-----------------------------------------------");

  const adminLogin = await login(users.admin);

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load item for serialized sale test");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Serialized sale test item found");

  const dbItem = await prisma.item.findUnique({
    where: {
      id: item.id,
    },
  });

  assert(Boolean(dbItem), "DB item found");

  const originalIsSerialized = dbItem.isSerialized;
  const batchCode = `BATCH-PHASE8-M4-SERIAL-${unique}`;
  const serialNumber = `SN-PHASE8-M4-${unique}`;

  let batch = null;
  let serial = null;

  try {
    await prisma.item.update({
      where: {
        id: dbItem.id,
      },
      data: {
        isSerialized: true,
      },
    });

    batch = await prisma.inventoryBatch.create({
      data: {
        batchCode,
        quantityIn: "2.00",
        quantityAvailable: "2.00",
        unitCost: dbItem.costPrice,
        sellingPrice1: dbItem.price1,
        sellingPrice2: dbItem.price2,
        sellingPrice3: dbItem.price3,
        sellingPrice4: dbItem.price4,
        sellingPrice5: dbItem.price5,
        supplierName: "Phase 8 Module 4 Test",
        referenceNo: `PHASE8-M4-${unique}`,
        remarks: "Temporary batch for serialized sale outbound test.",
        branchId: item.branch.id,
        itemId: dbItem.id,
        createdById: adminLogin.user.id,
        updatedById: adminLogin.user.id,
      },
    });

    serial = await prisma.itemSerial.create({
      data: {
        serialNumber,
        status: "AVAILABLE",
        branchId: item.branch.id,
        itemId: dbItem.id,
        batchId: batch.id,
        createdById: adminLogin.user.id,
        updatedById: adminLogin.user.id,
      },
    });

    assert(Boolean(batch.id), "Temporary serialized batch created");
    assert(Boolean(serial.id), "Temporary AVAILABLE serial created");

    const missingSerialSale = await request("/sales", {
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
            amount: 20000,
          },
        ],
      }),
    });

    assert(missingSerialSale.status === 400, "Serialized item requires serialId");

    const quantityTwoSale = await request("/sales", {
      method: "POST",
      token: adminLogin.token,
      body: JSON.stringify({
        items: [
          {
            itemId: dbItem.id,
            serialId: serial.id,
            priceTier: 1,
            quantity: 2,
            discountAmount: 0,
          },
        ],
        payments: [
          {
            paymentMethod: "CASH",
            amount: 40000,
          },
        ],
      }),
    });

    assert(quantityTwoSale.status === 400, "Serialized item quantity greater than 1 is blocked");

    const sale = await request("/sales", {
      method: "POST",
      token: adminLogin.token,
      body: JSON.stringify({
        remarks: "Phase 8 Module 4 serialized outbound sale.",
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

    assert(sale.status === 201, "Serialized item sale created");
    assert(sale.body.data.items.length === 1, "Sale contains one serialized item");
    assert(sale.body.data.items[0].serialId === serial.id, "Sale item linked to serial");
    assert(sale.body.data.items[0].batchId === batch.id, "Sale item linked to serial batch");

    const updatedBatch = await prisma.inventoryBatch.findUnique({
      where: {
        id: batch.id,
      },
    });

    assert(Number(updatedBatch.quantityAvailable) === 1, "Batch quantity deducted from 2 to 1");

    const updatedSerial = await prisma.itemSerial.findUnique({
      where: {
        id: serial.id,
      },
    });

    assert(updatedSerial.status === "SOLD", "Serial status updated to SOLD");

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

    assert(Boolean(movement), "SALE_OUT inventory movement created with serialId");
    assert(Number(movement.quantity) === 1, "Movement quantity is 1");
    assert(Number(movement.previousQuantity) === 2, "Movement previous quantity is 2");
    assert(Number(movement.newQuantity) === 1, "Movement new quantity is 1");

    const reuseSoldSerial = await request("/sales", {
      method: "POST",
      token: adminLogin.token,
      body: JSON.stringify({
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

    assert(reuseSoldSerial.status === 400, "Sold serial cannot be reused");

    console.log("\nPHASE 8 MODULE 4 SERIALIZED SALE OUTBOUND TEST PASSED");
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
  console.error("\nPHASE 8 MODULE 4 SERIALIZED SALE OUTBOUND TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
