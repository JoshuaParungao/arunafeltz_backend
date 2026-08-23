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

const hasOwn = (object, key) => {
  return Object.prototype.hasOwnProperty.call(object, key);
};

const main = async () => {
  console.log("\nPhase 7 Module 3: List/View Quotation API Test");
  console.log("----------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const overview = await request("/inventory/overview?search=Ryzen", {
    token: adminLogin.token,
  });

  assert(overview.status === 200, "Admin can load item for quotation setup");

  const item = overview.body.data.data.find((row) =>
    row.itemName.includes("Ryzen")
  );

  assert(Boolean(item), "Quotation setup item found");

  const createQuotation = await request("/quotations", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      title: "Phase 7 Module 3 List View Test",
      notes: "Searchable quotation note.",
      internalNotes: "Admin-only internal note.",
      isPcBuild: true,
      items: [
        {
          itemId: item.id,
          priceTier: 1,
          quantity: 1,
          discountAmount: 0,
          isPcBuildPart: true,
        },
      ],
    }),
  });

  assert(createQuotation.status === 201, "Setup quotation created");

  const quotationId = createQuotation.body.data.id;
  const quotationCode = createQuotation.body.data.quotationCode;

  const noTokenList = await request("/quotations");

  assert(noTokenList.status === 401, "Quotation list blocks missing token");

  const adminList = await request("/quotations", {
    token: adminLogin.token,
  });

  assert(adminList.status === 200, "Admin can list quotations");
  assert(adminList.body.data.data.length >= 1, "Admin quotation list has rows");
  assert(
    adminList.body.data.data.every((quotation) => quotation.branch.code === "MAIN"),
    "Admin quotation list is own branch only"
  );
  assert(hasOwn(adminList.body.data.data[0], "internalNotes"), "Admin can see internalNotes in list");

  const techList = await request("/quotations", {
    token: techLogin.token,
  });

  assert(techList.status === 200, "Technician can list quotations");
  assert(
    techList.body.data.data.every((quotation) => quotation.branch.code === "MAIN"),
    "Technician quotation list is own branch only"
  );
  assert(!hasOwn(techList.body.data.data[0], "internalNotes"), "Technician cannot see internalNotes in list");

  const superList = await request("/quotations", {
    token: superLogin.token,
  });

  assert(superList.status === 200, "Super Owner can list quotations");
  assert(superList.body.data.data.length >= 1, "Super Owner quotation list has rows");

  const searchList = await request(`/quotations?search=${encodeURIComponent(quotationCode)}`, {
    token: adminLogin.token,
  });

  assert(searchList.status === 200, "Quotation search works");
  assert(
    searchList.body.data.data.some((quotation) => quotation.id === quotationId),
    "Quotation search returns created quotation"
  );

  const statusFilter = await request("/quotations?status=DRAFT", {
    token: adminLogin.token,
  });

  assert(statusFilter.status === 200, "Quotation status filter works");
  assert(
    statusFilter.body.data.data.every((quotation) => quotation.status === "DRAFT"),
    "Quotation status filter returns DRAFT only"
  );

  const pagination = await request("/quotations?page=1&limit=2", {
    token: superLogin.token,
  });

  assert(pagination.status === 200, "Quotation pagination works");
  assert(pagination.body.data.data.length <= 2, "Quotation pagination limit respected");
  assert(pagination.body.data.pagination.page === 1, "Quotation pagination page returned");

  const adminView = await request(`/quotations/${quotationId}`, {
    token: adminLogin.token,
  });

  assert(adminView.status === 200, "Admin can view quotation detail");
  assert(adminView.body.data.id === quotationId, "Admin viewed correct quotation");
  assert(adminView.body.data.items.length >= 1, "Quotation detail includes items");
  assert(hasOwn(adminView.body.data, "internalNotes"), "Admin can see internalNotes in detail");

  const techView = await request(`/quotations/${quotationId}`, {
    token: techLogin.token,
  });

  assert(techView.status === 200, "Technician can view own branch quotation detail");
  assert(techView.body.data.id === quotationId, "Technician viewed correct quotation");
  assert(techView.body.data.items.length >= 1, "Technician quotation detail includes items");
  assert(!hasOwn(techView.body.data, "internalNotes"), "Technician cannot see internalNotes in detail");

  const superView = await request(`/quotations/${quotationId}`, {
    token: superLogin.token,
  });

  assert(superView.status === 200, "Super Owner can view quotation detail");
  assert(superView.body.data.id === quotationId, "Super Owner viewed correct quotation");

  const missingQuotation = await request("/quotations/not-existing-quotation-id", {
    token: adminLogin.token,
  });

  assert(missingQuotation.status === 404, "Missing quotation returns 404");

  console.log("\nPHASE 7 MODULE 3 LIST/VIEW QUOTATION API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 7 MODULE 3 LIST/VIEW QUOTATION API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
