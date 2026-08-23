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

  return result.body.data.token;
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const hasUnitCost = (batch) => {
  return Object.prototype.hasOwnProperty.call(batch, "unitCost");
};

const main = async () => {
  console.log("\nPhase 6 Module 3: Inventory API Test");
  console.log("------------------------------------");

  const superToken = await login(users.superOwner);
  const adminToken = await login(users.admin);
  const techToken = await login(users.technician);

  const noToken = await request("/inventory/overview");
  assert(noToken.status === 401, "Inventory overview blocks missing token");

  const superOverview = await request("/inventory/overview", {
    token: superToken,
  });

  assert(superOverview.status === 200, "Super Owner can view inventory overview");
  assert(superOverview.body.data.data.length >= 7, "Super Owner sees seeded inventory items");

  const adminOverview = await request("/inventory/overview", {
    token: adminToken,
  });

  assert(adminOverview.status === 200, "Admin can view inventory overview");
  assert(
    adminOverview.body.data.data.every((item) => item.branch.code === "MAIN"),
    "Admin sees only own branch inventory overview"
  );

  const techOverview = await request("/inventory/overview", {
    token: techToken,
  });

  assert(techOverview.status === 200, "Technician can view inventory overview");
  assert(
    techOverview.body.data.data.every((item) => item.branch.code === "MAIN"),
    "Technician sees only own branch inventory overview"
  );

  const superBatches = await request("/inventory/batches", {
    token: superToken,
  });

  assert(superBatches.status === 200, "Super Owner can view inventory batches");
  assert(superBatches.body.data.data.length >= 7, "Super Owner sees seeded batches");
  assert(hasUnitCost(superBatches.body.data.data[0]), "Super Owner can see unitCost");

  const adminBatches = await request("/inventory/batches", {
    token: adminToken,
  });

  assert(adminBatches.status === 200, "Admin can view inventory batches");
  assert(
    adminBatches.body.data.data.every((batch) => batch.branch.code === "MAIN"),
    "Admin sees own branch batches only"
  );
  assert(hasUnitCost(adminBatches.body.data.data[0]), "Admin can see unitCost");

  const techBatches = await request("/inventory/batches", {
    token: techToken,
  });

  assert(techBatches.status === 200, "Technician can view inventory batches");
  assert(
    techBatches.body.data.data.every((batch) => batch.branch.code === "MAIN"),
    "Technician sees own branch batches only"
  );
  assert(!hasUnitCost(techBatches.body.data.data[0]), "Technician cannot see unitCost");

  const superSerials = await request("/inventory/serials", {
    token: superToken,
  });

  assert(superSerials.status === 200, "Super Owner can view serials");
  assert(superSerials.body.data.data.length >= 15, "Super Owner sees seeded serials");

  const adminSerials = await request("/inventory/serials", {
    token: adminToken,
  });

  assert(adminSerials.status === 200, "Admin can view serials");
  assert(
    adminSerials.body.data.data.every((serial) => serial.branch.code === "MAIN"),
    "Admin sees own branch serials only"
  );

  const serialSearch = await request("/inventory/serials?search=SN-MAIN-KNV2", {
    token: adminToken,
  });

  assert(serialSearch.status === 200, "Serial search works");
  assert(serialSearch.body.data.data.length >= 1, "Serial search returns matching rows");

  const batchSearch = await request("/inventory/batches?search=BATCH-MAIN", {
    token: adminToken,
  });

  assert(batchSearch.status === 200, "Batch search works");
  assert(batchSearch.body.data.data.length >= 1, "Batch search returns matching rows");

  const overviewSearch = await request("/inventory/overview?search=Ryzen", {
    token: superToken,
  });

  assert(overviewSearch.status === 200, "Overview search works");
  assert(
    overviewSearch.body.data.data.some((item) => item.itemName.includes("Ryzen")),
    "Overview search returns Ryzen item"
  );

  const invalidBoolean = await request("/inventory/overview?lowStockOnly=maybe", {
    token: superToken,
  });

  assert(invalidBoolean.status === 400, "Invalid boolean filter is blocked");

  console.log("\nPHASE 6 MODULE 3 INVENTORY API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 6 MODULE 3 INVENTORY API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});


