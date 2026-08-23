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
  cashier: {
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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log("PASS: " + message);
};

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.data?.token) {
    console.dir(result.body, { depth: null });
    throw new Error("Login failed for " + user.identifier);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const main = async () => {
  console.log("\nPHASE 13 MODULE 13C: Supplier API CRUD Test");
  console.log("-------------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const cashierLogin = await login(users.cashier);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "STEST-13C-",
      },
    },
  });

  assert(true, "Previous 13C supplier API test data cleared");

  const missingTokenList = await request("/suppliers");
  assert(missingTokenList.status === 401, "List suppliers blocks missing token");

  const cashierList = await request("/suppliers", {
    token: cashierLogin.token,
  });

  assert(cashierList.status === 403, "Non supplier role cannot list suppliers");

  const missingName = await request("/suppliers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      contactNo: "09170001330",
    }),
  });

  assert(missingName.status === 400, "Create supplier validates missing name");

  const adminCreate = await request("/suppliers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      supplierCode: "STEST-13C-BRANCH",
      name: "13C Branch Supplier",
      contactPerson: "Branch Person",
      contactNo: "09170001331",
      email: "branch13c@supplier.test",
      address: "Branch supplier API address",
      tin: "TIN-13C-BRANCH",
      notes: "Branch supplier API test",
    }),
  });

  if (adminCreate.status !== 201) {
    console.dir(adminCreate.body, { depth: null });
  }

  assert(adminCreate.status === 201, "Admin can create branch supplier");
  assert(adminCreate.body.data.supplierCode === "STEST-13C-BRANCH", "Supplier code saved uppercase");
  assert(adminCreate.body.data.branch.id === branchId, "Admin supplier linked to own branch");
  assert(adminCreate.body.data.createdBy.id === adminLogin.user.id, "createdBy is admin");
  assert(adminCreate.body.data.updatedBy.id === adminLogin.user.id, "updatedBy is admin");

  const duplicate = await request("/suppliers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      supplierCode: "STEST-13C-BRANCH",
      name: "13C Duplicate Supplier",
    }),
  });

  assert(duplicate.status === 409, "Duplicate supplier code is blocked in same branch");

  const superGlobalCreate = await request("/suppliers", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      supplierCode: "STEST-13C-GLOBAL",
      name: "13C Global Supplier",
      contactPerson: "Global Person",
      contactNo: "09170001332",
      email: "global13c@supplier.test",
      address: "Global supplier API address",
      tin: "TIN-13C-GLOBAL",
      notes: "Global supplier API test",
    }),
  });

  if (superGlobalCreate.status !== 201) {
    console.dir(superGlobalCreate.body, { depth: null });
  }

  assert(superGlobalCreate.status === 201, "Super Owner can create global supplier");
  assert(superGlobalCreate.body.data.branchId === null, "Global supplier branch is null");

  const superBranchCreate = await request("/suppliers", {
    method: "POST",
    token: superLogin.token,
    body: JSON.stringify({
      branchId,
      supplierCode: "STEST-13C-SUPER-BRANCH",
      name: "13C Super Branch Supplier",
    }),
  });

  assert(superBranchCreate.status === 201, "Super Owner can create branch supplier with branchId");
  assert(superBranchCreate.body.data.branch.id === branchId, "Super branch supplier linked to selected branch");

  const listAdmin = await request("/suppliers", {
    token: adminLogin.token,
  });

  assert(listAdmin.status === 200, "Admin can list suppliers");
  assert(Array.isArray(listAdmin.body.data.items), "List returns items array");
  assert(
    listAdmin.body.data.items.some((supplier) => supplier.id === adminCreate.body.data.id),
    "Admin list includes branch supplier"
  );
  assert(
    listAdmin.body.data.items.some((supplier) => supplier.id === superGlobalCreate.body.data.id),
    "Admin list includes global supplier"
  );

  const searchList = await request("/suppliers?search=Global", {
    token: adminLogin.token,
  });

  assert(searchList.status === 200, "Supplier search works");
  assert(
    searchList.body.data.items.some((supplier) => supplier.id === superGlobalCreate.body.data.id),
    "Supplier search finds global supplier"
  );

  const statusList = await request("/suppliers?status=ACTIVE", {
    token: adminLogin.token,
  });

  assert(statusList.status === 200, "Supplier status filter works");
  assert(statusList.body.data.items.every((supplier) => supplier.status === "ACTIVE"), "Status filter returns active only");

  const pageList = await request("/suppliers?page=1&limit=1", {
    token: adminLogin.token,
  });

  assert(pageList.status === 200, "Supplier pagination works");
  assert(pageList.body.data.items.length <= 1, "Supplier pagination limit respected");

  const viewOne = await request(`/suppliers/${adminCreate.body.data.id}`, {
    token: adminLogin.token,
  });

  assert(viewOne.status === 200, "Admin can view branch supplier");
  assert(viewOne.body.data.id === adminCreate.body.data.id, "View returns correct supplier");

  const viewGlobal = await request(`/suppliers/${superGlobalCreate.body.data.id}`, {
    token: adminLogin.token,
  });

  assert(viewGlobal.status === 200, "Admin can view global supplier");

  const updateOne = await request(`/suppliers/${adminCreate.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      name: "13C Branch Supplier Updated",
      contactPerson: "Updated Person",
      notes: "Updated supplier API test",
    }),
  });

  if (updateOne.status !== 200) {
    console.dir(updateOne.body, { depth: null });
  }

  assert(updateOne.status === 200, "Admin can update own branch supplier");
  assert(updateOne.body.data.name === "13C Branch Supplier Updated", "Supplier name updated");
  assert(updateOne.body.data.contactPerson === "Updated Person", "Supplier contact person updated");

  const adminUpdateGlobal = await request(`/suppliers/${superGlobalCreate.body.data.id}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      name: "Should not update global",
    }),
  });

  assert(adminUpdateGlobal.status === 403, "Admin cannot update global supplier");

  const statusUpdate = await request(`/suppliers/${adminCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "INACTIVE",
    }),
  });

  assert(statusUpdate.status === 200, "Admin can update supplier status");
  assert(statusUpdate.body.data.status === "INACTIVE", "Supplier status updated to INACTIVE");

  const invalidStatus = await request(`/suppliers/${adminCreate.body.data.id}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "DISABLED",
    }),
  });

  assert(invalidStatus.status === 400, "Invalid supplier status is blocked");

  const missingSupplier = await request("/suppliers/not-existing-supplier-id", {
    token: adminLogin.token,
  });

  assert(missingSupplier.status === 404, "Missing supplier view returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 13 MODULE 13C SUPPLIER API CRUD TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 13 MODULE 13C SUPPLIER API CRUD TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
