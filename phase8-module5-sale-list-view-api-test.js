require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
  superOwner: {
    identifier: "superowner",
    password: "Password123!",
  },
  admin: {
    identifier: "mainadmin",
    password: "Password123!",
  },
  technician: {
    identifier: "pendingtech",
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

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.success || !result.body?.data?.token) {
    throw new Error(`Login failed for ${user.identifier}: ${JSON.stringify(result.body)}`);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const main = async () => {
  console.log("\nPhase 8 Module 5: Sale List / View API Test");
  console.log("-------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const mainBranch = await prisma.branch.findFirst({
    where: {
      code: "MAIN",
    },
  });

  assert(Boolean(mainBranch), "MAIN branch found");

  const noTokenList = await request("/sales");

  assert(noTokenList.status === 401, "Sale list blocks missing token");

  const noTokenView = await request("/sales/not-existing-sale-id");

  assert(noTokenView.status === 401, "Sale view blocks missing token");

  const createSale = await request("/sales", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      remarks: "Phase 8 Module 5 read test sale.",
      items: [
        {
          description: "Phase 8 Module 5 custom labor",
          quantity: 1,
          unitPrice: 1234,
          discountAmount: 34,
        },
      ],
      payments: [
        {
          paymentMethod: "CASH",
          amount: 1200,
        },
      ],
    }),
  });

  if (createSale.status !== 201) {
    console.dir(createSale.body, { depth: null });
  }

  assert(createSale.status === 201, "Admin created custom sale for list/view test");
  assert(createSale.body.data.receiptCode.startsWith("RCPT-MAIN-"), "Created sale has MAIN receipt code");

  const saleId = createSale.body.data.id;
  const receiptCode = createSale.body.data.receiptCode;

  const adminList = await request(`/sales?search=${encodeURIComponent(receiptCode)}`, {
    token: adminLogin.token,
  });

  assert(adminList.status === 200, "Admin can search sales list");
  assert(Array.isArray(adminList.body.data.data), "Sales list returns data array");
  assert(adminList.body.data.data.some((sale) => sale.id === saleId), "Admin list includes created sale");
  assert(adminList.body.data.meta.total >= 1, "Sales list meta total returned");

  const adminListPagination = await request("/sales?page=1&limit=1", {
    token: adminLogin.token,
  });

  assert(adminListPagination.status === 200, "Admin can use pagination");
  assert(adminListPagination.body.data.data.length <= 1, "Pagination limit respected");
  assert(adminListPagination.body.data.meta.page === 1, "Pagination page returned");
  assert(adminListPagination.body.data.meta.limit === 1, "Pagination limit returned");

  const adminStatusFilter = await request("/sales?status=COMPLETED", {
    token: adminLogin.token,
  });

  assert(adminStatusFilter.status === 200, "Admin can filter by sale status");

  const adminPaymentStatusFilter = await request("/sales?paymentStatus=PAID", {
    token: adminLogin.token,
  });

  assert(adminPaymentStatusFilter.status === 200, "Admin can filter by payment status");

  const techList = await request(`/sales?search=${encodeURIComponent(receiptCode)}`, {
    token: techLogin.token,
  });

  assert(techList.status === 200, "Technician can view own branch sales list");
  assert(techList.body.data.data.some((sale) => sale.id === saleId), "Technician list includes own branch sale");

  const superList = await request(`/sales?branchId=${mainBranch.id}&search=${encodeURIComponent(receiptCode)}`, {
    token: superLogin.token,
  });

  assert(superList.status === 200, "Super Owner can filter sales by branchId");
  assert(superList.body.data.data.some((sale) => sale.id === saleId), "Super Owner branch filter includes created sale");

  const adminView = await request(`/sales/${saleId}`, {
    token: adminLogin.token,
  });

  assert(adminView.status === 200, "Admin can view sale detail");
  assert(adminView.body.data.id === saleId, "Admin viewed correct sale");
  assert(adminView.body.data.items.length === 1, "Sale detail includes items");
  assert(adminView.body.data.payments.length === 1, "Sale detail includes payments");
  assert(adminView.body.data.items[0].description === "Phase 8 Module 5 custom labor", "Sale item detail correct");
  assert(adminView.body.data.branch.code === "MAIN", "Sale detail includes branch");

  const techView = await request(`/sales/${saleId}`, {
    token: techLogin.token,
  });

  assert(techView.status === 200, "Technician can view own branch sale detail");
  assert(techView.body.data.id === saleId, "Technician viewed correct sale");

  const superView = await request(`/sales/${saleId}`, {
    token: superLogin.token,
  });

  assert(superView.status === 200, "Super Owner can view sale detail");
  assert(superView.body.data.id === saleId, "Super Owner viewed correct sale");

  const missingView = await request("/sales/not-existing-sale-id", {
    token: adminLogin.token,
  });

  assert(missingView.status === 404, "Missing sale view returns 404");

  console.log("\nPHASE 8 MODULE 5 SALE LIST / VIEW API TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 8 MODULE 5 SALE LIST / VIEW API TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
