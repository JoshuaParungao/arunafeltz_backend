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
      referenceNo: `PHASE10-M4-${Date.now()}`,
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, `${type} transaction created for list/view test`);

  return result.body.data;
};

const main = async () => {
  console.log("\nPhase 10 Module 4: Cash Box List / View Test");
  console.log("--------------------------------------------");

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

  const cashIn = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_IN",
    amount: 2500,
    description: "Phase 10 Module 4 searchable cash in.",
  });

  const cashOut = await postCashTransaction({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    type: "CASH_OUT",
    amount: 500,
    description: "Phase 10 Module 4 searchable cash out.",
  });

  const noTokenList = await request("/cash-boxes");

  assert([401, 403].includes(noTokenList.status), "Cash box list blocks missing token");

  const techList = await request("/cash-boxes", {
    token: techLogin.token,
  });

  assert(techList.status === 403, "Technician cannot view cash boxes");

  const adminList = await request("/cash-boxes", {
    token: adminLogin.token,
  });

  if (adminList.status !== 200) {
    console.dir(adminList.body, { depth: null });
  }

  assert(adminList.status === 200, "Admin can list own branch cash boxes");
  assert(Array.isArray(adminList.body.data.data), "Cash box list data is array");
  assert(adminList.body.data.data.some((item) => item.id === cashBox.id), "Cash box list includes MAIN cash box");

  const searchList = await request("/cash-boxes?search=CASHBOX-MAIN", {
    token: adminLogin.token,
  });

  assert(searchList.status === 200, "Cash box search works");
  assert(searchList.body.data.data.some((item) => item.id === cashBox.id), "Cash box search finds MAIN cash box");

  const statusList = await request("/cash-boxes?status=ACTIVE", {
    token: adminLogin.token,
  });

  assert(statusList.status === 200, "Cash box status filter works");
  assert(statusList.body.data.data.every((item) => item.status === "ACTIVE"), "Cash box status filter returns ACTIVE only");

  const detail = await request(`/cash-boxes/${cashBox.id}`, {
    token: adminLogin.token,
  });

  if (detail.status !== 200) {
    console.dir(detail.body, { depth: null });
  }

  assert(detail.status === 200, "Admin can view cash box detail");
  assert(detail.body.data.id === cashBox.id, "Cash box detail correct id");
  assert(Array.isArray(detail.body.data.transactions), "Cash box detail includes transactions array");

  const txList = await request(`/cash-boxes/${cashBox.id}/transactions`, {
    token: adminLogin.token,
  });

  if (txList.status !== 200) {
    console.dir(txList.body, { depth: null });
  }

  assert(txList.status === 200, "Admin can list cash box transactions");
  assert(Array.isArray(txList.body.data.data), "Cash transaction list data is array");
  assert(txList.body.data.data.some((item) => item.id === cashIn.transaction.id), "Transaction list includes CASH_IN");
  assert(txList.body.data.data.some((item) => item.id === cashOut.transaction.id), "Transaction list includes CASH_OUT");

  const typeFilter = await request(`/cash-boxes/${cashBox.id}/transactions?type=CASH_IN`, {
    token: adminLogin.token,
  });

  assert(typeFilter.status === 200, "Cash transaction type filter works");
  assert(typeFilter.body.data.data.every((item) => item.type === "CASH_IN"), "Type filter returns CASH_IN only");

  const txSearch = await request(`/cash-boxes/${cashBox.id}/transactions?search=${encodeURIComponent(cashIn.transaction.transactionCode)}`, {
    token: adminLogin.token,
  });

  assert(txSearch.status === 200, "Cash transaction search works");
  assert(txSearch.body.data.data.some((item) => item.id === cashIn.transaction.id), "Cash transaction search finds created transaction");

  const txDetail = await request(`/cash-boxes/transactions/${cashIn.transaction.id}`, {
    token: adminLogin.token,
  });

  if (txDetail.status !== 200) {
    console.dir(txDetail.body, { depth: null });
  }

  assert(txDetail.status === 200, "Admin can view cash transaction detail");
  assert(txDetail.body.data.id === cashIn.transaction.id, "Cash transaction detail correct id");
  assert(txDetail.body.data.cashBox.id === cashBox.id, "Cash transaction detail includes cash box");

  const superList = await request(`/cash-boxes?branchId=${branchId}`, {
    token: superLogin.token,
  });

  assert(superList.status === 200, "Super Owner can list cash boxes by branchId");
  assert(superList.body.data.data.some((item) => item.id === cashBox.id), "Super Owner branch filter includes MAIN cash box");

  const superTxDetail = await request(`/cash-boxes/transactions/${cashIn.transaction.id}`, {
    token: superLogin.token,
  });

  assert(superTxDetail.status === 200, "Super Owner can view cash transaction detail");

  const missingCashBox = await request("/cash-boxes/not-existing-cash-box-id", {
    token: adminLogin.token,
  });

  assert(missingCashBox.status === 404, "Missing cash box detail returns 404");

  const missingTransaction = await request("/cash-boxes/transactions/not-existing-transaction-id", {
    token: adminLogin.token,
  });

  assert(missingTransaction.status === 404, "Missing cash transaction detail returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 4 CASH BOX LIST / VIEW TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 4 CASH BOX LIST / VIEW TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
