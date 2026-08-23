require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";
const unique = Date.now();

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

const getOrCreateCustomer = async (branchId, userId) => {
  const existingCustomer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  if (existingCustomer) {
    return existingCustomer;
  }

  return prisma.customer.create({
    data: {
      customerCode: `CUST-PHASE9-${unique}`,
      fullName: "Phase 9 Credit Test Customer",
      mobileNumber: "09000000000",
      address: "Phase 9 Test Address",
      status: "ACTIVE",
      branchId,
      createdById: userId,
      updatedById: userId,
    },
  });
};

const createSaleForCredit = async ({ token, branchId, customerId, grandTotal, amountPaid }) => {
  return request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId,
      customerId,
      remarks: "Phase 9 Module 3 credit account sale.",
      items: [
        {
          description: `Phase 9 credit custom sale ${unique}`,
          quantity: 1,
          unitPrice: grandTotal,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: amountPaid > 0 ? "CASH" : "CREDIT",
          amount: amountPaid,
          remarks: "Phase 9 credit downpayment.",
        },
      ],
    }),
  });
};

const main = async () => {
  console.log("\nPhase 9 Module 3: Create Credit Account from Sale Test");
  console.log("------------------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);
  const superLogin = await login(users.superOwner);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;
  assert(Boolean(branchId), "Admin branch detected");

  const customer = await getOrCreateCustomer(branchId, adminLogin.user.id);
  assert(Boolean(customer.id), "Active customer ready");

  const noTokenResult = await request("/sales/not-existing-sale-id/credit-account", {
    method: "POST",
    body: JSON.stringify({
      term: "MONTH_12",
    }),
  });

  assert([401, 403].includes(noTokenResult.status), "Credit account creation blocks missing token");

  const techResult = await request("/sales/not-existing-sale-id/credit-account", {
    method: "POST",
    token: techLogin.token,
    body: JSON.stringify({
      term: "MONTH_12",
    }),
  });

  assert(techResult.status === 403, "Technician cannot create credit account");

  const saleWithoutCustomer = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      remarks: "Phase 9 Module 3 sale without customer.",
      items: [
        {
          description: "Sale without customer for credit block",
          quantity: 1,
          unitPrice: 1000,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CREDIT",
          amount: 0,
        },
      ],
    }),
  });

  assert(saleWithoutCustomer.status === 201, "Sale without customer created for block test");

  const noCustomerCredit = await request(`/sales/${saleWithoutCustomer.body.data.id}/credit-account`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      term: "MONTH_12",
    }),
  });

  assert(noCustomerCredit.status === 400, "Sale without customer cannot create credit account");

  const sale = await createSaleForCredit({
    token: adminLogin.token,
    branchId,
    customerId: customer.id,
    grandTotal: 10000,
    amountPaid: 2000,
  });

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Sale for credit account created");
  assert(Number(sale.body.data.grandTotal) === 10000, "Sale grand total is 10000");
  assert(Number(sale.body.data.amountPaid) === 2000, "Sale amount paid is 2000");

  const invalidTerm = await request(`/sales/${sale.body.data.id}/credit-account`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      term: "MONTH_99",
    }),
  });

  assert(invalidTerm.status === 400, "Invalid installment term blocked by validation");

  const credit = await request(`/sales/${sale.body.data.id}/credit-account`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      term: "MONTH_12",
      dueDay: 15,
      firstDueDate: "2026-09-15",
      remarks: "Phase 9 Module 3 credit account test.",
    }),
  });

  if (credit.status !== 201) {
    console.dir(credit.body, { depth: null });
  }

  assert(credit.status === 201, "Credit account created from sale");
  assert(credit.body.data.creditCode.startsWith("CRD-MAIN-"), "Credit code generated");
  assert(credit.body.data.status === "ACTIVE", "Credit account status ACTIVE");
  assert(credit.body.data.term === "MONTH_12", "Credit account term saved");
  assert(Number(credit.body.data.termBasis) === 0.875, "Credit account term basis saved from settings");
  assert(Number(credit.body.data.cashPromoTotalAmount) === 10000, "Cash promo total saved");
  assert(Number(credit.body.data.downpaymentAmount) === 2000, "Downpayment saved from sale amountPaid");
  assert(Number(credit.body.data.regularPriceTotalAmount) === 11428.57, "Regular price total computed from settings");
  assert(Number(credit.body.data.balanceAmount) === 9142.86, "Balance amount computed from settings");
  assert(Number(credit.body.data.remainingBalance) === 9142.86, "Remaining balance initialized");
  assert(Number(credit.body.data.monthlyDueAmount) === 761.91, "Monthly due computed");
  assert(credit.body.data.customer.id === customer.id, "Credit account customer linked");
  assert(credit.body.data.sale.id === sale.body.data.id, "Credit account sale linked");

  const dbCredit = await prisma.creditAccount.findUnique({
    where: {
      saleId: sale.body.data.id,
    },
  });

  assert(Boolean(dbCredit), "Credit account saved in database");
  assert(dbCredit.status === "ACTIVE", "Database credit account status ACTIVE");

  const duplicate = await request(`/sales/${sale.body.data.id}/credit-account`, {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      term: "MONTH_12",
    }),
  });

  assert(duplicate.status === 400, "Duplicate credit account for same sale blocked");

  const missingSale = await request("/sales/not-existing-sale-id/credit-account", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      term: "MONTH_12",
    }),
  });

  assert(missingSale.status === 404, "Missing sale returns 404");

  const superSale = await createSaleForCredit({
    token: superLogin.token,
    branchId,
    customerId: customer.id,
    grandTotal: 5000,
    amountPaid: 1000,
  });

  assert(superSale.status === 201, "Super Owner sale for credit created with branchId");

  const superCredit = await request(`/sales/${superSale.body.data.id}/credit-account`, {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      term: "MONTH_6",
      dueDay: 10,
      remarks: "Super Owner Phase 9 Module 3 credit account.",
    }),
  });

  assert(superCredit.status === 201, "Super Owner can create credit account from sale");
  assert(Number(superCredit.body.data.termBasis) === 0.935, "Super Owner MONTH_6 basis from settings used");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 9 MODULE 3 CREATE CREDIT ACCOUNT FROM SALE TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 9 MODULE 3 CREATE CREDIT ACCOUNT FROM SALE TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
