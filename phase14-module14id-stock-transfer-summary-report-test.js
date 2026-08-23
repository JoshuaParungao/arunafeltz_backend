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
  console.log("\nPHASE 14I-D: Stock Transfer Summary Report Test");
  console.log("-----------------------------------------------");

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

  await prisma.stockTransfer.deleteMany({
    where: {
      transferCode: {
        startsWith: "PHASE14ID-",
      },
    },
  });

  await prisma.item.deleteMany({
    where: {
      itemCode: {
        startsWith: "PHASE14ID-",
      },
    },
  });

  assert(true, "Previous 14I-D stock transfer report test data cleared");

  const category = await prisma.itemCategory.findFirst({
    where: {
      branchId: mainBranchId,
      status: "ACTIVE",
    },
  });

  const unit = await prisma.unit.findFirst({
    where: {
      status: "ACTIVE",
    },
  });

  assert(Boolean(category), "MAIN active category found");
  assert(Boolean(unit), "Active unit found");

  const item = await prisma.item.create({
    data: {
      branchId: mainBranchId,
      itemCode: "PHASE14ID-ITEM-0001",
      itemName: "Phase 14I-D Transfer Item",
      description: "Temporary stock transfer report item",
      status: "ACTIVE",
      isSerialized: false,
      hasWarranty: false,
      costPrice: "1000",
      price1: "1200",
      price2: "1250",
      price3: "1300",
      price4: "1350",
      price5: "1400",
      minimumStock: "1",
      reorderLevel: "1",
      categoryId: category.id,
      unitId: unit.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(item.id), "Transfer test item seeded");

  const draftTransfer = await prisma.stockTransfer.create({
    data: {
      fromBranchId: mainBranchId,
      toBranchId: otherBranch.id,
      transferCode: "PHASE14ID-ST-0001",
      status: "DRAFT",
      transferDate: new Date("2026-08-05T09:00:00.000Z"),
      notes: "Temporary draft stock transfer report test",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: "Phase 14I-D Draft Transfer Item",
            quantity: "2",
            itemId: item.id,
          },
        ],
      },
    },
  });

  const requestedTransfer = await prisma.stockTransfer.create({
    data: {
      fromBranchId: mainBranchId,
      toBranchId: otherBranch.id,
      transferCode: "PHASE14ID-ST-0002",
      status: "REQUESTED",
      transferDate: new Date("2026-08-05T10:00:00.000Z"),
      requestedAt: new Date("2026-08-05T10:30:00.000Z"),
      notes: "Temporary requested stock transfer report test",
      requestedById: adminLogin.user.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: "Phase 14I-D Requested Transfer Item",
            quantity: "3",
            itemId: item.id,
          },
          {
            lineNo: 2,
            description: "Phase 14I-D Requested Transfer Item 2",
            quantity: "4",
            itemId: item.id,
          },
        ],
      },
    },
  });

  assert(Boolean(draftTransfer.id), "Draft stock transfer seeded");
  assert(Boolean(requestedTransfer.id), "Requested stock transfer seeded");

  const summary = await request(
    "/reports/stock-transfer-summary?dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access stock transfer summary report");
  assert(summary.body.success === true, "Stock transfer summary success response returned");
  assert(summary.body.message === "Stock transfer summary report retrieved successfully", "Stock transfer summary message returned");
  assert(Boolean(summary.body.data.report), "Stock transfer report object returned");
  assert(Array.isArray(summary.body.data.records), "Stock transfer report records returned");
  assert(Boolean(summary.body.meta), "Stock transfer report meta returned");

  const records = summary.body.data.records.filter((transfer) => {
    return transfer.transferCode.startsWith("PHASE14ID-");
  });

  assert(records.length === 2, "Stock transfer summary includes 2 PHASE14ID test records");

  const report = summary.body.data.report;

  assert(report.name === "Stock Transfer Summary", "Report name is Stock Transfer Summary");
  assert(report.totals.totalTransfers >= 2, "Report totalTransfers includes test transfers");
  assert(report.totals.totalLines >= 3, "Report totalLines includes test transfer lines");
  assert(report.totals.totalQuantity >= 9, "Report totalQuantity includes test transfer quantities");
  assert(report.totals.statusCounts.DRAFT >= 1, "Status count DRAFT includes test transfer");
  assert(report.totals.statusCounts.REQUESTED >= 1, "Status count REQUESTED includes test transfer");

  const draftRecord = records.find((transfer) => transfer.transferCode === "PHASE14ID-ST-0001");
  const requestedRecord = records.find((transfer) => transfer.transferCode === "PHASE14ID-ST-0002");

  assert(Boolean(draftRecord), "Draft transfer included");
  assert(Boolean(requestedRecord), "Requested transfer included");
  assert(draftRecord.status === "DRAFT", "Draft transfer status correct");
  assert(requestedRecord.status === "REQUESTED", "Requested transfer status correct");
  assert(draftRecord.totalLines === 1, "Draft transfer line count correct");
  assert(requestedRecord.totalLines === 2, "Requested transfer line count correct");
  assert(draftRecord.totalQuantity === 2, "Draft transfer quantity correct");
  assert(requestedRecord.totalQuantity === 7, "Requested transfer quantity correct");

  const draftOnly = await request(
    "/reports/stock-transfer-summary?status=DRAFT&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(draftOnly.status === 200, "Stock transfer status filter works");
  assert(
    draftOnly.body.data.records.some((transfer) => transfer.transferCode === "PHASE14ID-ST-0001"),
    "status filter includes DRAFT transfer"
  );
  assert(
    !draftOnly.body.data.records.some((transfer) => transfer.transferCode === "PHASE14ID-ST-0002"),
    "status filter excludes REQUESTED transfer"
  );

  const fromBranchFilter = await request(
    `/reports/stock-transfer-summary?fromBranchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20`,
    {
      token: adminLogin.token,
    }
  );

  assert(fromBranchFilter.status === 200, "fromBranchId filter works");
  assert(
    fromBranchFilter.body.data.records.some((transfer) => transfer.transferCode === "PHASE14ID-ST-0001"),
    "fromBranchId filter includes DRAFT transfer"
  );
  assert(
    fromBranchFilter.body.data.records.some((transfer) => transfer.transferCode === "PHASE14ID-ST-0002"),
    "fromBranchId filter includes REQUESTED transfer"
  );

  const toBranchFilter = await request(
    `/reports/stock-transfer-summary?toBranchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20`,
    {
      token: adminLogin.token,
    }
  );

  assert(toBranchFilter.status === 200, "toBranchId filter works");
  assert(
    toBranchFilter.body.data.records.some((transfer) => transfer.transferCode === "PHASE14ID-ST-0001"),
    "toBranchId filter includes DRAFT transfer"
  );
  assert(
    toBranchFilter.body.data.records.some((transfer) => transfer.transferCode === "PHASE14ID-ST-0002"),
    "toBranchId filter includes REQUESTED transfer"
  );

  const searchFilter = await request(
    "/reports/stock-transfer-summary?search=PHASE14ID-ST-0002&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(searchFilter.status === 200, "Stock transfer search filter works");
  assert(
    searchFilter.body.data.records.some((transfer) => transfer.transferCode === "PHASE14ID-ST-0002"),
    "search filter includes matching transfer"
  );
  assert(
    !searchFilter.body.data.records.some((transfer) => transfer.transferCode === "PHASE14ID-ST-0001"),
    "search filter excludes non-matching transfer"
  );

  const ownBranchFilter = await request(
    `/reports/stock-transfer-summary?branchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(ownBranchFilter.status === 200, "Admin can filter own branch stock transfer report");

  const otherBranchOnly = await request(
    `/reports/stock-transfer-summary?branchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(otherBranchOnly.status === 403, "Admin blocked from other branch stock transfer report");

  const technicianSummary = await request(
    "/reports/stock-transfer-summary?dateFrom=2026-08-05&dateTo=2026-08-05",
    {
      token: technicianLogin.token,
    }
  );

  assert(technicianSummary.status === 403, "Technician blocked from stock transfer summary report");

  const invalidStatus = await request("/reports/stock-transfer-summary?status=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid stock transfer status rejected");

  const invalidDate = await request("/reports/stock-transfer-summary?dateFrom=not-a-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid stock transfer dateFrom rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14I-D STOCK TRANSFER SUMMARY REPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14I-D STOCK TRANSFER SUMMARY REPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
