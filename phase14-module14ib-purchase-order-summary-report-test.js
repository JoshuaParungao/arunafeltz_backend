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
  console.log("\nPHASE 14I-B: Purchase Order Summary Report Test");
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

  await prisma.purchaseOrder.deleteMany({
    where: {
      poCode: {
        startsWith: "PHASE14IB-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "PHASE14IB-",
      },
    },
  });

  assert(true, "Previous 14I-B purchase order report test data cleared");

  const supplier = await prisma.supplier.create({
    data: {
      branchId: mainBranchId,
      supplierCode: "PHASE14IB-SUP-0001",
      name: "Phase 14I-B Supplier",
      contactPerson: "Phase PO Contact",
      contactNo: "09170001402",
      email: "phase14ib.supplier@example.local",
      status: "ACTIVE",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  assert(Boolean(supplier.id), "Supplier seeded");

  const draftPO = await prisma.purchaseOrder.create({
    data: {
      branchId: mainBranchId,
      supplierId: supplier.id,
      poCode: "PHASE14IB-PO-0001",
      status: "DRAFT",
      orderDate: new Date("2026-08-05T09:00:00.000Z"),
      expectedDate: new Date("2026-08-10T09:00:00.000Z"),
      supplierNameSnapshot: "Phase 14I-B Supplier",
      supplierContactSnapshot: "Phase PO Contact",
      notes: "Temporary draft purchase order report test",
      subtotal: "5000",
      totalDiscount: "500",
      grandTotal: "4500",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: "Phase 14I-B Draft PO Item 1",
            quantity: "2",
            receivedQuantity: "0",
            unitCost: "1500",
            discountAmount: "200",
            lineTotal: "2800",
          },
          {
            lineNo: 2,
            description: "Phase 14I-B Draft PO Item 2",
            quantity: "1",
            receivedQuantity: "0",
            unitCost: "2000",
            discountAmount: "300",
            lineTotal: "1700",
          },
        ],
      },
    },
  });

  const orderedPO = await prisma.purchaseOrder.create({
    data: {
      branchId: mainBranchId,
      supplierId: supplier.id,
      poCode: "PHASE14IB-PO-0002",
      status: "ORDERED",
      orderDate: new Date("2026-08-05T10:00:00.000Z"),
      expectedDate: new Date("2026-08-12T10:00:00.000Z"),
      supplierNameSnapshot: "Phase 14I-B Supplier",
      supplierContactSnapshot: "Phase PO Contact",
      notes: "Temporary ordered purchase order report test",
      subtotal: "3000",
      totalDiscount: "0",
      grandTotal: "3000",
      orderedAt: new Date("2026-08-05T11:00:00.000Z"),
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      orderedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: "Phase 14I-B Ordered PO Item 1",
            quantity: "3",
            receivedQuantity: "1",
            unitCost: "1000",
            discountAmount: "0",
            lineTotal: "3000",
          },
        ],
      },
    },
  });

  assert(Boolean(draftPO.id), "Draft purchase order seeded");
  assert(Boolean(orderedPO.id), "Ordered purchase order seeded");

  const summary = await request(
    "/reports/purchase-order-summary?dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access purchase order summary report");
  assert(summary.body.success === true, "Purchase order summary success response returned");
  assert(summary.body.message === "Purchase order summary report retrieved successfully", "Purchase order summary message returned");
  assert(Boolean(summary.body.data.report), "Purchase order report object returned");
  assert(Array.isArray(summary.body.data.records), "Purchase order report records returned");
  assert(Boolean(summary.body.meta), "Purchase order report meta returned");

  const records = summary.body.data.records.filter((po) => {
    return po.poCode.startsWith("PHASE14IB-");
  });

  assert(records.length === 2, "Purchase order summary includes 2 PHASE14IB test records");

  const report = summary.body.data.report;

  assert(report.name === "Purchase Order Summary", "Report name is Purchase Order Summary");
  assert(report.totals.totalPurchaseOrders >= 2, "Report totalPurchaseOrders includes test POs");
  assert(report.totals.totalSubtotal >= 8000, "Report subtotal includes test POs");
  assert(report.totals.totalDiscount >= 500, "Report discount includes test POs");
  assert(report.totals.totalGrandTotal >= 7500, "Report grand total includes test POs");
  assert(report.totals.totalLines >= 3, "Report totalLines includes test PO lines");
  assert(report.totals.totalQuantity >= 6, "Report totalQuantity includes test PO quantities");
  assert(report.totals.totalReceivedQuantity >= 1, "Report totalReceivedQuantity includes test received quantity");
  assert(report.totals.statusCounts.DRAFT >= 1, "Status count DRAFT includes test PO");
  assert(report.totals.statusCounts.ORDERED >= 1, "Status count ORDERED includes test PO");

  const draftRecord = records.find((po) => po.poCode === "PHASE14IB-PO-0001");
  const orderedRecord = records.find((po) => po.poCode === "PHASE14IB-PO-0002");

  assert(Boolean(draftRecord), "Draft PO included");
  assert(Boolean(orderedRecord), "Ordered PO included");
  assert(draftRecord.status === "DRAFT", "Draft PO status correct");
  assert(orderedRecord.status === "ORDERED", "Ordered PO status correct");
  assert(draftRecord.grandTotal === 4500, "Draft PO grand total correct");
  assert(orderedRecord.grandTotal === 3000, "Ordered PO grand total correct");
  assert(draftRecord.totalLines === 2, "Draft PO line count correct");
  assert(orderedRecord.totalLines === 1, "Ordered PO line count correct");

  const draftOnly = await request(
    "/reports/purchase-order-summary?status=DRAFT&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(draftOnly.status === 200, "Purchase order status filter works");
  assert(
    draftOnly.body.data.records.some((po) => po.poCode === "PHASE14IB-PO-0001"),
    "status filter includes DRAFT PO"
  );
  assert(
    !draftOnly.body.data.records.some((po) => po.poCode === "PHASE14IB-PO-0002"),
    "status filter excludes ORDERED PO"
  );

  const supplierFilter = await request(
    `/reports/purchase-order-summary?supplierId=${supplier.id}&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20`,
    {
      token: adminLogin.token,
    }
  );

  assert(supplierFilter.status === 200, "supplierId filter works");
  assert(
    supplierFilter.body.data.records.some((po) => po.poCode === "PHASE14IB-PO-0001"),
    "supplierId filter includes DRAFT PO"
  );
  assert(
    supplierFilter.body.data.records.some((po) => po.poCode === "PHASE14IB-PO-0002"),
    "supplierId filter includes ORDERED PO"
  );

  const searchFilter = await request(
    "/reports/purchase-order-summary?search=PHASE14IB-PO-0002&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(searchFilter.status === 200, "Purchase order search filter works");
  assert(
    searchFilter.body.data.records.some((po) => po.poCode === "PHASE14IB-PO-0002"),
    "search filter includes matching PO"
  );
  assert(
    !searchFilter.body.data.records.some((po) => po.poCode === "PHASE14IB-PO-0001"),
    "search filter excludes non-matching PO"
  );

  const ownBranchFilter = await request(
    `/reports/purchase-order-summary?branchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(ownBranchFilter.status === 200, "Admin can filter own branch purchase order report");

  const otherBranchFilter = await request(
    `/reports/purchase-order-summary?branchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(otherBranchFilter.status === 403, "Admin blocked from other branch purchase order report");

  const technicianSummary = await request(
    "/reports/purchase-order-summary?dateFrom=2026-08-05&dateTo=2026-08-05",
    {
      token: technicianLogin.token,
    }
  );

  assert(technicianSummary.status === 403, "Technician blocked from purchase order summary report");

  const invalidStatus = await request("/reports/purchase-order-summary?status=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid purchase order status rejected");

  const invalidDate = await request("/reports/purchase-order-summary?dateFrom=not-a-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid purchase order dateFrom rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14I-B PURCHASE ORDER SUMMARY REPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14I-B PURCHASE ORDER SUMMARY REPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
