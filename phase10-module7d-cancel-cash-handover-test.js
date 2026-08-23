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
      remarks: "Phase 10 Module 7D cancel test.",
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Pending handover created");

  return result.body.data;
};

const cancelHandover = async ({ token, handoverId, reason = "Phase 10 Module 7D cancellation test." }) => {
  return request(`/cash-boxes/handovers/${handoverId}/cancel`, {
    method: "POST",
    token,
    body: JSON.stringify({
      cancellationReason: reason,
    }),
  });
};

const receiveHandover = async ({ token, handoverId }) => {
  return request(`/cash-boxes/handovers/${handoverId}/receive`, {
    method: "POST",
    token,
    body: JSON.stringify({
      remarks: "Phase 10 Module 7D receive before cancel test.",
    }),
  });
};

const main = async () => {
  console.log("\nPHASE 10 MODULE 7D: Cancel Pending Cash Handover Test");
  console.log("-----------------------------------------------------");

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
    amount: 1000,
  });

  const noToken = await cancelHandover({
    token: null,
    handoverId: handover.id,
  });

  assert([401, 403].includes(noToken.status), "Cancel handover blocks missing token");

  const techCancel = await cancelHandover({
    token: techLogin.token,
    handoverId: handover.id,
  });

  assert(techCancel.status === 403, "Technician cannot cancel handover");

  const beforeCancelCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(beforeCancelCashBox.currentBalance) === 5000, "Cash box balance unchanged before cancel");

  const cancelResult = await cancelHandover({
    token: adminLogin.token,
    handoverId: handover.id,
    reason: "Testing pending handover cancellation.",
  });

  if (cancelResult.status !== 200) {
    console.dir(cancelResult.body, { depth: null });
  }

  assert(cancelResult.status === 200, "Admin can cancel pending handover");
  assert(cancelResult.body.data.status === "CANCELLED", "Handover status becomes CANCELLED");
  assert(Boolean(cancelResult.body.data.cancelledAt), "cancelledAt saved");
  assert(cancelResult.body.data.cancelledBy.id === adminLogin.user.id, "cancelledBy is actor");
  assert(cancelResult.body.data.cancellationReason === "Testing pending handover cancellation.", "Cancellation reason saved");

  const afterCancelCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(afterCancelCashBox.currentBalance) === 5000, "Cash box balance unchanged after cancel");

  const linkedTransactionCount = await prisma.cashTransaction.count({
    where: {
      sourceCode: handover.handoverCode,
    },
  });

  assert(linkedTransactionCount === 0, "Cancel pending handover does not create cash transaction");

  const cancelAgain = await cancelHandover({
    token: adminLogin.token,
    handoverId: handover.id,
  });

  assert(cancelAgain.status === 400, "Already cancelled handover cannot be cancelled again");

  const receivedHandover = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 700,
  });

  const receiveResult = await receiveHandover({
    token: adminLogin.token,
    handoverId: receivedHandover.id,
  });

  if (receiveResult.status !== 200) {
    console.dir(receiveResult.body, { depth: null });
  }

  assert(receiveResult.status === 200, "Second handover received");

  const cancelReceived = await cancelHandover({
    token: adminLogin.token,
    handoverId: receivedHandover.id,
  });

  assert(cancelReceived.status === 400, "Received handover cannot be cancelled");

  const missingCancel = await cancelHandover({
    token: adminLogin.token,
    handoverId: "not-existing-handover-id",
  });

  assert(missingCancel.status === 404, "Missing handover returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 7D CANCEL PENDING CASH HANDOVER TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 7D CANCEL PENDING CASH HANDOVER TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
