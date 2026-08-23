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
  console.log("\nPHASE 14L-D: Quotations / Sales / Credits / Cash Regression");
  console.log("-----------------------------------------------------------");

  const superOwner = await login("SUPER_OWNER", accounts.superOwner);
  const admin = await login("ADMIN", accounts.admin);
  const technician = await login("TECHNICIAN", accounts.technician);

  console.log("\n--- No Token Guard Tests ---");

  await expectStatus({
    label: "No token blocked from quotations",
    path: "/quotations?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from sales",
    path: "/sales?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from credit accounts",
    path: "/credit-accounts?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from cash boxes",
    path: "/cash-boxes?limit=5",
    expected: 401,
  });

  console.log("\n--- SUPER_OWNER Access Tests ---");

  const superQuotations = await expectStatus({
    label: "SUPER_OWNER can access quotations",
    path: "/quotations?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superQuotations.body, "SUPER_OWNER quotations");

  const superSales = await expectStatus({
    label: "SUPER_OWNER can access sales",
    path: "/sales?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superSales.body, "SUPER_OWNER sales");

  const superCredits = await expectStatus({
    label: "SUPER_OWNER can access credit accounts",
    path: "/credit-accounts?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superCredits.body, "SUPER_OWNER credit accounts");

  const superCashBoxes = await expectStatus({
    label: "SUPER_OWNER can access cash boxes",
    path: "/cash-boxes?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superCashBoxes.body, "SUPER_OWNER cash boxes");

  console.log("\n--- ADMIN Access Tests ---");

  const adminQuotations = await expectStatus({
    label: "ADMIN can access quotations",
    path: "/quotations?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminQuotations.body, "ADMIN quotations");

  const adminSales = await expectStatus({
    label: "ADMIN can access sales",
    path: "/sales?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminSales.body, "ADMIN sales");

  const adminCredits = await expectStatus({
    label: "ADMIN can access credit accounts",
    path: "/credit-accounts?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminCredits.body, "ADMIN credit accounts");

  const adminCashBoxes = await expectStatus({
    label: "ADMIN can access cash boxes",
    path: "/cash-boxes?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminCashBoxes.body, "ADMIN cash boxes");

  console.log("\n--- TECHNICIAN Operational Access Tests ---");

  const techQuotations = await expectStatus({
    label: "TECHNICIAN can access quotations",
    path: "/quotations?limit=5",
    token: technician.token,
    expected: 200,
  });
  assertSuccessData(techQuotations.body, "TECHNICIAN quotations");

  const techSales = await expectStatus({
    label: "TECHNICIAN can access sales",
    path: "/sales?limit=5",
    token: technician.token,
    expected: 200,
  });
  assertSuccessData(techSales.body, "TECHNICIAN sales");

  const techCredits = await expectStatus({
    label: "TECHNICIAN credit accounts endpoint returns allowed safe status",
    path: "/credit-accounts?limit=5",
    token: technician.token,
    expected: [200, 403],
  });

  if (techCredits.status === 200) {
    assertSuccessData(techCredits.body, "TECHNICIAN credit accounts");
  } else {
    console.log("INFO: TECHNICIAN is restricted from credit accounts, status 403");
  }

  const techCashBoxes = await expectStatus({
    label: "TECHNICIAN cash boxes endpoint returns allowed safe status",
    path: "/cash-boxes?limit=5",
    token: technician.token,
    expected: [200, 403],
  });

  if (techCashBoxes.status === 200) {
    assertSuccessData(techCashBoxes.body, "TECHNICIAN cash boxes");
  } else {
    console.log("INFO: TECHNICIAN is restricted from cash boxes, status 403");
  }

  console.log("\n--- Cash Subroute Sanity Tests ---");

  const cashSubroutes = [
    "/cash-boxes/transactions?limit=5",
    "/cash-boxes/handovers?limit=5",
  ];

  for (const path of cashSubroutes) {
    const result = await request(path, {
      token: admin.token,
    });

    assert(
      [200, 404].includes(result.status),
      `ADMIN cash subroute ${path} returns safe status 200 or 404, got ${result.status}`,
      result.body
    );

    console.log(`INFO: ${path} returned ${result.status}`);
  }

  console.log("\n--- Health Test ---");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200", health.body);
  assert(health.body?.data?.status === "healthy", "Backend status is healthy", health.body);

  console.log("\nPHASE 14L-D QUOTATIONS / SALES / CREDITS / CASH REGRESSION TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 14L-D QUOTATIONS / SALES / CREDITS / CASH REGRESSION TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
