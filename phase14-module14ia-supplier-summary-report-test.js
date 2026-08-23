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
  console.log("\nPHASE 14I-A: Supplier Summary Report Test");
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

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "PHASE14IA-",
      },
    },
  });

  assert(true, "Previous 14I-A supplier report test data cleared");

  const activeSupplier = await prisma.supplier.create({
    data: {
      branchId: mainBranchId,
      supplierCode: "PHASE14IA-SUP-0001",
      name: "Phase 14I-A Active Supplier",
      contactPerson: "Phase Active Contact",
      contactNo: "09170000001",
      email: "phase14ia.active@example.local",
      address: "Temporary active supplier address",
      tin: "TIN-14IA-0001",
      notes: "Temporary active supplier summary test",
      status: "ACTIVE",
      createdAt: new Date("2026-08-05T09:00:00.000Z"),
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const inactiveSupplier = await prisma.supplier.create({
    data: {
      branchId: mainBranchId,
      supplierCode: "PHASE14IA-SUP-0002",
      name: "Phase 14I-A Inactive Supplier",
      contactPerson: "Phase Inactive Contact",
      contactNo: "09170000002",
      email: "phase14ia.inactive@example.local",
      address: "Temporary inactive supplier address",
      tin: "TIN-14IA-0002",
      notes: "Temporary inactive supplier summary test",
      status: "INACTIVE",
      createdAt: new Date("2026-08-05T10:00:00.000Z"),
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(activeSupplier.id), "Active supplier seeded");
  assert(Boolean(inactiveSupplier.id), "Inactive supplier seeded");

  const summary = await request(
    "/reports/supplier-summary?dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access supplier summary report");
  assert(summary.body.success === true, "Supplier summary success response returned");
  assert(summary.body.message === "Supplier summary report retrieved successfully", "Supplier summary message returned");
  assert(Boolean(summary.body.data.report), "Supplier report object returned");
  assert(Array.isArray(summary.body.data.records), "Supplier report records returned");
  assert(Boolean(summary.body.meta), "Supplier report meta returned");

  const records = summary.body.data.records.filter((supplier) => {
    return supplier.supplierCode.startsWith("PHASE14IA-");
  });

  assert(records.length === 2, "Supplier summary includes 2 PHASE14IA test records");

  const report = summary.body.data.report;

  assert(report.name === "Supplier Summary", "Report name is Supplier Summary");
  assert(report.totals.totalSuppliers >= 2, "Report totalSuppliers includes test suppliers");
  assert(report.totals.statusCounts.ACTIVE >= 1, "Status count ACTIVE includes test supplier");
  assert(report.totals.statusCounts.INACTIVE >= 1, "Status count INACTIVE includes test supplier");

  const activeRecord = records.find((supplier) => supplier.supplierCode === "PHASE14IA-SUP-0001");
  const inactiveRecord = records.find((supplier) => supplier.supplierCode === "PHASE14IA-SUP-0002");

  assert(Boolean(activeRecord), "Active supplier included");
  assert(Boolean(inactiveRecord), "Inactive supplier included");
  assert(activeRecord.status === "ACTIVE", "Active supplier status correct");
  assert(inactiveRecord.status === "INACTIVE", "Inactive supplier status correct");
  assert(activeRecord.name === "Phase 14I-A Active Supplier", "Active supplier name correct");
  assert(inactiveRecord.name === "Phase 14I-A Inactive Supplier", "Inactive supplier name correct");
  assert(activeRecord.totalPurchaseOrders === 0, "Active supplier PO count starts at zero");
  assert(activeRecord.totalReceivings === 0, "Active supplier receiving count starts at zero");

  const activeOnly = await request(
    "/reports/supplier-summary?status=ACTIVE&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(activeOnly.status === 200, "Supplier status filter works");
  assert(
    activeOnly.body.data.records.some((supplier) => supplier.supplierCode === "PHASE14IA-SUP-0001"),
    "status filter includes ACTIVE supplier"
  );
  assert(
    !activeOnly.body.data.records.some((supplier) => supplier.supplierCode === "PHASE14IA-SUP-0002"),
    "status filter excludes INACTIVE supplier"
  );

  const searchByName = await request(
    "/reports/supplier-summary?search=Active%20Supplier&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(searchByName.status === 200, "Supplier search filter works");
  assert(
    searchByName.body.data.records.some((supplier) => supplier.supplierCode === "PHASE14IA-SUP-0001"),
    "search filter includes matching supplier"
  );

  const ownBranchFilter = await request(
    `/reports/supplier-summary?branchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(ownBranchFilter.status === 200, "Admin can filter own branch supplier report");

  const otherBranchFilter = await request(
    `/reports/supplier-summary?branchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(otherBranchFilter.status === 403, "Admin blocked from other branch supplier report");

  const technicianSummary = await request(
    "/reports/supplier-summary?dateFrom=2026-08-05&dateTo=2026-08-05",
    {
      token: technicianLogin.token,
    }
  );

  assert(technicianSummary.status === 403, "Technician blocked from supplier summary report");

  const invalidStatus = await request("/reports/supplier-summary?status=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid supplier status rejected");

  const invalidDate = await request("/reports/supplier-summary?dateFrom=not-a-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid supplier dateFrom rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14I-A SUPPLIER SUMMARY REPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14I-A SUPPLIER SUMMARY REPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
