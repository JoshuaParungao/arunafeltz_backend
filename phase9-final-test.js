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

const toNumber = (value) => Number(value);

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
  amount,
  downpayment,
  label,
}) => {
  const sale = await request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId,
      customerId,
      remarks: `Phase 9 final test sale - ${label}`,
      items: [
        {
          description: `Phase 9 final custom sale ${label} ${Date.now()}`,
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

  assert(sale.status === 201, `${label}: sale created`);

  return sale.body.data;
};

const createCreditFromSale = async ({ token, saleId, term, label }) => {
  const credit = await request(`/sales/${saleId}/credit-account`, {
    method: "POST",
    token,
    body: JSON.stringify({
      term,
      dueDay: 20,
      remarks: `Phase 9 final test credit account - ${label}`,
    }),
  });

  if (credit.status !== 201) {
    console.dir(credit.body, { depth: null });
  }

  assert(credit.status === 201, `${label}: credit account created`);

  return credit.body.data;
};

const postCollection = async ({
  token,
  creditAccountId,
  amount,
  paymentMethod = "CASH",
  label,
}) => {
  const result = await request(`/credit-accounts/${creditAccountId}/collections`, {
    method: "POST",
    token,
    body: JSON.stringify({
      amount,
      paymentMethod,
      referenceNo: `PHASE9-FINAL-${Date.now()}`,
      remarks: `Phase 9 final collection - ${label}`,
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, `${label}: collection posted`);

  return result.body.data;
};

const cancelCollection = async ({ token, collectionId, label }) => {
  const result = await request(`/credit-accounts/collections/${collectionId}/cancel`, {
    method: "POST",
    token,
    body: JSON.stringify({
      cancellationReason: `Phase 9 final cancel test - ${label}`,
    }),
  });

  if (result.status !== 200) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 200, `${label}: collection cancelled`);

  return result.body.data;
};

const main = async () => {
  console.log("\nPHASE 9 FINAL TEST");
  console.log("------------------");

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

  const settings = await request("/settings/business-rules/installment", {
    token: adminLogin.token,
  });

  assert(settings.status === 200, "Installment settings can be viewed by admin");

  const compute = await request("/settings/business-rules/installment/test-compute", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      cashPromoTotalAmount: 10000,
      cashDownpayment: 2000,
      term: "MONTH_12",
    }),
  });

  assert(compute.status === 200, "Installment compute endpoint works");
  assert(toNumber(compute.body.data.basisUsed.termBasis) === 0.875, "MONTH_12 basis is 0.875");
  assert(toNumber(compute.body.data.result.regularPriceTotalAmount) === 11428.57, "Regular price computed correctly");
  assert(toNumber(compute.body.data.result.balance) === 9142.86, "Balance computed correctly");

  const sale = await createSaleForCredit({
    token: adminLogin.token,
    branchId,
    customerId: customer.id,
    amount: 10000,
    downpayment: 2000,
    label: "admin main flow",
  });

  const credit = await createCreditFromSale({
    token: adminLogin.token,
    saleId: sale.id,
    term: "MONTH_12",
    label: "admin main flow",
  });

  assert(credit.status === "ACTIVE", "Credit account status starts ACTIVE");
  assert(credit.term === "MONTH_12", "Credit account term saved");
  assert(toNumber(credit.termBasis) === 0.875, "Credit account termBasis preserved from settings");
  assert(toNumber(credit.cashPromoTotalAmount) === 10000, "Cash promo total saved");
  assert(toNumber(credit.downpaymentAmount) === 2000, "Downpayment saved from sale amountPaid");
  assert(toNumber(credit.regularPriceTotalAmount) === 11428.57, "Regular price total saved");
  assert(toNumber(credit.balanceAmount) === 9142.86, "Balance amount saved");
  assert(toNumber(credit.remainingBalance) === 9142.86, "Remaining balance initialized");

  const duplicateCredit = await request(`/sales/${sale.id}/credit-account`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      term: "MONTH_12",
      dueDay: 20,
    }),
  });

  assert(duplicateCredit.status === 400, "Duplicate credit account for same sale blocked");

  const list = await request(`/credit-accounts?search=${encodeURIComponent(credit.creditCode)}`, {
    token: adminLogin.token,
  });

  assert(list.status === 200, "Credit account list/search works");
  assert(list.body.data.data.some((item) => item.id === credit.id), "Credit account appears in list/search");

  const detail = await request(`/credit-accounts/${credit.id}`, {
    token: adminLogin.token,
  });

  assert(detail.status === 200, "Credit account detail works");
  assert(detail.body.data.id === credit.id, "Credit account detail correct id");
  assert(detail.body.data.customer.id === customer.id, "Credit account detail includes customer");
  assert(detail.body.data.sale.id === sale.id, "Credit account detail includes sale");

  const techList = await request("/credit-accounts", {
    token: techLogin.token,
  });

  assert(techList.status === 403, "Technician cannot view credit accounts");

  const techCollection = await request(`/credit-accounts/${credit.id}/collections`, {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      amount: 100,
      paymentMethod: "CASH",
    }),
  });

  assert(techCollection.status === 403, "Technician cannot post collection");

  const overPayment = await request(`/credit-accounts/${credit.id}/collections`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      amount: toNumber(credit.remainingBalance) + 1,
      paymentMethod: "CASH",
    }),
  });

  assert(overPayment.status === 400, "Overpayment is blocked");

  const firstCollection = await postCollection({
    token: adminLogin.token,
    creditAccountId: credit.id,
    amount: 1000,
    paymentMethod: "CASH",
    label: "partial payment",
  });

  assert(firstCollection.collection.status === "POSTED", "Partial collection status POSTED");
  assert(toNumber(firstCollection.creditAccount.totalCollected) === 1000, "Partial totalCollected updated");
  assert(toNumber(firstCollection.creditAccount.remainingBalance) === 8142.86, "Partial remainingBalance updated");
  assert(firstCollection.creditAccount.status === "ACTIVE", "Credit account remains ACTIVE after partial payment");

  const cancelPartial = await cancelCollection({
    token: adminLogin.token,
    collectionId: firstCollection.collection.id,
    label: "partial reversal",
  });

  assert(cancelPartial.collection.status === "CANCELLED", "Cancelled collection status saved");
  assert(toNumber(cancelPartial.creditAccount.totalCollected) === 0, "totalCollected restored after reversal");
  assert(toNumber(cancelPartial.creditAccount.remainingBalance) === 9142.86, "remainingBalance restored after reversal");
  assert(cancelPartial.creditAccount.status === "ACTIVE", "Credit account ACTIVE after reversal");

  const cancelAgain = await request(`/credit-accounts/collections/${firstCollection.collection.id}/cancel`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      cancellationReason: "Duplicate cancel should fail",
    }),
  });

  assert(cancelAgain.status === 400, "Already cancelled collection cannot be cancelled again");

  const finalCollection = await postCollection({
    token: adminLogin.token,
    creditAccountId: credit.id,
    amount: 9142.86,
    paymentMethod: "GCASH",
    label: "final payment",
  });

  assert(toNumber(finalCollection.creditAccount.remainingBalance) === 0, "Final payment clears remaining balance");
  assert(finalCollection.creditAccount.status === "PAID", "Credit account becomes PAID after final payment");
  assert(Boolean(finalCollection.creditAccount.paidAt), "paidAt saved after final payment");

  const paidExtraPayment = await request(`/credit-accounts/${credit.id}/collections`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      amount: 1,
      paymentMethod: "CASH",
    }),
  });

  assert(paidExtraPayment.status === 400, "PAID account cannot receive extra payment");

  const reverseFinal = await cancelCollection({
    token: adminLogin.token,
    collectionId: finalCollection.collection.id,
    label: "final payment reversal",
  });

  assert(reverseFinal.creditAccount.status === "ACTIVE", "Reversing final payment returns account to ACTIVE");
  assert(toNumber(reverseFinal.creditAccount.remainingBalance) === 9142.86, "Reversing final payment restores balance");
  assert(reverseFinal.creditAccount.paidAt === null, "paidAt cleared after reversing final payment");

  const superSale = await createSaleForCredit({
    token: superLogin.token,
    branchId,
    customerId: customer.id,
    amount: 5000,
    downpayment: 500,
    label: "super owner branch flow",
  });

  const superCredit = await createCreditFromSale({
    token: superLogin.token,
    saleId: superSale.id,
    term: "MONTH_6",
    label: "super owner branch flow",
  });

  assert(toNumber(superCredit.termBasis) === 0.935, "Super Owner MONTH_6 term basis from settings");

  const superList = await request(`/credit-accounts?branchId=${branchId}`, {
    token: superLogin.token,
  });

  assert(superList.status === 200, "Super Owner can list branch credit accounts");
  assert(superList.body.data.data.some((item) => item.id === superCredit.id), "Super Owner list includes created credit account");

  const superCollection = await postCollection({
    token: superLogin.token,
    creditAccountId: superCredit.id,
    amount: 500,
    paymentMethod: "BANK_TRANSFER",
    label: "super owner collection",
  });

  const superCancel = await cancelCollection({
    token: superLogin.token,
    collectionId: superCollection.collection.id,
    label: "super owner collection cancel",
  });

  assert(superCancel.collection.status === "CANCELLED", "Super Owner can cancel collection");

  const missingCredit = await request("/credit-accounts/not-existing-credit-account-id", {
    token: adminLogin.token,
  });

  assert(missingCredit.status === 404, "Missing credit account detail returns 404");

  const missingCollectionCancel = await request("/credit-accounts/collections/not-existing-collection-id/cancel", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      cancellationReason: "Missing collection cancel test",
    }),
  });

  assert(missingCollectionCancel.status === 404, "Missing collection cancel returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 9 FINAL TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 9 FINAL TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
