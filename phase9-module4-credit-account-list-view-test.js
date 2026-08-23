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

const createSaleForCredit = async ({ token, branchId, customerId }) => {
  const sale = await request("/sales", {
    method: "POST",
    token,
    body: JSON.stringify({
      branchId,
      customerId,
      remarks: "Phase 9 Module 4 list/view credit test sale.",
      items: [
        {
          description: `Phase 9 Module 4 custom sale ${Date.now()}`,
          quantity: 1,
          unitPrice: 7000,
          discountAmount: 0,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 1000,
        },
      ],
    }),
  });

  if (sale.status !== 201) {
    console.dir(sale.body, { depth: null });
  }

  assert(sale.status === 201, "Sale for Module 4 credit account created");

  return sale.body.data;
};

const createCreditFromSale = async ({ token, saleId }) => {
  const credit = await request(`/sales/${saleId}/credit-account`, {
    method: "POST",
    token,
    body: JSON.stringify({
      term: "MONTH_6",
      dueDay: 20,
      remarks: "Phase 9 Module 4 credit list/view test.",
    }),
  });

  if (credit.status !== 201) {
    console.dir(credit.body, { depth: null });
  }

  assert(credit.status === 201, "Credit account for Module 4 created");

  return credit.body.data;
};

const main = async () => {
  console.log("\nPhase 9 Module 4: Credit Account List / View Test");
  console.log("-------------------------------------------------");

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
  });

  const credit = await createCreditFromSale({
    token: adminLogin.token,
    saleId: sale.id,
  });

  const noTokenList = await request("/credit-accounts");

  assert([401, 403].includes(noTokenList.status), "Credit account list blocks missing token");

  const techList = await request("/credit-accounts", {
    token: techLogin.token,
  });

  assert(techList.status === 403, "Technician cannot view credit account list");

  const adminList = await request("/credit-accounts", {
    token: adminLogin.token,
  });

  if (adminList.status !== 200) {
    console.dir(adminList.body, { depth: null });
  }

  assert(adminList.status === 200, "Admin can view own branch credit account list");
  assert(Array.isArray(adminList.body.data.data), "Credit account list data is array");
  assert(adminList.body.data.data.some((item) => item.id === credit.id), "Credit account list includes created credit account");
  assert(adminList.body.data.meta.total >= 1, "Credit account list returns meta total");

  const searchList = await request(`/credit-accounts?search=${encodeURIComponent(credit.creditCode)}`, {
    token: adminLogin.token,
  });

  assert(searchList.status === 200, "Credit account search works");
  assert(searchList.body.data.data.some((item) => item.id === credit.id), "Credit account search finds created credit account");

  const statusList = await request("/credit-accounts?status=ACTIVE", {
    token: adminLogin.token,
  });

  assert(statusList.status === 200, "Credit account status filter works");
  assert(statusList.body.data.data.every((item) => item.status === "ACTIVE"), "Status filter returns ACTIVE accounts only");

  const termList = await request("/credit-accounts?term=MONTH_6", {
    token: adminLogin.token,
  });

  assert(termList.status === 200, "Credit account term filter works");
  assert(termList.body.data.data.some((item) => item.id === credit.id), "Term filter includes created MONTH_6 credit account");

  const customerList = await request(`/credit-accounts?customerId=${customer.id}`, {
    token: adminLogin.token,
  });

  assert(customerList.status === 200, "Credit account customer filter works");
  assert(customerList.body.data.data.some((item) => item.customer.id === customer.id), "Customer filter returns matching customer");

  const saleList = await request(`/credit-accounts?saleId=${sale.id}`, {
    token: adminLogin.token,
  });

  assert(saleList.status === 200, "Credit account sale filter works");
  assert(saleList.body.data.data.some((item) => item.sale.id === sale.id), "Sale filter returns matching sale");

  const adminDetail = await request(`/credit-accounts/${credit.id}`, {
    token: adminLogin.token,
  });

  if (adminDetail.status !== 200) {
    console.dir(adminDetail.body, { depth: null });
  }

  assert(adminDetail.status === 200, "Admin can view credit account detail");
  assert(adminDetail.body.data.id === credit.id, "Credit account detail returns correct id");
  assert(adminDetail.body.data.customer.id === customer.id, "Credit account detail includes customer");
  assert(adminDetail.body.data.sale.id === sale.id, "Credit account detail includes sale");
  assert(Array.isArray(adminDetail.body.data.collections), "Credit account detail includes collections array");

  const superList = await request(`/credit-accounts?branchId=${branchId}`, {
    token: superLogin.token,
  });

  assert(superList.status === 200, "Super Owner can view credit accounts by branchId");
  assert(superList.body.data.data.some((item) => item.id === credit.id), "Super Owner branch filter includes created credit account");

  const superDetail = await request(`/credit-accounts/${credit.id}`, {
    token: superLogin.token,
  });

  assert(superDetail.status === 200, "Super Owner can view credit account detail");

  const missingDetail = await request("/credit-accounts/not-existing-credit-id", {
    token: adminLogin.token,
  });

  assert(missingDetail.status === 404, "Missing credit account detail returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 9 MODULE 4 CREDIT ACCOUNT LIST / VIEW TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 9 MODULE 4 CREDIT ACCOUNT LIST / VIEW TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
