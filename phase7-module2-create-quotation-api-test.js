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
  console.log("\nPhase 7 Module 2: Create Quotation API Test");
  console.log("-------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load item for quotation test");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Quotation test item found");

  const noToken = await request("/quotations", {
    method: "POST",
    body: JSON.stringify({}),
  });

  assert(noToken.status === 401, "Create quotation blocks missing token");

  const invalidNoItems = await request("/quotations", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Invalid quotation no items",
      items: [],
    }),
  });

  assert(invalidNoItems.status === 400, "Create quotation blocks empty items");

  const staffCustomPriceBlocked = await request("/quotations", {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      title: "Staff custom price should fail",
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          unitPrice: 1,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(staffCustomPriceBlocked.status === 403, "Staff custom price for inventory item is blocked");

  const adminQuotation = await request("/quotations", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Module 2 Admin Quotation",
      notes: "API test quotation.",
      internalNotes: "Internal test note.",
      isPcBuild: true,
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 2,
          discountAmount: 100,
          isPcBuildPart: true,
          remarks: "Processor line.",
        },
        {
          description: "Custom assembly labor",
          priceTier: 1,
          quantity: 1,
          unitPrice: 500,
          discountAmount: 0,
          isPcBuildPart: false,
          remarks: "Custom non-inventory line.",
        },
      ],
    }),
  });

  assert(adminQuotation.status === 201, "Admin can create quotation");
  assert(adminQuotation.body.data.quotationCode.startsWith("QT-MAIN-"), "Quotation code generated for MAIN branch");
  assert(adminQuotation.body.data.status === "DRAFT", "Quotation status is DRAFT");
  assert(adminQuotation.body.data.items.length === 2, "Quotation created with two items");
  assert(Number(adminQuotation.body.data.subtotal) > 0, "Quotation subtotal computed");
  assert(Number(adminQuotation.body.data.totalDiscount) === 100, "Quotation total discount computed");
  assert(Number(adminQuotation.body.data.grandTotal) === Number(adminQuotation.body.data.subtotal) - 100, "Quotation grand total computed");
  assert(adminQuotation.body.data.items[0].itemCodeSnapshot === item.itemCode, "Inventory item snapshot saved");
  assert(adminQuotation.body.data.items[1].description === "Custom assembly labor", "Custom line saved");

  const discountBlocked = await request("/quotations", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Discount too high should fail",
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 999999,
        },
      ],
    }),
  });

  assert(discountBlocked.status === 400, "Discount greater than line total is blocked");

  const superQuotation = await request("/quotations", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId: item.branch.id,
      title: "Phase 7 Module 2 Super Owner Quotation",
      items: [
        {
          itemId: item.id,
          priceTier: 2,
          quantity: 1,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(superQuotation.status === 201, "Super Owner can create quotation with branchId");
  assert(superQuotation.body.data.branch.code === "MAIN", "Super Owner quotation branch is MAIN");

  const superMissingBranch = await request("/quotations", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      title: "Super Owner missing branch should fail",
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 0,
        },
      ],
    }),
  });

  assert(superMissingBranch.status === 400, "Super Owner quotation requires branchId");

  console.log("\nPHASE 7 MODULE 2 CREATE QUOTATION API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 7 MODULE 2 CREATE QUOTATION API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
