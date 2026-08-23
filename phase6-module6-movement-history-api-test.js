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

const hasUnitCost = (movement) => {
  return Object.prototype.hasOwnProperty.call(movement, "unitCost");
};

const main = async () => {
  console.log("\nPhase 6 Module 6: Movement History API Test");
  console.log("-------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const noToken = await request("/inventory/movements");

  assert(noToken.status === 401, "Movement history blocks missing token");

  const superMovements = await request("/inventory/movements", {
    token: superLogin.token,
  });

  assert(superMovements.status === 200, "Super Owner can view movement history");
  assert(superMovements.body.data.data.length >= 7, "Super Owner sees movement rows");
  assert(hasUnitCost(superMovements.body.data.data[0]), "Super Owner can see unitCost in movements");

  const adminMovements = await request("/inventory/movements", {
    token: adminLogin.token,
  });

  assert(adminMovements.status === 200, "Admin can view movement history");
  assert(
    adminMovements.body.data.data.every((movement) => movement.branch.code === "MAIN"),
    "Admin sees own branch movements only"
  );
  assert(hasUnitCost(adminMovements.body.data.data[0]), "Admin can see unitCost in movements");

  const techMovements = await request("/inventory/movements", {
    token: techLogin.token,
  });

  assert(techMovements.status === 200, "Technician can view movement history");
  assert(
    techMovements.body.data.data.every((movement) => movement.branch.code === "MAIN"),
    "Technician sees own branch movements only"
  );
  assert(!hasUnitCost(techMovements.body.data.data[0]), "Technician cannot see unitCost in movements");

  const searchMovements = await request("/inventory/movements?search=MODULE4", {
    token: adminLogin.token,
  });

  assert(searchMovements.status === 200, "Movement search works");
  assert(searchMovements.body.data.data.length >= 1, "Movement search returns MODULE4 rows");

  const stockInFilter = await request("/inventory/movements?type=STOCK_IN", {
    token: adminLogin.token,
  });

  assert(stockInFilter.status === 200, "Movement type filter works");
  assert(
    stockInFilter.body.data.data.every((movement) => movement.type === "STOCK_IN"),
    "Movement type filter returns STOCK_IN only"
  );

  const manualFilter = await request("/inventory/movements?source=MANUAL", {
    token: adminLogin.token,
  });

  assert(manualFilter.status === 200, "Movement source filter works");
  assert(
    manualFilter.body.data.data.every((movement) => movement.source === "MANUAL"),
    "Movement source filter returns MANUAL only"
  );

  const pagination = await request("/inventory/movements?page=1&limit=3", {
    token: superLogin.token,
  });

  assert(pagination.status === 200, "Movement pagination works");
  assert(pagination.body.data.data.length <= 3, "Movement pagination limit respected");
  assert(pagination.body.data.pagination.page === 1, "Movement pagination page returned");

  console.log("\nPHASE 6 MODULE 6 MOVEMENT HISTORY API TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 6 MODULE 6 MOVEMENT HISTORY API TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
