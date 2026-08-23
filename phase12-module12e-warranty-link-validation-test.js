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

const createClaim = async (token, body) => {
  return request("/warranty-claims", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
};

const main = async () => {
  console.log("\nPHASE 12 MODULE 12E: Warranty Link Validation Test");
  console.log("--------------------------------------------------");

  const adminLogin = await login(users.admin);
  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.warrantyClaim.deleteMany({
    where: {
      branchId,
    },
  });

  assert(true, "Previous warranty link validation test data cleared");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const otherCustomer = await prisma.customer.upsert({
    where: {
      branchId_customerCode: {
        branchId,
        customerCode: "WTEST-12E-CUST",
      },
    },
    update: {
      fullName: "Warranty Test Other Customer",
      status: "ACTIVE",
    },
    create: {
      branchId,
      customerCode: "WTEST-12E-CUST",
      fullName: "Warranty Test Other Customer",
      mobileNumber: "09170001212",
      status: "ACTIVE",
    },
  });

  assert(Boolean(otherCustomer), "Other active customer ready");

  const item = await prisma.item.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(item), "Active item found");

  const otherItem = await prisma.item.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
      id: {
        not: item.id,
      },
    },
  });

  if (otherItem) {
    assert(otherItem.id !== item.id, "Other active item found");
  } else {
    console.log("SKIP NOTE: No second active item found. Item mismatch test will be skipped.");
  }

  const serial = await prisma.itemSerial.findFirst({
    where: {
      branchId,
      itemId: item.id,
    },
  });

  if (serial) {
    assert(serial.itemId === item.id, "Serial for selected item found");
  } else {
    console.log("SKIP NOTE: No serial found for selected item. Serial mismatch test will be skipped.");
  }

  const saleWithItems = await prisma.sale.findFirst({
    where: {
      branchId,
      status: {
        not: "CANCELLED",
      },
      items: {
        some: {},
      },
    },
    include: {
      items: true,
    },
  });

  if (!saleWithItems || saleWithItems.items.length === 0) {
    console.log("SKIP NOTE: No sale with sale items found. Sale link tests will be skipped.");
  } else {
    assert(Boolean(saleWithItems.id), "Sale with sale items found");
  }

  const saleItem = saleWithItems?.items?.[0] || null;

  const secondSale = saleWithItems
    ? await prisma.sale.findFirst({
        where: {
          branchId,
          status: {
            not: "CANCELLED",
          },
          id: {
            not: saleWithItems.id,
          },
          items: {
            some: {},
          },
        },
        include: {
          items: true,
        },
      })
    : null;

  if (saleItem) {
    const validFromSaleItem = await createClaim(adminLogin.token, {
      saleItemId: saleItem.id,
      issueDescription: "12E valid claim auto-resolved from sale item",
    });

    if (validFromSaleItem.status !== 201) {
      console.dir(validFromSaleItem.body, { depth: null });
    }

    assert(validFromSaleItem.status === 201, "Valid saleItemId claim is accepted");
    assert(validFromSaleItem.body.data.sale.id === saleWithItems.id, "saleId auto-resolved from sale item");
    assert(validFromSaleItem.body.data.saleItem.id === saleItem.id, "saleItem linked");

    if (saleItem.itemId) {
      assert(validFromSaleItem.body.data.item.id === saleItem.itemId, "item auto-resolved from sale item");
    }

    if (saleItem.serialId) {
      assert(validFromSaleItem.body.data.serial.id === saleItem.serialId, "serial auto-resolved from sale item");
    }
  }

  if (saleItem && secondSale) {
    const saleMismatch = await createClaim(adminLogin.token, {
      saleId: secondSale.id,
      saleItemId: saleItem.id,
      issueDescription: "12E sale and sale item mismatch test",
    });

    assert(saleMismatch.status === 400, "saleId and saleItemId mismatch is blocked");
  } else {
    console.log("SKIP: Need two sales with items for saleId + saleItemId mismatch test");
  }

  const saleWithCustomer = await prisma.sale.findFirst({
    where: {
      branchId,
      status: {
        not: "CANCELLED",
      },
      customerId: {
        not: null,
      },
    },
  });

  if (saleWithCustomer && saleWithCustomer.customerId !== otherCustomer.id) {
    const customerSaleMismatch = await createClaim(adminLogin.token, {
      customerId: otherCustomer.id,
      saleId: saleWithCustomer.id,
      issueDescription: "12E customer and sale mismatch test",
    });

    assert(customerSaleMismatch.status === 400, "customerId and sale customer mismatch is blocked");
  } else {
    console.log("SKIP: No sale with different linked customer found for customer-sale mismatch test");
  }

  if (saleItem && saleWithItems.customerId && saleWithItems.customerId !== otherCustomer.id) {
    const customerSaleItemMismatch = await createClaim(adminLogin.token, {
      customerId: otherCustomer.id,
      saleItemId: saleItem.id,
      issueDescription: "12E customer and sale item mismatch test",
    });

    assert(customerSaleItemMismatch.status === 400, "customerId and saleItem sale customer mismatch is blocked");
  } else {
    console.log("SKIP: Sale item sale has no different customer for customer-saleItem mismatch test");
  }

  if (serial && otherItem) {
    const serialItemMismatch = await createClaim(adminLogin.token, {
      itemId: otherItem.id,
      serialId: serial.id,
      issueDescription: "12E serial and item mismatch test",
    });

    assert(serialItemMismatch.status === 400, "serialId and itemId mismatch is blocked");
  } else {
    console.log("SKIP: Need serial and second item for serial-item mismatch test");
  }

  if (saleItem?.itemId && otherItem && saleItem.itemId !== otherItem.id) {
    const saleItemItemMismatch = await createClaim(adminLogin.token, {
      itemId: otherItem.id,
      saleItemId: saleItem.id,
      issueDescription: "12E sale item and item mismatch test",
    });

    assert(saleItemItemMismatch.status === 400, "saleItemId and itemId mismatch is blocked");
  } else {
    console.log("SKIP: Need sale item with different second item for saleItem-item mismatch test");
  }

  if (saleItem?.serialId && serial && saleItem.serialId !== serial.id) {
    const saleItemSerialMismatch = await createClaim(adminLogin.token, {
      serialId: serial.id,
      saleItemId: saleItem.id,
      issueDescription: "12E sale item and serial mismatch test",
    });

    assert(saleItemSerialMismatch.status === 400, "saleItemId and serialId mismatch is blocked");
  } else {
    console.log("SKIP: Need sale item serial different from available serial for saleItem-serial mismatch test");
  }

  const basicValid = await createClaim(adminLogin.token, {
    customerId: customer.id,
    itemId: item.id,
    issueDescription: "12E basic valid warranty link test",
  });

  if (basicValid.status !== 201) {
    console.dir(basicValid.body, { depth: null });
  }

  assert(basicValid.status === 201, "Basic valid warranty link claim still works");
  assert(basicValid.body.data.customer.id === customer.id, "Basic claim customer linked");
  assert(basicValid.body.data.item.id === item.id, "Basic claim item linked");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 12 MODULE 12E WARRANTY LINK VALIDATION TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 12 MODULE 12E WARRANTY LINK VALIDATION TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
