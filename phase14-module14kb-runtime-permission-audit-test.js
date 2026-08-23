require("dotenv").config();

const prisma = require("./src/config/prisma");

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

  if (!result.body?.data?.token) {
    console.dir(result.body, { depth: null });
    throw new Error(`Login failed for ${label}`);
  }

  console.log(`PASS: ${label} login successful`);

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const expectStatus = async ({ label, path, token, expected }) => {
  const result = await request(path, { token });

  const passed = Array.isArray(expected)
    ? expected.includes(result.status)
    : result.status === expected;

  assert(
    passed,
    `${label} => ${path} expected ${Array.isArray(expected) ? expected.join("/") : expected}, got ${result.status}`,
    result.body
  );

  return result;
};

const main = async () => {
  console.log("\nPHASE 14K-B: Runtime Permission Audit Test");
  console.log("------------------------------------------");

  const superOwner = await login("SUPER_OWNER", accounts.superOwner);
  const admin = await login("ADMIN", accounts.admin);
  const technician = await login("TECHNICIAN", accounts.technician);

  assert(superOwner.user.role === "SUPER_OWNER", "SUPER_OWNER role confirmed");
  assert(["ADMIN", "BRANCH_OWNER"].includes(admin.user.role), "Admin/Branch Owner role confirmed");
  assert(technician.user.role === "TECHNICIAN", "TECHNICIAN role confirmed");

  const adminBranchId = admin.user.branch?.id || admin.user.branchId;

  assert(Boolean(adminBranchId), "Admin branch detected");

  const otherBranch = await prisma.branch.findFirst({
    where: {
      id: {
        not: adminBranchId,
      },
      status: "ACTIVE",
    },
    orderBy: {
      code: "asc",
    },
  });

  assert(Boolean(otherBranch), "Other active branch detected");

  console.log("\n--- Authentication Guard Tests ---");

  await expectStatus({
    label: "No token blocked from reports",
    path: "/reports/alert-summary",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from audit logs",
    path: "/audit-logs",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from users",
    path: "/users",
    expected: 401,
  });

  console.log("\n--- SUPER_OWNER Access Tests ---");

  await expectStatus({
    label: "SUPER_OWNER can access alert summary",
    path: "/reports/alert-summary?limit=5",
    token: superOwner.token,
    expected: 200,
  });

  await expectStatus({
    label: "SUPER_OWNER can access inventory summary",
    path: "/reports/inventory-summary?limit=5",
    token: superOwner.token,
    expected: 200,
  });

  await expectStatus({
    label: "SUPER_OWNER can access audit logs",
    path: "/audit-logs?limit=5",
    token: superOwner.token,
    expected: 200,
  });

  await expectStatus({
    label: "SUPER_OWNER can access users",
    path: "/users?limit=5",
    token: superOwner.token,
    expected: 200,
  });

  console.log("\n--- ADMIN Own Branch Access Tests ---");

  await expectStatus({
    label: "ADMIN can access own branch alert summary",
    path: `/reports/alert-summary?branchId=${adminBranchId}&limit=5`,
    token: admin.token,
    expected: 200,
  });

  await expectStatus({
    label: "ADMIN can access own branch inventory summary",
    path: `/reports/inventory-summary?branchId=${adminBranchId}&limit=5`,
    token: admin.token,
    expected: 200,
  });

  await expectStatus({
    label: "ADMIN can access audit logs",
    path: "/audit-logs?limit=5",
    token: admin.token,
    expected: 200,
  });

  await expectStatus({
    label: "ADMIN can access users",
    path: "/users?limit=5",
    token: admin.token,
    expected: 200,
  });

  console.log("\n--- ADMIN Cross-Branch Restriction Tests ---");

  await expectStatus({
    label: "ADMIN blocked from other branch alert summary",
    path: `/reports/alert-summary?branchId=${otherBranch.id}&limit=5`,
    token: admin.token,
    expected: 403,
  });

  await expectStatus({
    label: "ADMIN blocked from other branch inventory summary",
    path: `/reports/inventory-summary?branchId=${otherBranch.id}&limit=5`,
    token: admin.token,
    expected: 403,
  });

  console.log("\n--- TECHNICIAN Restricted Access Tests ---");

  await expectStatus({
    label: "TECHNICIAN blocked from alert summary",
    path: "/reports/alert-summary?limit=5",
    token: technician.token,
    expected: 403,
  });

  await expectStatus({
    label: "TECHNICIAN blocked from inventory summary",
    path: "/reports/inventory-summary?limit=5",
    token: technician.token,
    expected: 403,
  });

  await expectStatus({
    label: "TECHNICIAN blocked from audit logs",
    path: "/audit-logs?limit=5",
    token: technician.token,
    expected: 403,
  });

  await expectStatus({
    label: "TECHNICIAN blocked from users",
    path: "/users?limit=5",
    token: technician.token,
    expected: 403,
  });

  console.log("\n--- Operational Access Sanity Tests ---");

  await expectStatus({
    label: "TECHNICIAN can access inventory operational view",
    path: "/inventory/overview?limit=5",
    token: technician.token,
    expected: 200,
  });

  await expectStatus({
    label: "TECHNICIAN can access quotations operational view",
    path: "/quotations?limit=5",
    token: technician.token,
    expected: 200,
  });

  await expectStatus({
    label: "TECHNICIAN can access sales operational view",
    path: "/sales?limit=5",
    token: technician.token,
    expected: 200,
  });

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200", health.body);
  assert(health.body?.data?.status === "healthy", "Backend status is healthy", health.body);

  console.log("\nPHASE 14K-B RUNTIME PERMISSION AUDIT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14K-B RUNTIME PERMISSION AUDIT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
