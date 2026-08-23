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
  cashier: {
    identifier: "maincashier",
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

const createServiceJob = async ({ token, body }) => {
  const result = await request("/service-jobs", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Service job created");

  return result.body.data;
};

const updateStatus = async ({ token, id, body }) => {
  return request(`/service-jobs/${id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
};

const main = async () => {
  console.log("\nPHASE 11 MODULE 11C: Update Service Job Status Test");
  console.log("---------------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const cashierLoginResult = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(users.cashier),
  });

  const cashierToken = cashierLoginResult.body?.data?.token || null;

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

  assert(true, "Previous service job status test data cleared");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const job = await createServiceJob({
    token: adminLogin.token,
    body: {
      customerId: customer.id,
      assignedTechnicianId: techLogin.user.id,
      jobTitle: "Status flow service job",
      deviceDescription: "Desktop PC",
      problemDescription: "No boot",
      estimatedServiceCharge: 1000,
    },
  });

  const noToken = await updateStatus({
    token: null,
    id: job.id,
    body: {
      status: "IN_PROGRESS",
    },
  });

  assert([401, 403].includes(noToken.status), "Update status blocks missing token");

  if (cashierToken) {
    const cashierUpdate = await updateStatus({
      token: cashierToken,
      id: job.id,
      body: {
        status: "IN_PROGRESS",
      },
    });

    assert(cashierUpdate.status === 403, "Cashier cannot update service job status");
  } else {
    console.log("SKIP: Cashier login unavailable, cashier status update check skipped");
  }

  const invalidTransition = await updateStatus({
    token: adminLogin.token,
    id: job.id,
    body: {
      status: "COMPLETED",
      finalServiceCharge: 1000,
    },
  });

  assert(invalidTransition.status === 400, "PENDING cannot go directly to COMPLETED");

  const startResult = await updateStatus({
    token: techLogin.token,
    id: job.id,
    body: {
      status: "IN_PROGRESS",
      diagnosis: "Power supply for checking",
      serviceNotes: "Technician started checking.",
    },
  });

  if (startResult.status !== 200) {
    console.dir(startResult.body, { depth: null });
  }

  assert(startResult.status === 200, "Technician can update own branch job to IN_PROGRESS");
  assert(startResult.body.data.status === "IN_PROGRESS", "Status becomes IN_PROGRESS");
  assert(Boolean(startResult.body.data.startedAt), "startedAt saved");
  assert(startResult.body.data.diagnosis === "Power supply for checking", "Diagnosis saved");

  const readyResult = await updateStatus({
    token: adminLogin.token,
    id: job.id,
    body: {
      status: "READY_FOR_RELEASE",
      serviceNotes: "Repair completed, ready for release.",
    },
  });

  if (readyResult.status !== 200) {
    console.dir(readyResult.body, { depth: null });
  }

  assert(readyResult.status === 200, "Admin can update job to READY_FOR_RELEASE");
  assert(readyResult.body.data.status === "READY_FOR_RELEASE", "Status becomes READY_FOR_RELEASE");
  assert(Boolean(readyResult.body.data.readyAt), "readyAt saved");

  const completeWithoutCharge = await updateStatus({
    token: adminLogin.token,
    id: job.id,
    body: {
      status: "COMPLETED",
    },
  });

  assert(completeWithoutCharge.status === 400, "COMPLETED requires finalServiceCharge");

  const completeResult = await updateStatus({
    token: adminLogin.token,
    id: job.id,
    body: {
      status: "COMPLETED",
      finalServiceCharge: 1800,
      serviceNotes: "Released to customer.",
    },
  });

  if (completeResult.status !== 200) {
    console.dir(completeResult.body, { depth: null });
  }

  assert(completeResult.status === 200, "Admin can complete service job");
  assert(completeResult.body.data.status === "COMPLETED", "Status becomes COMPLETED");
  assert(Number(completeResult.body.data.finalServiceCharge) === 1800, "Final service charge saved");
  assert(Boolean(completeResult.body.data.completedAt), "completedAt saved");

  const updateCompletedAgain = await updateStatus({
    token: adminLogin.token,
    id: job.id,
    body: {
      status: "CANCELLED",
      cancellationReason: "Should not cancel completed job.",
    },
  });

  assert(updateCompletedAgain.status === 400, "COMPLETED job cannot be updated again");

  const cancelJob = await createServiceJob({
    token: adminLogin.token,
    body: {
      customerId: customer.id,
      jobTitle: "Cancel flow service job",
      estimatedServiceCharge: 700,
    },
  });

  const cancelWithoutReason = await updateStatus({
    token: adminLogin.token,
    id: cancelJob.id,
    body: {
      status: "CANCELLED",
    },
  });

  assert(cancelWithoutReason.status === 400, "CANCELLED requires cancellationReason");

  const cancelResult = await updateStatus({
    token: adminLogin.token,
    id: cancelJob.id,
    body: {
      status: "CANCELLED",
      cancellationReason: "Customer cancelled service request.",
    },
  });

  if (cancelResult.status !== 200) {
    console.dir(cancelResult.body, { depth: null });
  }

  assert(cancelResult.status === 200, "Admin can cancel pending service job");
  assert(cancelResult.body.data.status === "CANCELLED", "Status becomes CANCELLED");
  assert(Boolean(cancelResult.body.data.cancelledAt), "cancelledAt saved");
  assert(cancelResult.body.data.cancelledBy.id === adminLogin.user.id, "cancelledBy is actor");
  assert(cancelResult.body.data.cancellationReason === "Customer cancelled service request.", "Cancellation reason saved");

  const missingJob = await updateStatus({
    token: adminLogin.token,
    id: "not-existing-service-job-id",
    body: {
      status: "IN_PROGRESS",
    },
  });

  assert(missingJob.status === 404, "Missing service job returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 11 MODULE 11C UPDATE SERVICE JOB STATUS TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 11 MODULE 11C UPDATE SERVICE JOB STATUS TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
