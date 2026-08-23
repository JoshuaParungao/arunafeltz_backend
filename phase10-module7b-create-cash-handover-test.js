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
  superOwner: {
    identifier: "superowner",
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

  console.log(`PASS: ${message}`);
};

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.data?.token) {
    console.dir(result.body, { depth: null });
    throw new Error(`Login failed for ${user.identifier}`);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const createHandover = async ({
  token,
  cashBoxId,
  amount,
  toUserId,
  remarks = "Phase 10 Module 7B handover request test.",
}) => {
  const body = {
    amount,
    remarks,
  };

  if (toUserId) {
    body.toUserId = toUserId;
  }

  return request(`/cash-boxes/${cashBoxId}/handovers`, {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
};

const main = async () => {
  console.log("\nPHASE 10 MODULE 7B: Create Cash Handover Request Test");
  console.log("-----------------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);
  const superLogin = await login(users.superOwner);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  const cashBox = await prisma.cashBox.findFirst({
    where: {
      branchId,
      boxCode: "CASHBOX-MAIN",
      status: "ACTIVE",
    },
  });

  assert(Boolean(cashBox), "MAIN default cash box found");

  await prisma.cashBox.update({
    where: {
      id: cashBox.id,
    },
    data: {
      currentBalance: "7777.00",
    },
  });

  const beforeCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(beforeCashBox.currentBalance) === 7777, "Cash box test balance prepared");

  const noToken = await createHandover({
    token: null,
    cashBoxId: cashBox.id,
    amount: 100,
  });

  assert([401, 403].includes(noToken.status), "Create handover blocks missing token");

  const techCreate = await createHandover({
    token: techLogin.token,
    cashBoxId: cashBox.id,
    amount: 100,
  });

  assert(techCreate.status === 403, "Technician cannot create cash handover");

  const zeroAmount = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 0,
  });

  assert(zeroAmount.status === 400, "Zero amount is blocked");

  const invalidToUser = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 100,
    toUserId: "not-existing-user-id",
  });

  assert(invalidToUser.status === 404, "Invalid toUserId is blocked");

  const adminCreate = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 1500,
    remarks: "Admin created pending cash handover.",
  });

  if (adminCreate.status !== 201) {
    console.dir(adminCreate.body, { depth: null });
  }

  assert(adminCreate.status === 201, "Admin can create cash handover");
  assert(adminCreate.body.data.handoverCode.startsWith("HANDOVER-MAIN-"), "Handover code generated");
  assert(adminCreate.body.data.status === "PENDING", "Handover starts as PENDING");
  assert(Number(adminCreate.body.data.amount) === 1500, "Handover amount saved");
  assert(adminCreate.body.data.cashBox.id === cashBox.id, "Handover linked to cash box");
  assert(adminCreate.body.data.branch.id === branchId, "Handover linked to branch");
  assert(adminCreate.body.data.fromUser.id === adminLogin.user.id, "Handover fromUser is actor");
  assert(adminCreate.body.data.createdBy.id === adminLogin.user.id, "Handover createdBy is actor");

  const afterAdminCreateCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(afterAdminCreateCashBox.currentBalance) === 7777, "Cash box balance unchanged after creating handover");

  const dbHandover = await prisma.cashHandover.findUnique({
    where: {
      id: adminCreate.body.data.id,
    },
  });

  assert(Boolean(dbHandover), "Cash handover saved in database");
  assert(dbHandover.status === "PENDING", "Database handover status is PENDING");

  const superCreate = await createHandover({
    token: superLogin.token,
    cashBoxId: cashBox.id,
    amount: 500,
    remarks: "Super Owner created pending cash handover.",
  });

  assert(superCreate.status === 201, "Super Owner can create cash handover");

  const missingCashBox = await createHandover({
    token: adminLogin.token,
    cashBoxId: "not-existing-cash-box-id",
    amount: 100,
  });

  assert(missingCashBox.status === 404, "Missing cash box returns 404");

  const transactionCount = await prisma.cashTransaction.count({
    where: {
      sourceCode: adminCreate.body.data.handoverCode,
    },
  });

  assert(transactionCount === 0, "Create handover does not create cash transaction yet");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 7B CREATE CASH HANDOVER REQUEST TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 7B CREATE CASH HANDOVER REQUEST TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
