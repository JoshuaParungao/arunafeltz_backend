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

const postCashTransaction = async ({ token, cashBoxId, type, amount, description }) => {
  const result = await request(`/cash-boxes/${cashBoxId}/transactions`, {
    method: "POST",
    token,
    body: JSON.stringify({
      type,
      amount,
      description,
      referenceNo: `PHASE10-M5-${Date.now()}`,
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, `${type} transaction created`);

  return result.body.data;
};

const cancelCashTransaction = async ({
  token,
  transactionId,
  cancellationReason = "Phase 10 Module 5 cancellation test.",
}) => {
  return request(`/cash-boxes/transactions/${transactionId}/cancel`, {
    method: "POST",
    token,
    body: JSON.stringify({
      cancellationReason,
    }),
  });
};

const main = async () => {
  console.log("\nPhase 10 Module 5: Cancel / Reverse Cash Transaction Test");
  console.log("---------------------------------------------------------");

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
      currentBalance: "0.00",
    },
  });

  assert(true, "Cash box reset to zero for test");

  const cashIn = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_IN",
    amount: 5000,
    description: "Phase 10 Module 5 cash in.",
  });

  const cashOut = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_OUT",
    amount: 1000,
    description: "Phase 10 Module 5 cash out.",
  });

  assert(Number(cashOut.cashBox.currentBalance) === 4000, "Cash box balance is 4000 before reversal tests");

  const noTokenCancel = await cancelCashTransaction({
    token: null,
    transactionId: cashOut.transaction.id,
  });

  assert([401, 403].includes(noTokenCancel.status), "Cancel cash transaction blocks missing token");

  const techCancel = await cancelCashTransaction({
    token: techLogin.token,
    transactionId: cashOut.transaction.id,
  });

  assert(techCancel.status === 403, "Technician cannot cancel cash transaction");

  const cancelCashInTooLarge = await cancelCashTransaction({
    token: adminLogin.token,
    transactionId: cashIn.transaction.id,
  });

  assert(cancelCashInTooLarge.status === 400, "Cannot reverse CASH_IN if it makes balance negative");

  const cancelCashOut = await cancelCashTransaction({
    token: adminLogin.token,
    transactionId: cashOut.transaction.id,
    cancellationReason: "Reverse cash out test.",
  });

  if (cancelCashOut.status !== 200) {
    console.dir(cancelCashOut.body, { depth: null });
  }

  assert(cancelCashOut.status === 200, "Admin can cancel CASH_OUT transaction");
  assert(cancelCashOut.body.data.transaction.status === "CANCELLED", "Cash transaction status becomes CANCELLED");
  assert(Boolean(cancelCashOut.body.data.transaction.cancelledAt), "Cash transaction cancelledAt saved");
  assert(Boolean(cancelCashOut.body.data.transaction.cancelledBy), "Cash transaction cancelledBy included");
  assert(Number(cancelCashOut.body.data.cashBox.currentBalance) === 5000, "Cash box balance restored after CASH_OUT cancellation");

  const cancelAgain = await cancelCashTransaction({
    token: adminLogin.token,
    transactionId: cashOut.transaction.id,
  });

  assert(cancelAgain.status === 400, "Already cancelled cash transaction cannot be cancelled again");

  const cancelCashInNow = await cancelCashTransaction({
    token: adminLogin.token,
    transactionId: cashIn.transaction.id,
    cancellationReason: "Reverse cash in after cash out restored.",
  });

  if (cancelCashInNow.status !== 200) {
    console.dir(cancelCashInNow.body, { depth: null });
  }

  assert(cancelCashInNow.status === 200, "Admin can cancel CASH_IN when balance allows");
  assert(Number(cancelCashInNow.body.data.cashBox.currentBalance) === 0, "Cash box returns to zero after CASH_IN cancellation");

  const dbCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(dbCashBox.currentBalance) === 0, "Database cash box balance is zero after reversals");

  const cancelledTransactions = await prisma.cashTransaction.findMany({
    where: {
      id: {
        in: [cashIn.transaction.id, cashOut.transaction.id],
      },
    },
  });

  assert(cancelledTransactions.every((item) => item.status === "CANCELLED"), "Database transactions are CANCELLED");

  const missingCancel = await cancelCashTransaction({
    token: adminLogin.token,
    transactionId: "not-existing-cash-transaction-id",
  });

  assert(missingCancel.status === 404, "Missing cash transaction cancel returns 404");

  const superCashIn = await postCashTransaction({
    token: superLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_IN",
    amount: 500,
    description: "Super Owner cash in for cancel test.",
  });

  const superCancel = await cancelCashTransaction({
    token: superLogin.token,
    transactionId: superCashIn.transaction.id,
    cancellationReason: "Super Owner cancel cash transaction test.",
  });

  assert(superCancel.status === 200, "Super Owner can cancel cash transaction");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 5 CANCEL / REVERSE CASH TRANSACTION TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 5 CANCEL / REVERSE CASH TRANSACTION TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
