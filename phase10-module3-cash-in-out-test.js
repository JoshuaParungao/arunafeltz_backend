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

const postCashTransaction = async ({
  token,
  cashBoxId,
  type,
  amount,
  description = "Phase 10 Module 3 test cash transaction.",
}) => {
  return request(`/cash-boxes/${cashBoxId}/transactions`, {
    method: "POST",
    token,
    body: JSON.stringify({
      type,
      amount,
      description,
      referenceNo: `PHASE10-M3-${Date.now()}`,
    }),
  });
};

const main = async () => {
  console.log("\nPhase 10 Module 3: Cash In / Cash Out Test");
  console.log("------------------------------------------");

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

  const resetCashBox = await prisma.cashBox.update({
    where: {
      id: cashBox.id,
    },
    data: {
      currentBalance: "0.00",
    },
  });

  assert(Number(resetCashBox.currentBalance) === 0, "Cash box reset to zero for test");

  const noToken = await postCashTransaction({
    token: null,
    cashBoxId: cashBox.id,
    type: "CASH_IN",
    amount: 1000,
  });

  assert([401, 403].includes(noToken.status), "Cash transaction blocks missing token");

  const techPost = await postCashTransaction({
    token: techLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_IN",
    amount: 1000,
  });

  assert(techPost.status === 403, "Technician cannot post cash transaction");

  const zeroAmount = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_IN",
    amount: 0,
  });

  assert(zeroAmount.status === 400, "Zero amount is blocked");

  const invalidType = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "SALE_PAYMENT",
    amount: 100,
  });

  assert(invalidType.status === 400, "Non-manual cash transaction type is blocked");

  const overCashOut = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_OUT",
    amount: 1,
  });

  assert(overCashOut.status === 400, "Cash out over balance is blocked");

  const cashIn = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_IN",
    amount: 5000,
    description: "Opening fund cash in.",
  });

  if (cashIn.status !== 201) {
    console.dir(cashIn.body, { depth: null });
  }

  assert(cashIn.status === 201, "Admin can post CASH_IN");
  assert(cashIn.body.data.transaction.transactionCode.startsWith("CASH-MAIN-"), "Cash transaction code generated");
  assert(cashIn.body.data.transaction.type === "CASH_IN", "Cash transaction type saved");
  assert(Number(cashIn.body.data.transaction.amount) === 5000, "CASH_IN amount saved");
  assert(Number(cashIn.body.data.transaction.balanceBefore) === 0, "CASH_IN balanceBefore saved");
  assert(Number(cashIn.body.data.transaction.balanceAfter) === 5000, "CASH_IN balanceAfter saved");
  assert(Number(cashIn.body.data.cashBox.currentBalance) === 5000, "Cash box balance updated after CASH_IN");

  const cashOut = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_OUT",
    amount: 1200,
    description: "Petty cash out test.",
  });

  if (cashOut.status !== 201) {
    console.dir(cashOut.body, { depth: null });
  }

  assert(cashOut.status === 201, "Admin can post CASH_OUT");
  assert(Number(cashOut.body.data.transaction.balanceBefore) === 5000, "CASH_OUT balanceBefore saved");
  assert(Number(cashOut.body.data.transaction.balanceAfter) === 3800, "CASH_OUT balanceAfter saved");
  assert(Number(cashOut.body.data.cashBox.currentBalance) === 3800, "Cash box balance updated after CASH_OUT");

  const adjustmentIn = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "ADJUSTMENT_IN",
    amount: 200,
    description: "Manual adjustment in test.",
  });

  assert(adjustmentIn.status === 201, "Admin can post ADJUSTMENT_IN");
  assert(Number(adjustmentIn.body.data.cashBox.currentBalance) === 4000, "Cash box balance updated after ADJUSTMENT_IN");

  const adjustmentOut = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "ADJUSTMENT_OUT",
    amount: 500,
    description: "Manual adjustment out test.",
  });

  assert(adjustmentOut.status === 201, "Admin can post ADJUSTMENT_OUT");
  assert(Number(adjustmentOut.body.data.cashBox.currentBalance) === 3500, "Cash box balance updated after ADJUSTMENT_OUT");

  const dbCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
    include: {
      transactions: true,
    },
  });

  assert(Number(dbCashBox.currentBalance) === 3500, "Database cash box final balance correct");
  assert(dbCashBox.transactions.length >= 4, "Database cash transactions created");

  const superCashIn = await postCashTransaction({
    token: superLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_IN",
    amount: 100,
    description: "Super Owner cash in test.",
  });

  assert(superCashIn.status === 201, "Super Owner can post cash transaction");

  const missingCashBox = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: "not-existing-cash-box-id",
    type: "CASH_IN",
    amount: 100,
  });

  assert(missingCashBox.status === 404, "Missing cash box returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 3 CASH IN / CASH OUT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 3 CASH IN / CASH OUT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
