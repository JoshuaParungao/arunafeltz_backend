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
  console.log("\nPHASE 14L-G: Reports / Audit Logs Regression");
  console.log("--------------------------------------------");

  const superOwner = await login("SUPER_OWNER", accounts.superOwner);
  const admin = await login("ADMIN", accounts.admin);
  const technician = await login("TECHNICIAN", accounts.technician);

  const reportEndpoints = [
    "/reports/inventory-summary?limit=5",
    "/reports/sales-summary?limit=5",
    "/reports/service-summary?limit=5",
    "/reports/warranty-summary?limit=5",
    "/reports/cash-summary?limit=5",
    "/reports/supplier-summary?limit=5",
    "/reports/purchase-order-summary?limit=5",
    "/reports/purchase-receiving-summary?limit=5",
    "/reports/stock-transfer-summary?limit=5",
    "/reports/alert-summary?limit=5",
  ];

  console.log("\n--- No Token Guard Tests ---");

  await expectStatus({
    label: "No token blocked from audit logs",
    path: "/audit-logs?limit=5",
    expected: 401,
  });

  for (const endpoint of reportEndpoints) {
    await expectStatus({
      label: "No token blocked from report",
      path: endpoint,
      expected: 401,
    });
  }

  console.log("\n--- SUPER_OWNER Reports / Audit Logs Access ---");

  const superAuditLogs = await expectStatus({
    label: "SUPER_OWNER can access audit logs",
    path: "/audit-logs?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superAuditLogs.body, "SUPER_OWNER audit logs");

  for (const endpoint of reportEndpoints) {
    const result = await expectStatus({
      label: "SUPER_OWNER can access report",
      path: endpoint,
      token: superOwner.token,
      expected: 200,
    });

    assertSuccessData(result.body, `SUPER_OWNER ${endpoint}`);
  }

  console.log("\n--- ADMIN Reports / Audit Logs Access ---");

  const adminAuditLogs = await expectStatus({
    label: "ADMIN can access audit logs",
    path: "/audit-logs?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminAuditLogs.body, "ADMIN audit logs");

  for (const endpoint of reportEndpoints) {
    const result = await expectStatus({
      label: "ADMIN can access report",
      path: endpoint,
      token: admin.token,
      expected: 200,
    });

    assertSuccessData(result.body, `ADMIN ${endpoint}`);
  }

  console.log("\n--- TECHNICIAN Restricted Access Tests ---");

  await expectStatus({
    label: "TECHNICIAN blocked from audit logs",
    path: "/audit-logs?limit=5",
    token: technician.token,
    expected: 403,
  });

  for (const endpoint of reportEndpoints) {
    await expectStatus({
      label: "TECHNICIAN blocked from report",
      path: endpoint,
      token: technician.token,
      expected: 403,
    });
  }

  console.log("\n--- Report Validation Sanity Tests ---");

  await expectStatus({
    label: "Invalid inventory summary lowStockOnly rejected",
    path: "/reports/inventory-summary?lowStockOnly=maybe",
    token: admin.token,
    expected: 400,
  });

  await expectStatus({
    label: "Invalid sales summary dateFrom rejected",
    path: "/reports/sales-summary?dateFrom=not-a-date",
    token: admin.token,
    expected: 400,
  });

  await expectStatus({
    label: "Invalid alert summary limit rejected",
    path: "/reports/alert-summary?limit=abc",
    token: admin.token,
    expected: 400,
  });

  console.log("\n--- Health Test ---");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200", health.body);
  assert(health.body?.data?.status === "healthy", "Backend status is healthy", health.body);

  console.log("\nPHASE 14L-G REPORTS / AUDIT LOGS REGRESSION TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 14L-G REPORTS / AUDIT LOGS REGRESSION TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
