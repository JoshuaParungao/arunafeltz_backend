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

const createClaim = async (token, body) => {
  const result = await request("/warranty-claims", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Warranty claim created");

  return result.body.data;
};

const updateStatus = async (token, id, status, extra = {}) => {
  const result = await request(`/warranty-claims/${id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify({
      status,
      ...extra,
    }),
  });

  if (result.status !== 200) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 200, `Warranty claim moved to ${status}`);

  return result.body.data;
};

const main = async () => {
  console.log("\nPHASE 12 MODULE 12F: Warranty List / View Test");
  console.log("----------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);
  const superOwnerLogin = await login(users.superOwner);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.warrantyClaim.deleteMany({
    where: {
      branchId,
    },
  });

  assert(true, "Previous warranty list/view test data cleared");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const item = await prisma.item.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(item), "Active item found");

  const serial = await prisma.itemSerial.findFirst({
    where: {
      branchId,
      itemId: item.id,
    },
  });

  const claimOne = await createClaim(adminLogin.token, {
    customerId: customer.id,
    itemId: item.id,
    serialId: serial ? serial.id : undefined,
    issueDescription: "12F Alpha no display warranty",
    customerComplaint: "Alpha complaint",
    remarks: "Alpha remarks",
  });

  const claimTwo = await createClaim(adminLogin.token, {
    customerId: customer.id,
    itemId: item.id,
    issueDescription: "12F Beta supplier warranty",
    customerComplaint: "Beta complaint",
    remarks: "Beta remarks",
  });

  await updateStatus(adminLogin.token, claimTwo.id, "CHECKING", {
    diagnosis: "Beta diagnosis",
  });

  await updateStatus(adminLogin.token, claimTwo.id, "SENT_TO_SUPPLIER", {
    supplierName: "12F Supplier Center",
    supplierReferenceNo: "SUP-12F-002",
    remarks: "Sent to supplier",
  });

  const missingToken = await request("/warranty-claims");

  assert(missingToken.status === 401, "List warranty claims blocks missing token");

  const listAll = await request("/warranty-claims", {
    token: adminLogin.token,
  });

  if (listAll.status !== 200) {
    console.dir(listAll.body, { depth: null });
  }

  assert(listAll.status === 200, "Admin can list warranty claims");
  assert(Array.isArray(listAll.body.data), "List data is array");
  assert(listAll.body.data.some((claim) => claim.id === claimOne.id), "List includes first claim");
  assert(listAll.body.data.some((claim) => claim.id === claimTwo.id), "List includes second claim");
  assert(typeof listAll.body.meta.total === "number", "List includes meta total");

  const statusFilter = await request("/warranty-claims?status=SENT_TO_SUPPLIER", {
    token: adminLogin.token,
  });

  assert(statusFilter.status === 200, "Status filter works");
  assert(statusFilter.body.data.every((claim) => claim.status === "SENT_TO_SUPPLIER"), "Status filter returns selected status only");
  assert(statusFilter.body.data.some((claim) => claim.id === claimTwo.id), "Status filter includes supplier claim");

  const customerFilter = await request(`/warranty-claims?customerId=${customer.id}`, {
    token: adminLogin.token,
  });

  assert(customerFilter.status === 200, "Customer filter works");
  assert(customerFilter.body.data.every((claim) => claim.customer?.id === customer.id), "Customer filter returns selected customer only");

  const itemFilter = await request(`/warranty-claims?itemId=${item.id}`, {
    token: adminLogin.token,
  });

  assert(itemFilter.status === 200, "Item filter works");
  assert(itemFilter.body.data.every((claim) => claim.item?.id === item.id), "Item filter returns selected item only");

  if (serial) {
    const serialFilter = await request(`/warranty-claims?serialId=${serial.id}`, {
      token: adminLogin.token,
    });

    assert(serialFilter.status === 200, "Serial filter works");
    assert(serialFilter.body.data.every((claim) => claim.serial?.id === serial.id), "Serial filter returns selected serial only");
  } else {
    console.log("SKIP: No serial found for serial filter test");
  }

  const supplierFilter = await request("/warranty-claims?supplierName=12F%20Supplier", {
    token: adminLogin.token,
  });

  assert(supplierFilter.status === 200, "Supplier name filter works");
  assert(supplierFilter.body.data.some((claim) => claim.id === claimTwo.id), "Supplier filter includes supplier claim");

  const searchCode = await request(`/warranty-claims?search=${encodeURIComponent(claimOne.claimCode)}`, {
    token: adminLogin.token,
  });

  assert(searchCode.status === 200, "Search by claim code works");
  assert(searchCode.body.data.some((claim) => claim.id === claimOne.id), "Search by claim code finds first claim");

  const searchIssue = await request("/warranty-claims?search=Beta%20supplier", {
    token: adminLogin.token,
  });

  assert(searchIssue.status === 200, "Search by issue description works");
  assert(searchIssue.body.data.some((claim) => claim.id === claimTwo.id), "Search by issue finds second claim");

  const today = new Date().toISOString().slice(0, 10);

  const dateFilter = await request(`/warranty-claims?dateFrom=${today}&dateTo=${today}`, {
    token: adminLogin.token,
  });

  assert(dateFilter.status === 200, "Date filter works");
  assert(dateFilter.body.data.some((claim) => claim.id === claimOne.id), "Date filter includes first claim");

  const pagination = await request("/warranty-claims?page=1&limit=1", {
    token: adminLogin.token,
  });

  assert(pagination.status === 200, "Pagination works");
  assert(pagination.body.data.length <= 1, "Pagination limit respected");
  assert(pagination.body.meta.limit === 1, "Pagination meta limit saved");

  const viewOne = await request(`/warranty-claims/${claimOne.id}`, {
    token: adminLogin.token,
  });

  if (viewOne.status !== 200) {
    console.dir(viewOne.body, { depth: null });
  }

  assert(viewOne.status === 200, "Admin can view warranty claim detail");
  assert(viewOne.body.data.id === claimOne.id, "View returns correct warranty claim");
  assert(Boolean(viewOne.body.data.branch), "View includes branch");
  assert(Boolean(viewOne.body.data.customer), "View includes customer");
  assert(Boolean(viewOne.body.data.item), "View includes item");

  const techList = await request("/warranty-claims", {
    token: techLogin.token,
  });

  assert(techList.status === 200, "Technician can list own branch warranty claims");
  assert(techList.body.data.every((claim) => claim.branch.id === branchId), "Technician list is branch-scoped");

  const techView = await request(`/warranty-claims/${claimOne.id}`, {
    token: techLogin.token,
  });

  assert(techView.status === 200, "Technician can view own branch warranty claim");

  const superList = await request(`/warranty-claims?branchId=${branchId}`, {
    token: superOwnerLogin.token,
  });

  assert(superList.status === 200, "Super Owner can list warranty claims with branch filter");
  assert(superList.body.data.some((claim) => claim.id === claimOne.id), "Super Owner branch filter includes first claim");

  const missingView = await request("/warranty-claims/not-existing-warranty-claim-id", {
    token: adminLogin.token,
  });

  assert(missingView.status === 404, "Missing warranty claim view returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 12 MODULE 12F WARRANTY LIST / VIEW TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 12 MODULE 12F WARRANTY LIST / VIEW TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
