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

const createJob = async (token, customerId, technicianId, title, charge) => {
  const create = await request("/service-jobs", {
    method: "POST",
    token,
    body: JSON.stringify({
      customerId,
      assignedTechnicianId: technicianId,
      jobTitle: title,
      estimatedServiceCharge: charge,
    }),
  });

  if (create.status !== 201) {
    console.dir(create.body, { depth: null });
  }

  assert(create.status === 201, "Service job created");

  return create.body.data;
};

const updateStatus = async (token, id, body) => {
  return request(`/service-jobs/${id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
};

const payJob = async (token, id, body) => {
  return request(`/service-jobs/${id}/payment`, {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
};

const completeJob = async (token, id, finalServiceCharge) => {
  const start = await updateStatus(token, id, {
    status: "IN_PROGRESS",
  });

  assert(start.status === 200, "Job moved to IN_PROGRESS");

  const ready = await updateStatus(token, id, {
    status: "READY_FOR_RELEASE",
  });

  assert(ready.status === 200, "Job moved to READY_FOR_RELEASE");

  const complete = await updateStatus(token, id, {
    status: "COMPLETED",
    finalServiceCharge,
  });

  assert(complete.status === 200, "Job completed");

  return complete.body.data;
};

const main = async () => {
  console.log("\nPHASE 11 MODULE 11E: Service Payment Test");
  console.log("-----------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.servicePayment.deleteMany({
    where: {
      branchId,
    },
  });

  await prisma.cashTransaction.deleteMany({
    where: {
      branchId,
      source: "SERVICE_JOB",
    },
  });

  await prisma.serviceJob.deleteMany({
    where: {
      branchId,
    },
  });

  await prisma.cashBox.updateMany({
    where: {
      branchId,
      boxCode: "CASHBOX-MAIN",
    },
    data: {
      currentBalance: "0.00",
    },
  });

  assert(true, "Previous service payment test data cleared");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const pendingJob = await createJob(
    adminLogin.token,
    customer.id,
    techLogin.user.id,
    "11E Pending payment block test",
    500
  );

  const pendingPayment = await payJob(adminLogin.token, pendingJob.id, {
    paymentMethod: "CASH",
    amount: 500,
  });

  assert(pendingPayment.status === 400, "Pending job cannot be paid");

  const cashJob = await createJob(
    adminLogin.token,
    customer.id,
    techLogin.user.id,
    "11E Cash service payment",
    1500
  );

  await completeJob(adminLogin.token, cashJob.id, 1500);

  const amountMismatch = await payJob(adminLogin.token, cashJob.id, {
    paymentMethod: "CASH",
    amount: 1400,
  });

  assert(amountMismatch.status === 400, "Payment amount mismatch is blocked");

  const cashPayment = await payJob(adminLogin.token, cashJob.id, {
    paymentMethod: "CASH",
    amount: 1500,
    remarks: "Cash service payment test",
  });

  if (cashPayment.status !== 201) {
    console.dir(cashPayment.body, { depth: null });
  }

  assert(cashPayment.status === 201, "Admin can create CASH service payment");
  assert(cashPayment.body.data.paymentCode.startsWith("SVCPAY-MAIN-"), "Service payment code generated");
  assert(cashPayment.body.data.paymentMethod === "CASH", "Payment method saved");
  assert(Number(cashPayment.body.data.amount) === 1500, "Payment amount saved");
  assert(cashPayment.body.data.serviceJob.id === cashJob.id, "Payment linked to service job");
  assert(cashPayment.body.data.branch.id === branchId, "Payment linked to branch");
  assert(cashPayment.body.data.customer.id === customer.id, "Payment linked to customer");
  assert(cashPayment.body.data.createdBy.id === adminLogin.user.id, "createdBy saved");
  assert(cashPayment.body.data.collectedBy.id === adminLogin.user.id, "collectedBy saved");

  const cashTransaction = await prisma.cashTransaction.findFirst({
    where: {
      branchId,
      source: "SERVICE_JOB",
      type: "SERVICE_PAYMENT",
      sourceId: cashJob.id,
      status: "POSTED",
    },
  });

  assert(Boolean(cashTransaction), "CASH service payment created cash transaction");
  assert(Number(cashTransaction.amount) === 1500, "Cash transaction amount correct");

  const cashBox = await prisma.cashBox.findFirst({
    where: {
      branchId,
      boxCode: "CASHBOX-MAIN",
    },
  });

  assert(Number(cashBox.currentBalance) === 1500, "Cash box balance increased after CASH service payment");

  const duplicatePayment = await payJob(adminLogin.token, cashJob.id, {
    paymentMethod: "CASH",
    amount: 1500,
  });

  assert(duplicatePayment.status === 400, "Duplicate service payment is blocked");

  const gcashJob = await createJob(
    adminLogin.token,
    customer.id,
    techLogin.user.id,
    "11E GCASH service payment",
    900
  );

  await completeJob(adminLogin.token, gcashJob.id, 900);

  const gcashPayment = await payJob(adminLogin.token, gcashJob.id, {
    paymentMethod: "GCASH",
    amount: 900,
    referenceNo: "GCASH-TEST-11E",
  });

  if (gcashPayment.status !== 201) {
    console.dir(gcashPayment.body, { depth: null });
  }

  assert(gcashPayment.status === 201, "Admin can create GCASH service payment");

  const gcashCashTransaction = await prisma.cashTransaction.findFirst({
    where: {
      branchId,
      source: "SERVICE_JOB",
      sourceId: gcashJob.id,
    },
  });

  assert(!gcashCashTransaction, "GCASH service payment does not create cash transaction");

  const cashBoxAfterGcash = await prisma.cashBox.findFirst({
    where: {
      branchId,
      boxCode: "CASHBOX-MAIN",
    },
  });

  assert(Number(cashBoxAfterGcash.currentBalance) === 1500, "Cash box unchanged after GCASH service payment");

  const techJob = await createJob(
    adminLogin.token,
    customer.id,
    techLogin.user.id,
    "11E Technician payment block",
    700
  );

  await completeJob(adminLogin.token, techJob.id, 700);

  const techPayment = await payJob(techLogin.token, techJob.id, {
    paymentMethod: "CASH",
    amount: 700,
  });

  assert(techPayment.status === 403, "Technician cannot create service payment");

  const missingPayment = await payJob(adminLogin.token, "not-existing-service-job-id", {
    paymentMethod: "CASH",
    amount: 500,
  });

  assert(missingPayment.status === 404, "Missing service job payment returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 11 MODULE 11E SERVICE PAYMENT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 11 MODULE 11E SERVICE PAYMENT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
