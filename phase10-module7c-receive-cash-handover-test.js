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

const createHandover = async ({ token, cashBoxId, amount }) => {
  const result = await request(`/cash-boxes/${cashBoxId}/handovers`, {
    method: "POST",
    token,
    body: JSON.stringify({
      amount,
      remarks: "Phase 10 Module 7C receive test.",
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Pending handover created");

  return result.body.data;
};

const receiveHandover = async ({ token, handoverId }) => {
  return request(`/cash-boxes/handovers/${handoverId}/receive`, {
    method: "POST",
    token,
    body: JSON.stringify({
      remarks: "Phase 10 Module 7C received.",
    }),
  });
};

const main = async () => {
  console.log("\nPHASE 10 MODULE 7C: Receive Cash Handover Test");
  console.log("----------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

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

  await prisma.cashTransaction.deleteMany({
    where: {
      branchId,
      type: "HANDOVER_OUT",
    },
  });

  await prisma.cashHandover.deleteMany({
    where: {
      branchId,
    },
  });

  await prisma.cashBox.update({
    where: {
      id: cashBox.id,
    },
    data: {
      currentBalance: "5000.00",
    },
  });

  assert(true, "Cash box reset to 5000");

  const handover = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 1200,
  });

  const noToken = await receiveHandover({
    token: null,
    handoverId: handover.id,
  });

  assert([401, 403].includes(noToken.status), "Receive handover blocks missing token");

  const techReceive = await receiveHandover({
    token: techLogin.token,
    handoverId: handover.id,
  });

  assert(techReceive.status === 403, "Technician cannot receive handover");

  const receiveResult = await receiveHandover({
    token: adminLogin.token,
    handoverId: handover.id,
  });

  if (receiveResult.status !== 200) {
    console.dir(receiveResult.body, { depth: null });
  }

  assert(receiveResult.status === 200, "Admin can receive handover");
  assert(receiveResult.body.data.handover.status === "RECEIVED", "Handover status becomes RECEIVED");
  assert(Boolean(receiveResult.body.data.handover.receivedAt), "receivedAt saved");
  assert(receiveResult.body.data.handover.receivedBy.id === adminLogin.user.id, "receivedBy is actor");
  assert(receiveResult.body.data.transaction.type === "HANDOVER_OUT", "HANDOVER_OUT transaction created");
  assert(receiveResult.body.data.transaction.source === "SYSTEM_ADJUSTMENT", "Transaction source is SYSTEM_ADJUSTMENT");
  assert(Number(receiveResult.body.data.transaction.amount) === 1200, "Transaction amount correct");
  assert(Number(receiveResult.body.data.transaction.balanceBefore) === 5000, "Transaction balanceBefore correct");
  assert(Number(receiveResult.body.data.transaction.balanceAfter) === 3800, "Transaction balanceAfter correct");

  const dbCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(dbCashBox.currentBalance) === 3800, "Cash box balance decreased after receive");

  const receiveAgain = await receiveHandover({
    token: adminLogin.token,
    handoverId: handover.id,
  });

  assert(receiveAgain.status === 400, "Already received handover cannot be received again");

  const tooLargeHandover = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 999999,
  });

  const tooLargeReceive = await receiveHandover({
    token: adminLogin.token,
    handoverId: tooLargeHandover.id,
  });

  assert(tooLargeReceive.status === 400, "Receive blocked if handover amount exceeds cash box balance");

  const missingReceive = await receiveHandover({
    token: adminLogin.token,
    handoverId: "not-existing-handover-id",
  });

  assert(missingReceive.status === 404, "Missing handover returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 7C RECEIVE CASH HANDOVER TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 7C RECEIVE CASH HANDOVER TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
