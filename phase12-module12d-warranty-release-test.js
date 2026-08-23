require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.data?.token) {
    console.dir(result.body, { depth: null });
    throw new Error("Login failed for " + user.identifier);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const createWarrantyClaim = async (token, customerId, itemId, issueDescription) => {
  const result = await request("/warranty-claims", {
    method: "POST",
    token,
    body: JSON.stringify({
      customerId,
      itemId,
      issueDescription,
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Warranty IN claim created");

  return result.body.data;
};

const updateStatus = async (token, id, status, extra = {}) => {
  return request(`/warranty-claims/${id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      status,
      ...extra,
    }),
  });
};

const releaseClaim = async (token, id, body = {}) => {
  return request(`/warranty-claims/${id}/release`, {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
};

const main = async () => {
  console.log("\nPHASE 12 MODULE 12D: Warranty Release Test");
  console.log("------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.warrantyClaim.deleteMany({
    where: {
      branchId,
    },
  });

  assert(true, "Previous warranty release test data cleared");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const item = await prisma.item.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(item), "Active item found");

  const inClaim = await createWarrantyClaim(
    adminLogin.token,
    customer.id,
    item.id,
    "12D IN release block test"
  );

  const missingToken = await releaseClaim(null, inClaim.id, {
    remarks: "Missing token release",
  });

  assert(missingToken.status === 401, "Release blocks missing token");

  const releaseFromIn = await releaseClaim(adminLogin.token, inClaim.id, {
    remarks: "Should not release from IN",
  });

  assert(releaseFromIn.status === 400, "IN claim cannot be released directly");

  const repairedClaim = await createWarrantyClaim(
    adminLogin.token,
    customer.id,
    item.id,
    "12D repaired release flow"
  );

  const repairedChecking = await updateStatus(adminLogin.token, repairedClaim.id, "CHECKING");
  assert(repairedChecking.status === 200, "Repaired claim moved to CHECKING");

  const repaired = await updateStatus(techLogin.token, repairedClaim.id, "REPAIRED", {
    actionTaken: "Repaired by technician",
  });

  assert(repaired.status === 200, "Claim moved to REPAIRED");

  const repairedRelease = await releaseClaim(adminLogin.token, repairedClaim.id, {
    actionTaken: "Released repaired item",
    remarks: "Customer received repaired item",
  });

  if (repairedRelease.status !== 200) {
    console.dir(repairedRelease.body, { depth: null });
  }

  assert(repairedRelease.status === 200, "Admin can release REPAIRED claim");
  assert(repairedRelease.body.data.status === "OUT", "Released claim status is OUT");
  assert(Boolean(repairedRelease.body.data.releasedAt), "releasedAt saved");
  assert(repairedRelease.body.data.releasedBy.id === adminLogin.user.id, "releasedBy is actor");
  assert(repairedRelease.body.data.actionTaken === "Released repaired item", "Release actionTaken saved");
  assert(repairedRelease.body.data.remarks === "Customer received repaired item", "Release remarks saved");

  const duplicateRelease = await releaseClaim(adminLogin.token, repairedClaim.id, {
    remarks: "Duplicate release",
  });

  assert(duplicateRelease.status === 400, "Duplicate release is blocked");

  const rejectedClaim = await createWarrantyClaim(
    adminLogin.token,
    customer.id,
    item.id,
    "12D rejected release flow"
  );

  const rejectedChecking = await updateStatus(adminLogin.token, rejectedClaim.id, "CHECKING");
  assert(rejectedChecking.status === 200, "Rejected claim moved to CHECKING");

  const rejected = await updateStatus(adminLogin.token, rejectedClaim.id, "REJECTED", {
    diagnosis: "Warranty void",
  });

  assert(rejected.status === 200, "Claim moved to REJECTED");

  const rejectedRelease = await releaseClaim(techLogin.token, rejectedClaim.id, {
    remarks: "Released rejected item to customer",
  });

  if (rejectedRelease.status !== 200) {
    console.dir(rejectedRelease.body, { depth: null });
  }

  assert(rejectedRelease.status === 200, "Technician can release REJECTED claim");
  assert(rejectedRelease.body.data.status === "OUT", "Rejected release status is OUT");
  assert(rejectedRelease.body.data.releasedBy.id === techLogin.user.id, "releasedBy is technician");

  const replacedClaim = await createWarrantyClaim(
    adminLogin.token,
    customer.id,
    item.id,
    "12D replaced release flow"
  );

  const replacedChecking = await updateStatus(adminLogin.token, replacedClaim.id, "CHECKING");
  assert(replacedChecking.status === 200, "Replaced claim moved to CHECKING");

  const replacedSent = await updateStatus(adminLogin.token, replacedClaim.id, "SENT_TO_SUPPLIER");
  assert(replacedSent.status === 200, "Replaced claim moved to SENT_TO_SUPPLIER");

  const replaced = await updateStatus(adminLogin.token, replacedClaim.id, "REPLACED", {
    actionTaken: "Supplier replaced item",
  });

  assert(replaced.status === 200, "Claim moved to REPLACED");

  const replacedRelease = await releaseClaim(adminLogin.token, replacedClaim.id, {
    remarks: "Released replacement to customer",
  });

  if (replacedRelease.status !== 200) {
    console.dir(replacedRelease.body, { depth: null });
  }

  assert(replacedRelease.status === 200, "Admin can release REPLACED claim");
  assert(replacedRelease.body.data.status === "OUT", "Replaced release status is OUT");

  const missingClaim = await releaseClaim(adminLogin.token, "not-existing-warranty-claim-id", {
    remarks: "Missing claim",
  });

  assert(missingClaim.status === 404, "Missing warranty claim release returns 404");

  const saved = await prisma.warrantyClaim.findUnique({
    where: {
      id: repairedClaim.id,
    },
  });

  assert(saved.status === "OUT", "Released claim saved as OUT in database");
  assert(Boolean(saved.releasedAt), "releasedAt saved in database");
  assert(saved.releasedById === adminLogin.user.id, "releasedById saved in database");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 12 MODULE 12D WARRANTY RELEASE TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 12 MODULE 12D WARRANTY RELEASE TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
