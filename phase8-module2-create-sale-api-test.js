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
  console.log("\nPhase 8 Module 2: Create Sale API Test");
  console.log("--------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const overview = await request("/inventory/overview?limit=100", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load item for sale test");

  const item = overview.body.data.data.find((row) => {
    return !row.isSerialized && Number(row.quantityAvailable) >= 3;
  });

  assert(Boolean(item), "Sale test item found");

  const batches = await request(
    `/inventory/batches?itemId=${encodeURIComponent(item.id)}&status=ACTIVE&limit=100`,
    { token: adminLogin.token }
  );

  const batch = batches.body?.data?.data?.find(
    (row) => Number(row.quantityAvailable) >= 3
  );

  assert(Boolean(batch), "Sale test item has an active batch with sufficient stock");

  const noToken = await request("/sales", {
    method: "POST",
    body: JSON.stringify({}),
  });

  assert(noToken.status === 401, "Create sale blocks missing token");

  const techCreateBlocked = await request("/sales", {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          batchId: batch.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 7500,
        },
      ],
    }),
  });

  assert(techCreateBlocked.status === 403, "Technician cannot create sale");

  const emptyItems = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 100,
        },
      ],
    }),
  });

  assert(emptyItems.status === 400, "Create sale blocks empty items");

  const emptyPayments = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          batchId: batch.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 0,
        },
      ],
      payments: [],
    }),
  });

  assert(emptyPayments.status === 400, "Create sale blocks empty payments");

  const missingPriceTier = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          quantity: 1,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 7500,
        },
      ],
    }),
  });

  assert(missingPriceTier.status === 400, "Inventory item requires price tier");

  const staffCustomPriceBlocked = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 999999,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 7500,
        },
      ],
    }),
  });

  assert(staffCustomPriceBlocked.status === 400, "Discount greater than line total is blocked");

  const adminSale = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      serviceCharge: 500,
      remarks: "Phase 8 Module 2 admin sale test.",
      items: [
        {
          itemId: item.id,
          batchId: batch.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 100,
        },
        {
          description: "Custom installation labor",
          quantity: 1,
          unitPrice: 600,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 9000,
          remarks: "Cash payment test.",
        },
      ],
    }),
  });

  if (adminSale.status !== 201) {
    console.dir(adminSale.body, { depth: null });
  }

  assert(adminSale.status === 201, "Admin can create sale");
  assert(adminSale.body.data.receiptCode.startsWith("RCPT-MAIN-"), "Receipt code generated for MAIN");
  assert(adminSale.body.data.status === "COMPLETED", "Sale status is COMPLETED");
  assert(adminSale.body.data.paymentStatus === "PAID", "Sale payment status is PAID");
  assert(adminSale.body.data.items.length === 2, "Sale has two items");
  assert(adminSale.body.data.payments.length === 1, "Sale has one payment");
  assert(adminSale.body.data.items[0].itemCodeSnapshot === item.itemCode, "Sale item snapshot saved");
  assert(Number(adminSale.body.data.serviceCharge) === 500, "Service charge saved");
  assert(Number(adminSale.body.data.totalDiscount) === 100, "Total discount computed");
  assert(Number(adminSale.body.data.grandTotal) > 0, "Grand total computed");
  assert(Number(adminSale.body.data.amountPaid) === 9000, "Amount paid computed");
  assert(Number(adminSale.body.data.changeAmount) >= 0, "Change amount computed");

  const partialSale = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          batchId: batch.id,
          priceTier: 1,
          quantity: 1,
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

  assert(partialSale.status === 201, "Admin can create partially paid sale");
  assert(partialSale.body.data.paymentStatus === "PARTIALLY_PAID", "Partial payment status computed");

  const superMissingBranch = await request("/sales", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 7500,
        },
      ],
    }),
  });

  assert(superMissingBranch.status === 400, "Super Owner sale requires branchId");

  const superSale = await request("/sales", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId: item.branch.id,
      remarks: "Phase 8 Module 2 super sale test.",
      items: [
        {
          itemId: item.id,
          batchId: batch.id,
          priceTier: 2,
          quantity: 1,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 8000,
        },
      ],
    }),
  });

  assert(superSale.status === 201, "Super Owner can create sale with branchId");
  assert(superSale.body.data.branch.code === "MAIN", "Super Owner sale branch is MAIN");

  console.log("\nPHASE 8 MODULE 2 CREATE SALE API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 8 MODULE 2 CREATE SALE API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
