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
  console.log("\nPHASE 14H-D: Cash Summary Report Test");
  console.log("-------------------------------------");

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

  await prisma.cashTransaction.deleteMany({
    where: {
      transactionCode: {
        startsWith: "PHASE14HD-",
      },
    },
  });

  await prisma.cashHandover.deleteMany({
    where: {
      handoverCode: {
        startsWith: "PHASE14HD-",
      },
    },
  });

  await prisma.cashBox.deleteMany({
    where: {
      boxCode: {
        startsWith: "PHASE14HD-",
      },
    },
  });

  assert(true, "Previous 14H-D cash report test data cleared");

  const cashBox = await prisma.cashBox.create({
    data: {
      branchId: mainBranchId,
      boxCode: "PHASE14HD-BOX",
      name: "Phase 14H-D Test Cash Box",
      status: "ACTIVE",
      currentBalance: "1300",
      remarks: "Temporary cash summary report test box",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(cashBox.id), "Cash box seeded");

  const cashIn = await prisma.cashTransaction.create({
    data: {
      branchId: mainBranchId,
      cashBoxId: cashBox.id,
      transactionCode: "PHASE14HD-CASH-IN-0001",
      type: "CASH_IN",
      status: "POSTED",
      source: "MANUAL",
      amount: "2000",
      balanceBefore: "0",
      balanceAfter: "2000",
      description: "Phase 14H-D posted cash in test",
      referenceNo: "PHASE14HD-REF-IN",
      transactionDate: new Date("2026-08-05T09:00:00.000Z"),
      createdById: adminLogin.user.id,
    },
  });

  const cashOut = await prisma.cashTransaction.create({
    data: {
      branchId: mainBranchId,
      cashBoxId: cashBox.id,
      transactionCode: "PHASE14HD-CASH-OUT-0001",
      type: "CASH_OUT",
      status: "POSTED",
      source: "MANUAL",
      amount: "700",
      balanceBefore: "2000",
      balanceAfter: "1300",
      description: "Phase 14H-D posted cash out test",
      referenceNo: "PHASE14HD-REF-OUT",
      transactionDate: new Date("2026-08-05T10:00:00.000Z"),
      createdById: adminLogin.user.id,
    },
  });

  const cancelledCashIn = await prisma.cashTransaction.create({
    data: {
      branchId: mainBranchId,
      cashBoxId: cashBox.id,
      transactionCode: "PHASE14HD-CANCELLED-IN-0001",
      type: "CASH_IN",
      status: "CANCELLED",
      source: "MANUAL",
      amount: "500",
      balanceBefore: "1300",
      balanceAfter: "1800",
      description: "Phase 14H-D cancelled cash in test",
      referenceNo: "PHASE14HD-REF-CANCEL",
      transactionDate: new Date("2026-08-05T11:00:00.000Z"),
      cancelledAt: new Date("2026-08-05T11:30:00.000Z"),
      cancellationReason: "Temporary cancelled transaction test",
      createdById: adminLogin.user.id,
      cancelledById: adminLogin.user.id,
    },
  });

  assert(Boolean(cashIn.id), "Posted CASH_IN transaction seeded");
  assert(Boolean(cashOut.id), "Posted CASH_OUT transaction seeded");
  assert(Boolean(cancelledCashIn.id), "Cancelled CASH_IN transaction seeded");

  const summary = await request(
    "/reports/cash-summary?dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access cash summary report");
  assert(summary.body.success === true, "Cash summary success response returned");
  assert(summary.body.message === "Cash summary report retrieved successfully", "Cash summary message returned");
  assert(Boolean(summary.body.data.report), "Cash report object returned");
  assert(Array.isArray(summary.body.data.records), "Cash report records returned");
  assert(Boolean(summary.body.meta), "Cash report meta returned");

  const records = summary.body.data.records.filter((transaction) => {
    return transaction.transactionCode.startsWith("PHASE14HD-");
  });

  assert(records.length === 3, "Cash summary includes 3 PHASE14HD test records");

  const report = summary.body.data.report;

  assert(report.name === "Cash Summary", "Report name is Cash Summary");
  assert(report.totals.totalTransactions >= 3, "Report totalTransactions includes test transactions");
  assert(report.totals.totalPosted >= 2, "Report totalPosted includes posted test transactions");
  assert(report.totals.totalCancelled >= 1, "Report totalCancelled includes cancelled test transaction");
  assert(report.totals.totalCashIn >= 2000, "Report totalCashIn includes posted CASH_IN only");
  assert(report.totals.totalCashOut >= 700, "Report totalCashOut includes posted CASH_OUT");
  assert(report.totals.netCashMovement >= 1300, "Report netCashMovement includes test net movement");
  assert(report.totals.statusCounts.POSTED >= 2, "Status count POSTED includes test transactions");
  assert(report.totals.statusCounts.CANCELLED >= 1, "Status count CANCELLED includes test transaction");
  assert(report.totals.typeTotals.CASH_IN >= 2500, "Type total CASH_IN includes posted and cancelled CASH_IN records");
  assert(report.totals.typeTotals.CASH_OUT >= 700, "Type total CASH_OUT includes test cash out");

  const cashInRecord = records.find((transaction) => transaction.transactionCode === "PHASE14HD-CASH-IN-0001");
  const cashOutRecord = records.find((transaction) => transaction.transactionCode === "PHASE14HD-CASH-OUT-0001");
  const cancelledRecord = records.find((transaction) => transaction.transactionCode === "PHASE14HD-CANCELLED-IN-0001");

  assert(Boolean(cashInRecord), "Posted CASH_IN transaction included");
  assert(Boolean(cashOutRecord), "Posted CASH_OUT transaction included");
  assert(Boolean(cancelledRecord), "Cancelled transaction included");
  assert(cashInRecord.type === "CASH_IN", "CASH_IN transaction type correct");
  assert(cashInRecord.status === "POSTED", "CASH_IN transaction status correct");
  assert(cashInRecord.amount === 2000, "CASH_IN amount correct");
  assert(cashOutRecord.type === "CASH_OUT", "CASH_OUT transaction type correct");
  assert(cashOutRecord.status === "POSTED", "CASH_OUT transaction status correct");
  assert(cashOutRecord.amount === 700, "CASH_OUT amount correct");
  assert(cancelledRecord.status === "CANCELLED", "Cancelled transaction status correct");

  const cashInOnly = await request(
    "/reports/cash-summary?type=CASH_IN&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(cashInOnly.status === 200, "Cash type filter works");
  assert(
    cashInOnly.body.data.records.some((transaction) => transaction.transactionCode === "PHASE14HD-CASH-IN-0001"),
    "type filter includes CASH_IN transaction"
  );
  assert(
    !cashInOnly.body.data.records.some((transaction) => transaction.transactionCode === "PHASE14HD-CASH-OUT-0001"),
    "type filter excludes CASH_OUT transaction"
  );

  const postedOnly = await request(
    "/reports/cash-summary?status=POSTED&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(postedOnly.status === 200, "Cash status filter works");
  assert(
    postedOnly.body.data.records.some((transaction) => transaction.transactionCode === "PHASE14HD-CASH-IN-0001"),
    "status filter includes posted CASH_IN transaction"
  );
  assert(
    !postedOnly.body.data.records.some((transaction) => transaction.transactionCode === "PHASE14HD-CANCELLED-IN-0001"),
    "status filter excludes cancelled transaction"
  );

  const cashBoxFilter = await request(
    `/reports/cash-summary?cashBoxId=${cashBox.id}&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20`,
    {
      token: adminLogin.token,
    }
  );

  assert(cashBoxFilter.status === 200, "cashBoxId filter works");
  assert(
    cashBoxFilter.body.data.records.some((transaction) => transaction.transactionCode === "PHASE14HD-CASH-IN-0001"),
    "cashBoxId filter includes CASH_IN transaction"
  );
  assert(
    cashBoxFilter.body.data.records.some((transaction) => transaction.transactionCode === "PHASE14HD-CASH-OUT-0001"),
    "cashBoxId filter includes CASH_OUT transaction"
  );

  const ownBranchFilter = await request(
    `/reports/cash-summary?branchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(ownBranchFilter.status === 200, "Admin can filter own branch cash report");

  const otherBranchFilter = await request(
    `/reports/cash-summary?branchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(otherBranchFilter.status === 403, "Admin blocked from other branch cash report");

  const technicianSummary = await request(
    "/reports/cash-summary?dateFrom=2026-08-05&dateTo=2026-08-05",
    {
      token: technicianLogin.token,
    }
  );

  assert(technicianSummary.status === 403, "Technician blocked from cash summary report");

  const invalidType = await request("/reports/cash-summary?type=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidType.status === 400, "Invalid cash type rejected");

  const invalidStatus = await request("/reports/cash-summary?status=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid cash status rejected");

  const invalidDate = await request("/reports/cash-summary?dateFrom=not-a-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid cash dateFrom rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14H-D CASH SUMMARY REPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14H-D CASH SUMMARY REPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
