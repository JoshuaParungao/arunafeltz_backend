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

const createSaleForCredit = async ({
  token,
  branchId,
  customerId,
  amount = 9000,
  downpayment = 1000,
}) => {
  const sale = await request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId,
      customerId,
      remarks: "Phase 9 Module 5 collection test sale.",
      items: [
        {
          description: `Phase 9 Module 5 custom sale ${Date.now()}`,
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

  assert(sale.status === 201, "Sale for collection test created");

  return sale.body.data;
};

const createCreditFromSale = async ({ token, saleId, term = "MONTH_6" }) => {
  const credit = await request(`/sales/${saleId}/credit-account`, {
    method: "POST",
    token,
    body: JSON.stringify({
      term,
      dueDay: 20,
      remarks: "Phase 9 Module 5 collection test credit account.",
    }),
  });

  if (credit.status !== 201) {
    console.dir(credit.body, { depth: null });
  }

  assert(credit.status === 201, "Credit account for collection test created");

  return credit.body.data;
};

const postCollection = async ({
  token,
  creditAccountId,
  amount,
  paymentMethod = "CASH",
}) => {
  return request(`/credit-accounts/${creditAccountId}/collections`, {
    method: "POST",
    token,
    body: JSON.stringify({
      amount,
      paymentMethod,
      referenceNo: `PHASE9-M5-${Date.now()}`,
      remarks: "Phase 9 Module 5 test collection.",
    }),
  });
};

const main = async () => {
  console.log("\nPhase 9 Module 5: Collections / Payment Posting Test");
  console.log("----------------------------------------------------");

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

  const noTokenCollection = await postCollection({
    token: null,
    creditAccountId: credit.id,
    amount: 500,
  });

  assert([401, 403].includes(noTokenCollection.status), "Collection posting blocks missing token");

  const techCollection = await postCollection({
    token: techLogin.token,
    creditAccountId: credit.id,
    amount: 500,
  });

  assert(techCollection.status === 403, "Technician cannot post collection");

  const invalidAmount = await postCollection({
    token: adminLogin.token,
    creditAccountId: credit.id,
    amount: 0,
  });

  assert(invalidAmount.status === 400, "Zero collection amount is blocked");

  const overPayment = await postCollection({
    token: adminLogin.token,
    creditAccountId: credit.id,
    amount: startingBalance + 1,
  });

  assert(overPayment.status === 400, "Collection amount over remaining balance is blocked");

  const firstCollection = await postCollection({
    token: adminLogin.token,
    creditAccountId: credit.id,
    amount: 1000,
    paymentMethod: "CASH",
  });

  if (firstCollection.status !== 201) {
    console.dir(firstCollection.body, { depth: null });
  }

  assert(firstCollection.status === 201, "Admin can post partial collection");
  assert(firstCollection.body.data.collection.collectionCode.startsWith("COLL-MAIN-"), "Collection code generated");
  assert(Number(firstCollection.body.data.collection.amount) === 1000, "Collection amount saved");
  assert(Number(firstCollection.body.data.collection.previousBalance) === startingBalance, "Collection previous balance saved");
  assert(Number(firstCollection.body.data.collection.newBalance) === Number((startingBalance - 1000).toFixed(2)), "Collection new balance computed");
  assert(Number(firstCollection.body.data.creditAccount.totalCollected) === 1000, "Credit account totalCollected updated");
  assert(Number(firstCollection.body.data.creditAccount.remainingBalance) === Number((startingBalance - 1000).toFixed(2)), "Credit account remainingBalance updated");
  assert(firstCollection.body.data.creditAccount.status === "ACTIVE", "Credit account remains ACTIVE after partial collection");

  const afterPartial = await prisma.creditAccount.findUnique({
    where: {
      id: credit.id,
    },
  });

  const remainingAfterPartial = Number(afterPartial.remainingBalance);

  assert(remainingAfterPartial === Number((startingBalance - 1000).toFixed(2)), "Database remaining balance updated after partial collection");

  const finalCollection = await postCollection({
    token: adminLogin.token,
    creditAccountId: credit.id,
    amount: remainingAfterPartial,
    paymentMethod: "GCASH",
  });

  if (finalCollection.status !== 201) {
    console.dir(finalCollection.body, { depth: null });
  }

  assert(finalCollection.status === 201, "Admin can post final collection");
  assert(Number(finalCollection.body.data.creditAccount.remainingBalance) === 0, "Credit account remainingBalance becomes zero");
  assert(finalCollection.body.data.creditAccount.status === "PAID", "Credit account status becomes PAID");
  assert(Boolean(finalCollection.body.data.creditAccount.paidAt), "Credit account paidAt is saved");

  const paidAccount = await prisma.creditAccount.findUnique({
    where: {
      id: credit.id,
    },
    include: {
      collections: true,
    },
  });

  assert(paidAccount.status === "PAID", "Database credit account status PAID");
  assert(Number(paidAccount.remainingBalance) === 0, "Database remaining balance is zero");
  assert(paidAccount.collections.length >= 2, "Database has collection records");

  const collectionAfterPaid = await postCollection({
    token: adminLogin.token,
    creditAccountId: credit.id,
    amount: 100,
  });

  assert(collectionAfterPaid.status === 400, "Paid credit account cannot receive more collections");

  const missingAccountCollection = await postCollection({
    token: adminLogin.token,
    creditAccountId: "not-existing-credit-account-id",
    amount: 100,
  });

  assert(missingAccountCollection.status === 404, "Missing credit account collection returns 404");

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

  const superCollection = await postCollection({
    token: superLogin.token,
    creditAccountId: superCredit.id,
    amount: 500,
    paymentMethod: "BANK_TRANSFER",
  });

  assert(superCollection.status === 201, "Super Owner can post collection");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 9 MODULE 5 COLLECTIONS / PAYMENT POSTING TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 9 MODULE 5 COLLECTIONS / PAYMENT POSTING TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
