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

  const expectedList = Array.isArray(expected) ? expected : [expected];

  assert(
    expectedList.includes(result.status),
    `${label} => ${path} expected ${expectedList.join("/")} got ${result.status}`,
    result.body
  );

  return result;
};

const assertSuccessData = (body, label) => {
  assert(body?.success === true, `${label} success true`, body);
  assert(Boolean(body?.data), `${label} data returned`, body);
};

const main = async () => {
  console.log("\nPHASE 14L-F: Suppliers / PO / Receiving / Stock Transfer Regression");
  console.log("-------------------------------------------------------------------");

  const superOwner = await login("SUPER_OWNER", accounts.superOwner);
  const admin = await login("ADMIN", accounts.admin);
  const technician = await login("TECHNICIAN", accounts.technician);

  console.log("\n--- No Token Guard Tests ---");

  await expectStatus({
    label: "No token blocked from suppliers",
    path: "/suppliers?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from purchase orders",
    path: "/purchase-orders?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from purchase receivings",
    path: "/purchase-receivings?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from stock transfers",
    path: "/stock-transfers?limit=5",
    expected: 401,
  });

  console.log("\n--- SUPER_OWNER Access Tests ---");

  const superSuppliers = await expectStatus({
    label: "SUPER_OWNER can access suppliers",
    path: "/suppliers?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superSuppliers.body, "SUPER_OWNER suppliers");

  const superPurchaseOrders = await expectStatus({
    label: "SUPER_OWNER can access purchase orders",
    path: "/purchase-orders?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superPurchaseOrders.body, "SUPER_OWNER purchase orders");

  const superPurchaseReceivings = await expectStatus({
    label: "SUPER_OWNER can access purchase receivings",
    path: "/purchase-receivings?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superPurchaseReceivings.body, "SUPER_OWNER purchase receivings");

  const superStockTransfers = await expectStatus({
    label: "SUPER_OWNER can access stock transfers",
    path: "/stock-transfers?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superStockTransfers.body, "SUPER_OWNER stock transfers");

  console.log("\n--- ADMIN Access Tests ---");

  const adminSuppliers = await expectStatus({
    label: "ADMIN can access suppliers",
    path: "/suppliers?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminSuppliers.body, "ADMIN suppliers");

  const adminPurchaseOrders = await expectStatus({
    label: "ADMIN can access purchase orders",
    path: "/purchase-orders?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminPurchaseOrders.body, "ADMIN purchase orders");

  const adminPurchaseReceivings = await expectStatus({
    label: "ADMIN can access purchase receivings",
    path: "/purchase-receivings?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminPurchaseReceivings.body, "ADMIN purchase receivings");

  const adminStockTransfers = await expectStatus({
    label: "ADMIN can access stock transfers",
    path: "/stock-transfers?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminStockTransfers.body, "ADMIN stock transfers");

  console.log("\n--- TECHNICIAN Access Safety Tests ---");

  const techSuppliers = await expectStatus({
    label: "TECHNICIAN suppliers endpoint returns allowed safe status",
    path: "/suppliers?limit=5",
    token: technician.token,
    expected: [200, 403],
  });

  if (techSuppliers.status === 200) {
    assertSuccessData(techSuppliers.body, "TECHNICIAN suppliers");
  } else {
    console.log("INFO: TECHNICIAN is restricted from suppliers, status 403");
  }

  const techPurchaseOrders = await expectStatus({
    label: "TECHNICIAN purchase orders endpoint returns allowed safe status",
    path: "/purchase-orders?limit=5",
    token: technician.token,
    expected: [200, 403],
  });

  if (techPurchaseOrders.status === 200) {
    assertSuccessData(techPurchaseOrders.body, "TECHNICIAN purchase orders");
  } else {
    console.log("INFO: TECHNICIAN is restricted from purchase orders, status 403");
  }

  const techPurchaseReceivings = await expectStatus({
    label: "TECHNICIAN purchase receivings endpoint returns allowed safe status",
    path: "/purchase-receivings?limit=5",
    token: technician.token,
    expected: [200, 403],
  });

  if (techPurchaseReceivings.status === 200) {
    assertSuccessData(techPurchaseReceivings.body, "TECHNICIAN purchase receivings");
  } else {
    console.log("INFO: TECHNICIAN is restricted from purchase receivings, status 403");
  }

  const techStockTransfers = await expectStatus({
    label: "TECHNICIAN stock transfers endpoint returns allowed safe status",
    path: "/stock-transfers?limit=5",
    token: technician.token,
    expected: [200, 403],
  });

  if (techStockTransfers.status === 200) {
    assertSuccessData(techStockTransfers.body, "TECHNICIAN stock transfers");
  } else {
    console.log("INFO: TECHNICIAN is restricted from stock transfers, status 403");
  }

  console.log("\n--- Status Filter Sanity Tests ---");

  const supplierStatusTest = await expectStatus({
    label: "ADMIN suppliers status filter works",
    path: "/suppliers?status=ACTIVE&limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(supplierStatusTest.body, "ADMIN suppliers status filter");

  const purchaseOrderStatusTest = await expectStatus({
    label: "ADMIN purchase orders status filter works",
    path: "/purchase-orders?status=DRAFT&limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(purchaseOrderStatusTest.body, "ADMIN purchase orders status filter");

  const purchaseReceivingStatusTest = await expectStatus({
    label: "ADMIN purchase receivings status filter works",
    path: "/purchase-receivings?status=DRAFT&limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(purchaseReceivingStatusTest.body, "ADMIN purchase receivings status filter");

  const stockTransferStatusTest = await expectStatus({
    label: "ADMIN stock transfers status filter works",
    path: "/stock-transfers?status=DRAFT&limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(stockTransferStatusTest.body, "ADMIN stock transfers status filter");

  console.log("\n--- Health Test ---");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200", health.body);
  assert(health.body?.data?.status === "healthy", "Backend status is healthy", health.body);

  console.log("\nPHASE 14L-F SUPPLIERS / PO / RECEIVING / STOCK TRANSFER REGRESSION TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 14L-F SUPPLIERS / PO / RECEIVING / STOCK TRANSFER REGRESSION TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
