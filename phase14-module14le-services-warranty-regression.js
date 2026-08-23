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
  console.log("\nPHASE 14L-E: Services / Warranty Regression");
  console.log("-------------------------------------------");

  const superOwner = await login("SUPER_OWNER", accounts.superOwner);
  const admin = await login("ADMIN", accounts.admin);
  const technician = await login("TECHNICIAN", accounts.technician);

  console.log("\n--- No Token Guard Tests ---");

  await expectStatus({
    label: "No token blocked from service jobs",
    path: "/service-jobs?limit=5",
    expected: 401,
  });

  await expectStatus({
    label: "No token blocked from warranty claims",
    path: "/warranty-claims?limit=5",
    expected: 401,
  });

  console.log("\n--- SUPER_OWNER Access Tests ---");

  const superServiceJobs = await expectStatus({
    label: "SUPER_OWNER can access service jobs",
    path: "/service-jobs?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superServiceJobs.body, "SUPER_OWNER service jobs");

  const superWarrantyClaims = await expectStatus({
    label: "SUPER_OWNER can access warranty claims",
    path: "/warranty-claims?limit=5",
    token: superOwner.token,
    expected: 200,
  });
  assertSuccessData(superWarrantyClaims.body, "SUPER_OWNER warranty claims");

  console.log("\n--- ADMIN Access Tests ---");

  const adminServiceJobs = await expectStatus({
    label: "ADMIN can access service jobs",
    path: "/service-jobs?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminServiceJobs.body, "ADMIN service jobs");

  const adminWarrantyClaims = await expectStatus({
    label: "ADMIN can access warranty claims",
    path: "/warranty-claims?limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(adminWarrantyClaims.body, "ADMIN warranty claims");

  console.log("\n--- TECHNICIAN Operational Access Tests ---");

  const techServiceJobs = await expectStatus({
    label: "TECHNICIAN can access service jobs",
    path: "/service-jobs?limit=5",
    token: technician.token,
    expected: 200,
  });
  assertSuccessData(techServiceJobs.body, "TECHNICIAN service jobs");

  const techWarrantyClaims = await expectStatus({
    label: "TECHNICIAN can access warranty claims",
    path: "/warranty-claims?limit=5",
    token: technician.token,
    expected: 200,
  });
  assertSuccessData(techWarrantyClaims.body, "TECHNICIAN warranty claims");

  console.log("\n--- Status Filter Sanity Tests ---");

  const serviceStatusTest = await expectStatus({
    label: "ADMIN service jobs status filter works",
    path: "/service-jobs?status=PENDING&limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(serviceStatusTest.body, "ADMIN service jobs status filter");

  const warrantyStatusTest = await expectStatus({
    label: "ADMIN warranty claims status filter works",
    path: "/warranty-claims?status=IN&limit=5",
    token: admin.token,
    expected: 200,
  });
  assertSuccessData(warrantyStatusTest.body, "ADMIN warranty claims status filter");

  console.log("\n--- Health Test ---");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200", health.body);
  assert(health.body?.data?.status === "healthy", "Backend status is healthy", health.body);

  console.log("\nPHASE 14L-E SERVICES / WARRANTY REGRESSION TEST PASSED");
};

main().catch((error) => {
  console.error("\nPHASE 14L-E SERVICES / WARRANTY REGRESSION TEST FAILED");
  console.error(error);
  process.exitCode = 1;
});
