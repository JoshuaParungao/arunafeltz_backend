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

const createHandover = async ({ token, cashBoxId, amount, remarks }) => {
  const result = await request(`/cash-boxes/${cashBoxId}/handovers`, {
    method: "POST",
    token,
    body: JSON.stringify({
      amount,
      remarks,
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Pending handover created");

  return result.body.data;
};

const cancelHandover = async ({ token, handoverId }) => {
  const result = await request(`/cash-boxes/handovers/${handoverId}/cancel`, {
    method: "POST",
    token,
    body: JSON.stringify({
      cancellationReason: "Phase 10 Module 7E cancel filter test.",
    }),
  });

  if (result.status !== 200) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 200, "Handover cancelled for filter test");

  return result.body.data;
};

const receiveHandover = async ({ token, handoverId }) => {
  const result = await request(`/cash-boxes/handovers/${handoverId}/receive`, {
    method: "POST",
    token,
    body: JSON.stringify({
      remarks: "Phase 10 Module 7E receive filter test.",
    }),
  });

  if (result.status !== 200) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 200, "Handover received for filter test");

  return result.body.data.handover;
};

const main = async () => {
  console.log("\nPHASE 10 MODULE 7E: List/View Cash Handovers Test");
  console.log("-------------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);
  const superLogin = await login(users.superOwner);

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
      type: "HANDOVER_OUT",
    },
  });

  await prisma.cashHandover.deleteMany({
    where: {
      branchId,
    },
  });

  await prisma.cashBox.update({
    where: {
      id: cashBox.id,
    },
    data: {
      currentBalance: "10000.00",
    },
  });

  assert(true, "Cash handover test data cleared");

  const pendingHandover = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 100,
    remarks: "Phase 10 Module 7E pending handover.",
  });

  const cancelledBase = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 200,
    remarks: "Phase 10 Module 7E cancelled handover.",
  });

  const cancelledHandover = await cancelHandover({
    token: adminLogin.token,
    handoverId: cancelledBase.id,
  });

  const receivedBase = await createHandover({
    token: adminLogin.token,
    cashBoxId: cashBox.id,
    amount: 300,
    remarks: "Phase 10 Module 7E received handover.",
  });

  const receivedHandover = await receiveHandover({
    token: adminLogin.token,
    handoverId: receivedBase.id,
  });

  const noTokenList = await request("/cash-boxes/handovers");

  assert([401, 403].includes(noTokenList.status), "List handovers blocks missing token");

  const techList = await request("/cash-boxes/handovers", {
    token: techLogin.token,
  });

  assert(techList.status === 403, "Technician cannot list handovers");

  const adminList = await request("/cash-boxes/handovers?limit=50", {
    token: adminLogin.token,
  });

  if (adminList.status !== 200) {
    console.dir(adminList.body, { depth: null });
  }

  assert(adminList.status === 200, "Admin can list own branch handovers");
  assert(Array.isArray(adminList.body.data), "List returns array");
  assert(adminList.body.data.length >= 3, "List returns created handovers");
  assert(adminList.body.meta.total >= 3, "List meta total works");
  assert(adminList.body.data.every((item) => item.branch.id === branchId), "Admin list scoped to own branch");

  const pendingList = await request("/cash-boxes/handovers?status=PENDING", {
    token: adminLogin.token,
  });

  assert(pendingList.status === 200, "Status PENDING filter works");
  assert(pendingList.body.data.some((item) => item.id === pendingHandover.id), "Pending handover appears in PENDING filter");
  assert(pendingList.body.data.every((item) => item.status === "PENDING"), "PENDING filter only returns pending");

  const cancelledList = await request("/cash-boxes/handovers?status=CANCELLED", {
    token: adminLogin.token,
  });

  assert(cancelledList.status === 200, "Status CANCELLED filter works");
  assert(cancelledList.body.data.some((item) => item.id === cancelledHandover.id), "Cancelled handover appears in CANCELLED filter");
  assert(cancelledList.body.data.every((item) => item.status === "CANCELLED"), "CANCELLED filter only returns cancelled");

  const receivedList = await request("/cash-boxes/handovers?status=RECEIVED", {
    token: adminLogin.token,
  });

  assert(receivedList.status === 200, "Status RECEIVED filter works");
  assert(receivedList.body.data.some((item) => item.id === receivedHandover.id), "Received handover appears in RECEIVED filter");
  assert(receivedList.body.data.every((item) => item.status === "RECEIVED"), "RECEIVED filter only returns received");

  const cashBoxFilter = await request(`/cash-boxes/handovers?cashBoxId=${cashBox.id}`, {
    token: adminLogin.token,
  });

  assert(cashBoxFilter.status === 200, "cashBoxId filter works");
  assert(cashBoxFilter.body.data.every((item) => item.cashBox.id === cashBox.id), "cashBoxId filter returns same cash box only");

  const adminView = await request(`/cash-boxes/handovers/${pendingHandover.id}`, {
    token: adminLogin.token,
  });

  assert(adminView.status === 200, "Admin can view own branch handover");
  assert(adminView.body.data.id === pendingHandover.id, "View returns correct handover");

  const superList = await request("/cash-boxes/handovers?limit=50", {
    token: superLogin.token,
  });

  assert(superList.status === 200, "Super Owner can list handovers");

  const superView = await request(`/cash-boxes/handovers/${pendingHandover.id}`, {
    token: superLogin.token,
  });

  assert(superView.status === 200, "Super Owner can view handover");

  const missingView = await request("/cash-boxes/handovers/not-existing-handover-id", {
    token: adminLogin.token,
  });

  assert(missingView.status === 404, "Missing handover returns 404");

  const invalidStatus = await request("/cash-boxes/handovers?status=BAD_STATUS", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid status filter blocked");

  const invalidDate = await request("/cash-boxes/handovers?dateFrom=bad-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid dateFrom blocked");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 10 MODULE 7E LIST/VIEW CASH HANDOVERS TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 10 MODULE 7E LIST/VIEW CASH HANDOVERS TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
