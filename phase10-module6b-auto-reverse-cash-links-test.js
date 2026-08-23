require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const user = {
  identifier: "mainadmin",
  password: "Password123!",
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

const login = async () => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.data?.token) {
    console.dir(result.body, { depth: null });
    throw new Error("Login failed");
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const createCustomSale = async ({
  token,
  paymentMethod,
  amount,
  paymentAmount = amount,
  customerId = null,
}) => {
  const payload = {
    serviceCharge: 0,
    remarks: `Phase 10 Module 6B ${paymentMethod} sale test.`,
    items: [
      {
        description: `Phase 10 Module 6B ${paymentMethod} custom item`,
        quantity: 1,
        unitPrice: amount,
        discountAmount: 0,
      },
    ],
    payments: [
      {
        paymentMethod,
        amount: paymentAmount,
        referenceNo: `PHASE10-M6B-${paymentMethod}-${Date.now()}`,
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

const cancelSale = async ({ token, saleId }) => {
  return request(`/sales/${saleId}/cancel`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      cancellationReason: "Phase 10 Module 6B sale cancellation test.",
    }),
  });
};

const cancelCollection = async ({ token, collectionId }) => {
  return request(`/credit-accounts/collections/${collectionId}/cancel`, {
    method: "POST",
    token,
    body: JSON.stringify({
      cancellationReason: "Phase 10 Module 6B collection cancellation test.",
    }),
  });
};

const main = async () => {
  console.log("\nPHASE 10 MODULE 6B: Auto Reverse Cash Links Test");
  console.log("------------------------------------------------");

  const loginResult = await login();
  const token = loginResult.token;
  const branchId = loginResult.user.branch.id || loginResult.user.branchId;

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

  assert(true, "Cash box reset and previous system cash links cleared");

  const cashSale = await createCustomSale({
    token,
    paymentMethod: "CASH",
    amount: 1200,
  });

  let saleCashTransaction = await prisma.cashTransaction.findFirst({
    where: {
      branchId,
      source: "SALE",
      type: "SALE_PAYMENT",
      sourceId: cashSale.id,
    },
  });

  assert(Boolean(saleCashTransaction), "CASH sale cash transaction exists before cancel");
  assert(saleCashTransaction.status === "POSTED", "CASH sale cash transaction starts POSTED");

  let currentCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(currentCashBox.currentBalance) === 1200, "Cash box balance increased after CASH sale");

  const cancelledSaleResult = await cancelSale({
    token,
    saleId: cashSale.id,
  });

  if (cancelledSaleResult.status !== 200) {
    console.dir(cancelledSaleResult.body, { depth: null });
  }

  assert(cancelledSaleResult.status === 200, "CASH sale cancelled");

  saleCashTransaction = await prisma.cashTransaction.findUnique({
    where: {
      id: saleCashTransaction.id,
    },
  });

  assert(saleCashTransaction.status === "CANCELLED", "Linked SALE_PAYMENT cash transaction cancelled");
  assert(Boolean(saleCashTransaction.cancelledAt), "Linked SALE_PAYMENT cancelledAt saved");

  currentCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(currentCashBox.currentBalance) === 0, "Cash box balance reversed after CASH sale cancel");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const creditSale = await createCustomSale({
    token,
    paymentMethod: "CREDIT",
    amount: 3000,
    paymentAmount: 0,
    customerId: customer.id,
  });

  const creditAccountResult = await request(`/sales/${creditSale.id}/credit-account`, {
    method: "POST",
    token,
    body: JSON.stringify({
      term: "MONTH_6",
      dueDay: 15,
      remarks: "Phase 10 Module 6B credit account test.",
    }),
  });

  if (creditAccountResult.status !== 201) {
    console.dir(creditAccountResult.body, { depth: null });
  }

  assert(creditAccountResult.status === 201, "Credit account created");

  const creditAccount = creditAccountResult.body.data;

  const collectionResult = await request(`/credit-accounts/${creditAccount.id}/collections`, {
    method: "POST",
    token,
    body: JSON.stringify({
      amount: 800,
      paymentMethod: "CASH",
      referenceNo: `PHASE10-M6B-CASH-COLL-${Date.now()}`,
      remarks: "Phase 10 Module 6B CASH collection.",
    }),
  });

  if (collectionResult.status !== 201) {
    console.dir(collectionResult.body, { depth: null });
  }

  assert(collectionResult.status === 201, "CASH credit collection posted");

  const collection = collectionResult.body.data.collection;

  let collectionCashTransaction = await prisma.cashTransaction.findFirst({
    where: {
      branchId,
      source: "CREDIT_COLLECTION",
      type: "CREDIT_COLLECTION",
      sourceId: collection.id,
    },
  });

  assert(Boolean(collectionCashTransaction), "CASH collection cash transaction exists before cancel");
  assert(collectionCashTransaction.status === "POSTED", "CASH collection cash transaction starts POSTED");

  currentCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(currentCashBox.currentBalance) === 800, "Cash box balance increased after CASH collection");

  const cancelCollectionResult = await cancelCollection({
    token,
    collectionId: collection.id,
  });

  if (cancelCollectionResult.status !== 200) {
    console.dir(cancelCollectionResult.body, { depth: null });
  }

  assert(cancelCollectionResult.status === 200, "CASH credit collection cancelled");

  collectionCashTransaction = await prisma.cashTransaction.findUnique({
    where: {
      id: collectionCashTransaction.id,
    },
  });

  assert(collectionCashTransaction.status === "CANCELLED", "Linked CREDIT_COLLECTION cash transaction cancelled");
  assert(Boolean(collectionCashTransaction.cancelledAt), "Linked CREDIT_COLLECTION cancelledAt saved");

  currentCashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBox.id,
    },
  });

  assert(Number(currentCashBox.currentBalance) === 0, "Cash box balance reversed after CASH collection cancel");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 6B AUTO REVERSE CASH LINKS TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 6B AUTO REVERSE CASH LINKS TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
