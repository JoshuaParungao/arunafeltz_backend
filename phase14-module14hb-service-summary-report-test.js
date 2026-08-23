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
  console.log("\nPHASE 14H-B: Service Summary Report Test");
  console.log("----------------------------------------");

  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const mainBranchId = adminLogin.user.branch?.id || adminLogin.user.branchId;

  assert(Boolean(mainBranchId), "MAIN branch detected");

  const otherBranch = await prisma.branch.findFirst({
    where: {
      id: {
        not: mainBranchId,
      },
      status: "ACTIVE",
    },
    orderBy: {
      code: "asc",
    },
  });

  assert(Boolean(otherBranch), "Second active branch detected");

  await prisma.servicePayment.deleteMany({
    where: {
      serviceJob: {
        jobCode: {
          startsWith: "PHASE14HB-",
        },
      },
    },
  });

  await prisma.serviceJob.deleteMany({
    where: {
      jobCode: {
        startsWith: "PHASE14HB-",
      },
    },
  });

  assert(true, "Previous 14H-B service report test data cleared");

  const completedJob = await prisma.serviceJob.create({
    data: {
      branchId: mainBranchId,
      jobCode: "PHASE14HB-SVC-0001",
      status: "COMPLETED",
      jobTitle: "Phase 14H-B Completed Service Job",
      deviceDescription: "Desktop PC - Generic Test Model", diagnosis: "Test diagnosis", serviceNotes: "Temporary completed service report test - Test action",
      estimatedServiceCharge: "1000",
      finalServiceCharge: "1500",
      receivedAt: new Date("2026-08-05T09:00:00.000Z"),
      startedAt: new Date("2026-08-05T10:00:00.000Z"),
      readyAt: new Date("2026-08-05T11:00:00.000Z"),
      completedAt: new Date("2026-08-05T12:00:00.000Z"),
      assignedTechnicianId: technicianLogin.user.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      payment: {
        create: {
          branchId: mainBranchId,
          paymentCode: "PHASE14HB-PAY-0001",
          paymentMethod: "CASH",
          status: "POSTED",
          amount: "1500",
          paidAt: new Date("2026-08-05T12:30:00.000Z"),
          collectedById: adminLogin.user.id,
          createdById: adminLogin.user.id,
        },
      },
    },
  });

  const pendingJob = await prisma.serviceJob.create({
    data: {
      branchId: mainBranchId,
      jobCode: "PHASE14HB-SVC-0002",
      status: "PENDING",
      jobTitle: "Phase 14H-B Pending Service Job",
      deviceDescription: "Laptop - Generic Test Pending Model", serviceNotes: "Temporary pending service report test",
      estimatedServiceCharge: "800",
      finalServiceCharge: "0",
      receivedAt: new Date("2026-08-05T13:00:00.000Z"),
      assignedTechnicianId: technicianLogin.user.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(completedJob.id), "Completed service job seeded");
  assert(Boolean(pendingJob.id), "Pending service job seeded");

  const summary = await request(
    "/reports/service-summary?dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access service summary report");
  assert(summary.body.success === true, "Service summary success response returned");
  assert(summary.body.message === "Service summary report retrieved successfully", "Service summary message returned");
  assert(Boolean(summary.body.data.report), "Service report object returned");
  assert(Array.isArray(summary.body.data.records), "Service report records returned");
  assert(Boolean(summary.body.meta), "Service report meta returned");

  const records = summary.body.data.records.filter((job) => {
    return job.jobCode.startsWith("PHASE14HB-");
  });

  assert(records.length === 2, "Service summary includes 2 PHASE14HB test records");

  const report = summary.body.data.report;

  assert(report.name === "Service Summary", "Report name is Service Summary");
  assert(report.totals.totalJobs >= 2, "Report totalJobs includes test jobs");
  assert(report.totals.totalEstimatedServiceCharge >= 1800, "Report estimated charge includes test jobs");
  assert(report.totals.totalFinalServiceCharge >= 1500, "Report final charge includes test jobs");
  assert(report.totals.totalPaidJobs >= 1, "Report paid job count includes test paid job");
  assert(report.totals.totalUnpaidJobs >= 1, "Report unpaid job count includes test unpaid job");
  assert(report.totals.totalPaidAmount >= 1500, "Report paid amount includes test payment");

  const completedRecord = records.find((job) => job.jobCode === "PHASE14HB-SVC-0001");
  const pendingRecord = records.find((job) => job.jobCode === "PHASE14HB-SVC-0002");

  assert(Boolean(completedRecord), "Completed service job included");
  assert(Boolean(pendingRecord), "Pending service job included");
  assert(completedRecord.status === "COMPLETED", "Completed service job status correct");
  assert(completedRecord.finalServiceCharge === 1500, "Completed service final charge correct");
  assert(completedRecord.isPaid === true, "Completed service job marked paid");
  assert(completedRecord.payment.paymentMethod === "CASH", "Completed service payment method correct");
  assert(completedRecord.payment.amount === 1500, "Completed service payment amount correct");
  assert(pendingRecord.status === "PENDING", "Pending service job status correct");
  assert(pendingRecord.isPaid === false, "Pending service job marked unpaid");

  const completedOnly = await request(
    "/reports/service-summary?status=COMPLETED&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(completedOnly.status === 200, "Service status filter works");
  assert(
    completedOnly.body.data.records.some((job) => job.jobCode === "PHASE14HB-SVC-0001"),
    "Service status filter includes completed job"
  );
  assert(
    !completedOnly.body.data.records.some((job) => job.jobCode === "PHASE14HB-SVC-0002"),
    "Service status filter excludes pending job"
  );

  const cashOnly = await request(
    "/reports/service-summary?paymentMethod=CASH&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(cashOnly.status === 200, "Service paymentMethod filter works");
  assert(
    cashOnly.body.data.records.some((job) => job.jobCode === "PHASE14HB-SVC-0001"),
    "paymentMethod filter includes paid CASH job"
  );
  assert(
    !cashOnly.body.data.records.some((job) => job.jobCode === "PHASE14HB-SVC-0002"),
    "paymentMethod filter excludes unpaid job"
  );

  const techFilter = await request(
    `/reports/service-summary?assignedTechnicianId=${technicianLogin.user.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(techFilter.status === 200, "assignedTechnicianId filter works");
  assert(
    techFilter.body.data.records.some((job) => job.jobCode === "PHASE14HB-SVC-0001"),
    "assignedTechnicianId filter includes completed job"
  );
  assert(
    techFilter.body.data.records.some((job) => job.jobCode === "PHASE14HB-SVC-0002"),
    "assignedTechnicianId filter includes pending job"
  );

  const ownBranchFilter = await request(
    `/reports/service-summary?branchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(ownBranchFilter.status === 200, "Admin can filter own branch service report");

  const otherBranchFilter = await request(
    `/reports/service-summary?branchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(otherBranchFilter.status === 403, "Admin blocked from other branch service report");

  const technicianSummary = await request(
    "/reports/service-summary?dateFrom=2026-08-05&dateTo=2026-08-05",
    {
      token: technicianLogin.token,
    }
  );

  assert(technicianSummary.status === 403, "Technician blocked from service summary report");

  const invalidStatus = await request("/reports/service-summary?status=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid service status rejected");

  const invalidDate = await request("/reports/service-summary?dateFrom=not-a-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid service dateFrom rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14H-B SERVICE SUMMARY REPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14H-B SERVICE SUMMARY REPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

