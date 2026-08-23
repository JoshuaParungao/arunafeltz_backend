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

const createSaleForCredit = async ({ token, branchId, customerId, amount, downpayment }) => {
  const sale = await request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId,
      customerId,
      remarks: "Phase 9 Module 6 cancel collection test sale.",
      items: [
        {
          description: `Phase 9 Module 6 custom sale ${Date.now()}`,
          quantity: 1,
          unitPrice: amount,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: downpayment,
        },
      ],
    }),
  });

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Sale for cancel collection test created");

  return sale.body.data;
};

const createCreditFromSale = async ({ token, saleId, term = "MONTH_6" }) => {
  const credit = await request(`/sales/${saleId}/credit-account`, {
    method: "POST",
    token,
    body: JSON.stringify({
      term,
      dueDay: 20,
      remarks: "Phase 9 Module 6 cancel collection test credit account.",
    }),
  });

  if (credit.status !== 201) {
    console.dir(credit.body, { depth: null });
  }

  assert(credit.status === 201, "Credit account for cancel collection test created");

  return credit.body.data;
};

const postCollection = async ({ token, creditAccountId, amount, paymentMethod = "CASH" }) => {
  const result = await request(`/credit-accounts/${creditAccountId}/collections`, {
    method: "POST",
    token,
    body: JSON.stringify({
      amount,
      paymentMethod,
      referenceNo: `PHASE9-M6-${Date.now()}`,
      remarks: "Phase 9 Module 6 test collection.",
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Collection posted for cancel test");

  return result.body.data;
};

const cancelCollection = async ({ token, collectionId, reason = "Phase 9 Module 6 test cancellation." }) => {
  return request(`/credit-accounts/collections/${collectionId}/cancel`, {
    method: "POST",
    token,
    body: JSON.stringify({
      cancellationReason: reason,
    }),
  });
};

const main = async () => {
  console.log("\nPhase 9 Module 6: Cancel / Reverse Collection Test");
  console.log("--------------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);
  const superLogin = await login(users.superOwner);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const sale = await createSaleForCredit({
    token: adminLogin.token,
    branchId,
    customerId: customer.id,
    amount: 9000,
    downpayment: 1000,
  });

  const credit = await createCreditFromSale({
    token: adminLogin.token,
    saleId: sale.id,
    term: "MONTH_6",
  });

  const startingBalance = Number(credit.remainingBalance);

  assert(startingBalance > 0, "Credit account starting balance is greater than zero");

  const posted = await postCollection({
    token: adminLogin.token,
    creditAccountId: credit.id,
    amount: 1000,
  });

  const balanceAfterPost = Number(posted.creditAccount.remainingBalance);

  assert(balanceAfterPost === Number((startingBalance - 1000).toFixed(2)), "Balance decreased after collection posting");

  const noTokenCancel = await cancelCollection({
    token: null,
    collectionId: posted.collection.id,
  });

  assert([401, 403].includes(noTokenCancel.status), "Cancel collection blocks missing token");

  const techCancel = await cancelCollection({
    token: techLogin.token,
    collectionId: posted.collection.id,
  });

  assert(techCancel.status === 403, "Technician cannot cancel collection");

  const cancelResult = await cancelCollection({
    token: adminLogin.token,
    collectionId: posted.collection.id,
  });

  if (cancelResult.status !== 200) {
    console.dir(cancelResult.body, { depth: null });
  }

  assert(cancelResult.status === 200, "Admin can cancel posted collection");
  assert(cancelResult.body.data.collection.status === "CANCELLED", "Collection status becomes CANCELLED");
  assert(Boolean(cancelResult.body.data.collection.cancelledAt), "Collection cancelledAt saved");
  assert(Boolean(cancelResult.body.data.collection.cancelledBy), "Collection cancelledBy included");
  assert(Number(cancelResult.body.data.creditAccount.remainingBalance) === startingBalance, "Credit account remainingBalance restored");
  assert(Number(cancelResult.body.data.creditAccount.totalCollected) === 0, "Credit account totalCollected reversed");
  assert(cancelResult.body.data.creditAccount.status === "ACTIVE", "Credit account stays ACTIVE after reversal");

  const cancelledCollectionDb = await prisma.creditCollection.findUnique({
    where: {
      id: posted.collection.id,
    },
  });

  assert(cancelledCollectionDb.status === "CANCELLED", "Database collection status CANCELLED");
  assert(Boolean(cancelledCollectionDb.cancelledAt), "Database cancelledAt saved");
  assert(Boolean(cancelledCollectionDb.cancelledById), "Database cancelledById saved");

  const cancelAgain = await cancelCollection({
    token: adminLogin.token,
    collectionId: posted.collection.id,
  });

  assert(cancelAgain.status === 400, "Already cancelled collection cannot be cancelled again");

  const missingCancel = await cancelCollection({
    token: adminLogin.token,
    collectionId: "not-existing-collection-id",
  });

  assert(missingCancel.status === 404, "Missing collection cancel returns 404");

  const paidSale = await createSaleForCredit({
    token: adminLogin.token,
    branchId,
    customerId: customer.id,
    amount: 6000,
    downpayment: 1000,
  });

  const paidCredit = await createCreditFromSale({
    token: adminLogin.token,
    saleId: paidSale.id,
    term: "MONTH_3",
  });

  const paidStartingBalance = Number(paidCredit.remainingBalance);

  const finalCollection = await postCollection({
    token: adminLogin.token,
    creditAccountId: paidCredit.id,
    amount: paidStartingBalance,
    paymentMethod: "GCASH",
  });

  assert(finalCollection.creditAccount.status === "PAID", "Credit account becomes PAID before reversing final collection");

  const reverseFinal = await cancelCollection({
    token: adminLogin.token,
    collectionId: finalCollection.collection.id,
    reason: "Reverse final payment test.",
  });

  if (reverseFinal.status !== 200) {
    console.dir(reverseFinal.body, { depth: null });
  }

  assert(reverseFinal.status === 200, "Admin can reverse final collection");
  assert(reverseFinal.body.data.creditAccount.status === "ACTIVE", "Paid credit account returns to ACTIVE after reversal");
  assert(Number(reverseFinal.body.data.creditAccount.remainingBalance) === paidStartingBalance, "Remaining balance restored after reversing final collection");
  assert(reverseFinal.body.data.creditAccount.paidAt === null, "paidAt cleared after reversing final collection");

  const superSale = await createSaleForCredit({
    token: superLogin.token,
    branchId,
    customerId: customer.id,
    amount: 5000,
    downpayment: 500,
  });

  const superCredit = await createCreditFromSale({
    token: superLogin.token,
    saleId: superSale.id,
    term: "MONTH_3",
  });

  const superPosted = await postCollection({
    token: superLogin.token,
    creditAccountId: superCredit.id,
    amount: 500,
    paymentMethod: "BANK_TRANSFER",
  });

  const superCancel = await cancelCollection({
    token: superLogin.token,
    collectionId: superPosted.collection.id,
    reason: "Super Owner cancel collection test.",
  });

  assert(superCancel.status === 200, "Super Owner can cancel collection");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 9 MODULE 6 CANCEL / REVERSE COLLECTION TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 9 MODULE 6 CANCEL / REVERSE COLLECTION TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
