require("dotenv").config();

const BASE_URL = "http://localhost:5000/api";

const accounts = {
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
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
};

const assert = (condition, message, details = null) => {
  if (!condition) {
    if (details) {
      console.dir(details, { depth: null });
    }

    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const login = async (label, credentials) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: credentials,
  });

  assert(result.status === 200, `${label} login status 200`, result.body);
  assert(Boolean(result.body?.data?.token), `${label} token returned`, result.body);

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const expectStatus = async ({ label, path, token, expected }) => {
  const result = await request(path, { token });

  assert(
    result.status === expected,
    `${label} => ${path} expected ${expected}, got ${result.status}`,
    result.body
  );

  return result;
};

const assertListLike = (body, label) => {
  assert(body?.success === true, `${label} success true`, body);
  assert(Boolean(body?.data), `${label} data returned`, body);
};

const main = async () => {
  console.log("\nPHASE 14L-C: Catalog / Inventory Regression");
  console.log("-------------------------------------------");

  const superOwner = await login("SUPER_OWNER", accounts.superOwner);
  const admin = await login("ADMIN", accounts.admin);
  const technician = await login("TECHNICIAN", accounts.technician);

  console.log("\n--- No Token Guard Tests ---");

  await expectStatus({
    label: "No token blocked from units",
    path: "/units?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from item categories",
    path: "/item-categories?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from items",
    path: "/items?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from inventory overview",
    path: "/inventory/overview?limit=5",
    expected: 401,
  });

  console.log("\n--- SUPER_OWNER Catalog / Inventory Access ---");

  const superUnits = await expectStatus({
    label: "SUPER_OWNER can access units",
    path: "/units?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertListLike(superUnits.body, "SUPER_OWNER units");

  const superCategories = await expectStatus({
    label: "SUPER_OWNER can access item categories",
    path: "/item-categories?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertListLike(superCategories.body, "SUPER_OWNER item categories");

  const superItems = await expectStatus({
    label: "SUPER_OWNER can access items",
    path: "/items?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertListLike(superItems.body, "SUPER_OWNER items");

  const superInventoryOverview = await expectStatus({
    label: "SUPER_OWNER can access inventory overview",
    path: "/inventory/overview?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertListLike(superInventoryOverview.body, "SUPER_OWNER inventory overview");

  console.log("\n--- ADMIN Catalog / Inventory Access ---");

  const adminUnits = await expectStatus({
    label: "ADMIN can access units",
    path: "/units?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertListLike(adminUnits.body, "ADMIN units");

  const adminCategories = await expectStatus({
    label: "ADMIN can access item categories",
    path: "/item-categories?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertListLike(adminCategories.body, "ADMIN item categories");

  const adminItems = await expectStatus({
    label: "ADMIN can access items",
    path: "/items?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertListLike(adminItems.body, "ADMIN items");

  const adminInventoryOverview = await expectStatus({
    label: "ADMIN can access inventory overview",
    path: "/inventory/overview?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertListLike(adminInventoryOverview.body, "ADMIN inventory overview");

  console.log("\n--- TECHNICIAN Operational Catalog / Inventory Access ---");

  const techCategories = await expectStatus({
    label: "TECHNICIAN can access item categories",
    path: "/item-categories?limit=5",
    token: technician.token,
    expected: 200,
  });
  assertListLike(techCategories.body, "TECHNICIAN item categories");

  const techItems = await expectStatus({
    label: "TECHNICIAN can access items",
    path: "/items?limit=5",
    token: technician.token,
    expected: 200,
  });
  assertListLike(techItems.body, "TECHNICIAN items");

  const techInventoryOverview = await expectStatus({
    label: "TECHNICIAN can access inventory overview",
    path: "/inventory/overview?limit=5",
    token: technician.token,
    expected: 200,
  });
  assertListLike(techInventoryOverview.body, "TECHNICIAN inventory overview");

  console.log("\n--- Inventory Subroute Sanity Tests ---");

  const inventoryPathsToTry = [
    "/inventory/batches?limit=5",
    "/inventory/serials?limit=5",
    "/inventory/movements?limit=5",
  ];

  for (const path of inventoryPathsToTry) {
    const result = await request(path, {
      token: admin.token,
    });

    assert(
      [200, 404].includes(result.status),
      `ADMIN inventory subroute ${path} returns safe status 200 or 404, got ${result.status}`,
      result.body
    );

    console.log(`INFO: ${path} returned ${result.status}`);
  }

  console.log("\n--- Health Test ---");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200", health.body);
  assert(health.body?.data?.status === "healthy", "Backend status is healthy", health.body);

  console.log("\nPHASE 14L-C CATALOG / INVENTORY REGRESSION TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 14L-C CATALOG / INVENTORY REGRESSION TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
