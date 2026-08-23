require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
  admin: {
    identifier: "mainadmin",
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

const createCustomSale = async ({ token, paymentMethod, amount, paymentAmount = amount, customerId = null }) => {
  const payload = {
    serviceCharge: 0,
    remarks: `Phase 10 Module 6A ${paymentMethod} sale test.`,
    items: [
      {
        description: `Phase 10 Module 6A ${paymentMethod} custom item`,
        quantity: 1,
        unitPrice: amount,
        discountAmount: 0,
      },
    ],
    payments: [
      {
        paymentMethod,
        amount: paymentAmount,
        referenceNo: `PHASE10-M6A-${paymentMethod}-${Date.now()}`,
      },
    ],
  };

  if (customerId) {
    payload.customerId = customerId;
  }

  const result = await request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, `${paymentMethod} custom sale created`);

  return result.body.data;
};

const main = async () => {
  console.log("\nPHASE 10 MODULE 6A: Sales/Credit CASH Link Test");
  console.log("------------------------------------------------");

  const adminLogin = await login(users.admin);
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
      source: {
        in: ["SALE", "CREDIT_COLLECTION"],
      },
    },
  });

  await prisma.cashBox.update({
    where: {
      id: cashBox.id,
    },
    data: {
      currentBalance: "0.00",
    },
  });

  assert(true, "Cash box reset and previous Module 6A system cash links cleared");

  const cashSale = await createCustomSale({
    token: adminLogin.token,
    paymentMethod: "CASH",
    amount: 1500,
  });

  const saleCashTransaction = await prisma.cashTransaction.findFirst({
    where: {
      branchId,
      source: "SALE",
      type: "SALE_PAYMENT",
      sourceId: cashSale.id,
      status: "POSTED",
    },
  });

  assert(Boolean(saleCashTransaction), "CASH sale created SALE_PAYMENT cash transaction");
  assert(Number(saleCashTransaction.amount) === 1500, "CASH sale cash transaction amount correct");

  let updatedCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(updatedCashBox.currentBalance) === 1500, "Cash box balance increased after CASH sale");

  const gcashSale = await createCustomSale({
    token: adminLogin.token,
    paymentMethod: "GCASH",
    amount: 700,
  });

  const gcashCashTransaction = await prisma.cashTransaction.findFirst({
    where: {
      branchId,
      source: "SALE",
      sourceId: gcashSale.id,
    },
  });

  assert(!gcashCashTransaction, "GCASH sale did not create cash box transaction");

  updatedCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(updatedCashBox.currentBalance) === 1500, "Cash box balance unchanged after GCASH sale");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found for credit test");

  const creditSale = await createCustomSale({
    token: adminLogin.token,
    paymentMethod: "CREDIT",
    amount: 3000,
    paymentAmount: 0,
    customerId: customer.id,
  });

  const creditAccountResult = await request(`/sales/${creditSale.id}/credit-account`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      term: "MONTH_6",
      dueDay: 15,
      remarks: "Phase 10 Module 6A credit account test.",
    }),
  });

  if (creditAccountResult.status !== 201) {
    console.dir(creditAccountResult.body, { depth: null });
  }

  assert(creditAccountResult.status === 201, "Credit account created from CREDIT sale");

  const creditAccount = creditAccountResult.body.data;

  const cashCollectionResult = await request(`/credit-accounts/${creditAccount.id}/collections`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      amount: 500,
      paymentMethod: "CASH",
      referenceNo: `PHASE10-M6A-CASH-COLL-${Date.now()}`,
      remarks: "Phase 10 Module 6A CASH collection test.",
    }),
  });

  if (cashCollectionResult.status !== 201) {
    console.dir(cashCollectionResult.body, { depth: null });
  }

  assert(cashCollectionResult.status === 201, "CASH credit collection posted");

  const cashCollection = cashCollectionResult.body.data.collection;

  const collectionCashTransaction = await prisma.cashTransaction.findFirst({
    where: {
      branchId,
      source: "CREDIT_COLLECTION",
      type: "CREDIT_COLLECTION",
      sourceId: cashCollection.id,
      status: "POSTED",
    },
  });

  assert(Boolean(collectionCashTransaction), "CASH credit collection created CREDIT_COLLECTION cash transaction");
  assert(Number(collectionCashTransaction.amount) === 500, "CASH collection cash transaction amount correct");

  updatedCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(updatedCashBox.currentBalance) === 2000, "Cash box balance increased after CASH collection");

  const gcashCollectionResult = await request(`/credit-accounts/${creditAccount.id}/collections`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      amount: 300,
      paymentMethod: "GCASH",
      referenceNo: `PHASE10-M6A-GCASH-COLL-${Date.now()}`,
      remarks: "Phase 10 Module 6A GCASH collection test.",
    }),
  });

  if (gcashCollectionResult.status !== 201) {
    console.dir(gcashCollectionResult.body, { depth: null });
  }

  assert(gcashCollectionResult.status === 201, "GCASH credit collection posted");

  const gcashCollection = gcashCollectionResult.body.data.collection;

  const gcashCollectionCashTransaction = await prisma.cashTransaction.findFirst({
    where: {
      branchId,
      source: "CREDIT_COLLECTION",
      sourceId: gcashCollection.id,
    },
  });

  assert(!gcashCollectionCashTransaction, "GCASH credit collection did not create cash box transaction");

  updatedCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(updatedCashBox.currentBalance) === 2000, "Cash box balance unchanged after GCASH collection");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 6A SALES/CREDIT CASH LINK TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 6A SALES/CREDIT CASH LINK TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
