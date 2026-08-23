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
  console.log("\nPHASE 14H-C: Warranty Summary Report Test");
  console.log("-----------------------------------------");

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

  await prisma.warrantyClaim.deleteMany({
    where: {
      claimCode: {
        startsWith: "PHASE14HC-",
      },
    },
  });

  assert(true, "Previous 14H-C warranty report test data cleared");

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

  await prisma.itemSerial.deleteMany({
    where: {
      serialNumber: {
        startsWith: "PHASE14HC-",
      },
    },
  });

  await prisma.item.deleteMany({
    where: {
      itemCode: {
        startsWith: "PHASE14HC-",
      },
    },
  });

  const item = await prisma.item.create({
    data: {
      branchId: mainBranchId,
      itemCode: "PHASE14HC-ITEM",
      itemName: "Phase 14H-C Warranty Item",
      description: "Temporary warranty report item",
      status: "ACTIVE",
      isSerialized: true,
      hasWarranty: true,
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

  const serial = await prisma.itemSerial.create({
    data: {
      branchId: mainBranchId,
      itemId: item.id,
      serialNumber: "PHASE14HC-SERIAL-0001",
      status: "WARRANTY",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(item.id), "Warranty test item seeded");
  assert(Boolean(serial.id), "Warranty test serial seeded");

  const openClaim = await prisma.warrantyClaim.create({
    data: {
      branchId: mainBranchId,
      claimCode: "PHASE14HC-WTY-0001",
      status: "CHECKING",
      issueDescription: "Phase 14H-C open warranty issue",
      customerComplaint: "Temporary warranty complaint",
      diagnosis: "Temporary warranty diagnosis",
      actionTaken: "Temporary checking action",
      supplierName: "Phase 14H-C Supplier",
      supplierReferenceNo: "PHASE14HC-SUP-0001",
      receivedAt: new Date("2026-08-05T09:00:00.000Z"),
      checkingAt: new Date("2026-08-05T10:00:00.000Z"),
      itemId: item.id,
      serialId: serial.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      statusUpdatedById: adminLogin.user.id,
    },
  });

  const releasedClaim = await prisma.warrantyClaim.create({
    data: {
      branchId: mainBranchId,
      claimCode: "PHASE14HC-WTY-0002",
      status: "OUT",
      issueDescription: "Phase 14H-C released warranty issue",
      customerComplaint: "Temporary released complaint",
      diagnosis: "Temporary released diagnosis",
      actionTaken: "Temporary released action",
      supplierName: "Phase 14H-C Supplier",
      supplierReferenceNo: "PHASE14HC-SUP-0002",
      receivedAt: new Date("2026-08-05T11:00:00.000Z"),
      repairedAt: new Date("2026-08-05T12:00:00.000Z"),
      releasedAt: new Date("2026-08-05T13:00:00.000Z"),
      itemId: item.id,
      serialId: serial.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      statusUpdatedById: adminLogin.user.id,
      releasedById: adminLogin.user.id,
    },
  });

  assert(Boolean(openClaim.id), "Open warranty claim seeded");
  assert(Boolean(releasedClaim.id), "Released warranty claim seeded");

  const summary = await request(
    "/reports/warranty-summary?dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access warranty summary report");
  assert(summary.body.success === true, "Warranty summary success response returned");
  assert(summary.body.message === "Warranty summary report retrieved successfully", "Warranty summary message returned");
  assert(Boolean(summary.body.data.report), "Warranty report object returned");
  assert(Array.isArray(summary.body.data.records), "Warranty report records returned");
  assert(Boolean(summary.body.meta), "Warranty report meta returned");

  const records = summary.body.data.records.filter((claim) => {
    return claim.claimCode.startsWith("PHASE14HC-");
  });

  assert(records.length === 2, "Warranty summary includes 2 PHASE14HC test records");

  const report = summary.body.data.report;

  assert(report.name === "Warranty Summary", "Report name is Warranty Summary");
  assert(report.totals.totalClaims >= 2, "Report totalClaims includes test claims");
  assert(report.totals.totalOpen >= 1, "Report totalOpen includes open test claim");
  assert(report.totals.totalReleased >= 1, "Report totalReleased includes released test claim");
  assert(report.totals.totalWithSupplier >= 2, "Report totalWithSupplier includes test claims");
  assert(report.totals.statusCounts.CHECKING >= 1, "Status count CHECKING includes test claim");
  assert(report.totals.statusCounts.OUT >= 1, "Status count OUT includes test claim");

  const openRecord = records.find((claim) => claim.claimCode === "PHASE14HC-WTY-0001");
  const releasedRecord = records.find((claim) => claim.claimCode === "PHASE14HC-WTY-0002");

  assert(Boolean(openRecord), "Open warranty claim included");
  assert(Boolean(releasedRecord), "Released warranty claim included");
  assert(openRecord.status === "CHECKING", "Open warranty claim status correct");
  assert(openRecord.isReleased === false, "Open warranty claim not released");
  assert(releasedRecord.status === "OUT", "Released warranty claim status correct");
  assert(releasedRecord.isReleased === true, "Released warranty claim marked released");

  const checkingOnly = await request(
    "/reports/warranty-summary?status=CHECKING&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(checkingOnly.status === 200, "Warranty status filter works");
  assert(
    checkingOnly.body.data.records.some((claim) => claim.claimCode === "PHASE14HC-WTY-0001"),
    "Warranty status filter includes CHECKING claim"
  );
  assert(
    !checkingOnly.body.data.records.some((claim) => claim.claimCode === "PHASE14HC-WTY-0002"),
    "Warranty status filter excludes OUT claim"
  );

  const supplierOnly = await request(
    "/reports/warranty-summary?supplierName=Phase%2014H-C%20Supplier&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(supplierOnly.status === 200, "Warranty supplierName filter works");
  assert(
    supplierOnly.body.data.records.some((claim) => claim.claimCode === "PHASE14HC-WTY-0001"),
    "supplierName filter includes open claim"
  );
  assert(
    supplierOnly.body.data.records.some((claim) => claim.claimCode === "PHASE14HC-WTY-0002"),
    "supplierName filter includes released claim"
  );

  const itemFilter = await request(
    `/reports/warranty-summary?itemId=${item.id}&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20`,
    {
      token: adminLogin.token,
    }
  );

  assert(itemFilter.status === 200, "Warranty itemId filter works");
  assert(
    itemFilter.body.data.records.some((claim) => claim.claimCode === "PHASE14HC-WTY-0001"),
    "itemId filter includes open claim"
  );
  assert(
    itemFilter.body.data.records.some((claim) => claim.claimCode === "PHASE14HC-WTY-0002"),
    "itemId filter includes released claim"
  );

  const ownBranchFilter = await request(
    `/reports/warranty-summary?branchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(ownBranchFilter.status === 200, "Admin can filter own branch warranty report");

  const otherBranchFilter = await request(
    `/reports/warranty-summary?branchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(otherBranchFilter.status === 403, "Admin blocked from other branch warranty report");

  const technicianSummary = await request(
    "/reports/warranty-summary?dateFrom=2026-08-05&dateTo=2026-08-05",
    {
      token: technicianLogin.token,
    }
  );

  assert(technicianSummary.status === 403, "Technician blocked from warranty summary report");

  const invalidStatus = await request("/reports/warranty-summary?status=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid warranty status rejected");

  const invalidDate = await request("/reports/warranty-summary?dateFrom=not-a-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid warranty dateFrom rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14H-C WARRANTY SUMMARY REPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14H-C WARRANTY SUMMARY REPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
