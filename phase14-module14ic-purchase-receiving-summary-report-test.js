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
  console.log("\nPHASE 14I-C: Purchase Receiving Summary Report Test");
  console.log("---------------------------------------------------");

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

  await prisma.purchaseReceiving.deleteMany({
    where: {
      receivingCode: {
        startsWith: "PHASE14IC-",
      },
    },
  });

  await prisma.itemSerial.deleteMany({
    where: {
      serialNumber: {
        startsWith: "PHASE14IC-",
      },
    },
  });

  await prisma.item.deleteMany({
    where: {
      itemCode: {
        startsWith: "PHASE14IC-",
      },
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "PHASE14IC-",
      },
    },
  });

  assert(true, "Previous 14I-C purchase receiving report test data cleared");

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

  const supplier = await prisma.supplier.create({
    data: {
      branchId: mainBranchId,
      supplierCode: "PHASE14IC-SUP-0001",
      name: "Phase 14I-C Supplier",
      contactPerson: "Phase Receiving Contact",
      contactNo: "09170001403",
      email: "phase14ic.supplier@example.local",
      status: "ACTIVE",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
    },
  });

  const item = await prisma.item.create({
    data: {
      branchId: mainBranchId,
      itemCode: "PHASE14IC-ITEM-0001",
      itemName: "Phase 14I-C Receiving Item",
      description: "Temporary purchase receiving report item",
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

  assert(Boolean(supplier.id), "Supplier seeded");
  assert(Boolean(item.id), "Receiving test item seeded");

  const draftReceiving = await prisma.purchaseReceiving.create({
    data: {
      branchId: mainBranchId,
      supplierId: supplier.id,
      receivingCode: "PHASE14IC-REC-0001",
      status: "DRAFT",
      receivingDate: new Date("2026-08-05T09:00:00.000Z"),
      supplierDeliveryNo: "PHASE14IC-DR-0001",
      supplierInvoiceNo: "PHASE14IC-INV-0001",
      referenceNo: "PHASE14IC-REF-0001",
      supplierNameSnapshot: "Phase 14I-C Supplier",
      supplierContactSnapshot: "Phase Receiving Contact",
      notes: "Temporary draft purchase receiving report test",
      subtotal: "5000",
      totalDiscount: "500",
      grandTotal: "4500",
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: "Phase 14I-C Draft Receiving Item",
            quantityReceived: "2",
            unitCost: "2500",
            discountAmount: "500",
            lineTotal: "4500",
            batchCode: "PHASE14IC-BATCH-0001",
            itemId: item.id,
            serials: {
              create: [
                {
                  serialNumber: "PHASE14IC-SERIAL-0001",
                },
                {
                  serialNumber: "PHASE14IC-SERIAL-0002",
                },
              ],
            },
          },
        ],
      },
    },
  });

  const postedReceiving = await prisma.purchaseReceiving.create({
    data: {
      branchId: mainBranchId,
      supplierId: supplier.id,
      receivingCode: "PHASE14IC-REC-0002",
      status: "POSTED",
      receivingDate: new Date("2026-08-05T10:00:00.000Z"),
      supplierDeliveryNo: "PHASE14IC-DR-0002",
      supplierInvoiceNo: "PHASE14IC-INV-0002",
      referenceNo: "PHASE14IC-REF-0002",
      supplierNameSnapshot: "Phase 14I-C Supplier",
      supplierContactSnapshot: "Phase Receiving Contact",
      notes: "Temporary posted purchase receiving report test",
      subtotal: "3000",
      totalDiscount: "0",
      grandTotal: "3000",
      postedAt: new Date("2026-08-05T11:00:00.000Z"),
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      postedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: "Phase 14I-C Posted Receiving Item",
            quantityReceived: "3",
            unitCost: "1000",
            discountAmount: "0",
            lineTotal: "3000",
            batchCode: "PHASE14IC-BATCH-0002",
            itemId: item.id,
            serials: {
              create: [
                {
                  serialNumber: "PHASE14IC-SERIAL-0003",
                },
                {
                  serialNumber: "PHASE14IC-SERIAL-0004",
                },
                {
                  serialNumber: "PHASE14IC-SERIAL-0005",
                },
              ],
            },
          },
        ],
      },
    },
  });

  assert(Boolean(draftReceiving.id), "Draft purchase receiving seeded");
  assert(Boolean(postedReceiving.id), "Posted purchase receiving seeded");

  const summary = await request(
    "/reports/purchase-receiving-summary?dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access purchase receiving summary report");
  assert(summary.body.success === true, "Purchase receiving summary success response returned");
  assert(summary.body.message === "Purchase receiving summary report retrieved successfully", "Purchase receiving summary message returned");
  assert(Boolean(summary.body.data.report), "Purchase receiving report object returned");
  assert(Array.isArray(summary.body.data.records), "Purchase receiving report records returned");
  assert(Boolean(summary.body.meta), "Purchase receiving report meta returned");

  const records = summary.body.data.records.filter((receiving) => {
    return receiving.receivingCode.startsWith("PHASE14IC-");
  });

  assert(records.length === 2, "Purchase receiving summary includes 2 PHASE14IC test records");

  const report = summary.body.data.report;

  assert(report.name === "Purchase Receiving Summary", "Report name is Purchase Receiving Summary");
  assert(report.totals.totalReceivings >= 2, "Report totalReceivings includes test receivings");
  assert(report.totals.totalSubtotal >= 8000, "Report subtotal includes test receivings");
  assert(report.totals.totalDiscount >= 500, "Report discount includes test receivings");
  assert(report.totals.totalGrandTotal >= 7500, "Report grand total includes test receivings");
  assert(report.totals.totalLines >= 2, "Report totalLines includes test receiving lines");
  assert(report.totals.totalQuantityReceived >= 5, "Report totalQuantityReceived includes test quantities");
  assert(report.totals.totalSerials >= 5, "Report totalSerials includes test serials");
  assert(report.totals.totalWithBatch >= 2, "Report totalWithBatch includes test batches");
  assert(report.totals.statusCounts.DRAFT >= 1, "Status count DRAFT includes test receiving");
  assert(report.totals.statusCounts.POSTED >= 1, "Status count POSTED includes test receiving");

  const draftRecord = records.find((receiving) => receiving.receivingCode === "PHASE14IC-REC-0001");
  const postedRecord = records.find((receiving) => receiving.receivingCode === "PHASE14IC-REC-0002");

  assert(Boolean(draftRecord), "Draft receiving included");
  assert(Boolean(postedRecord), "Posted receiving included");
  assert(draftRecord.status === "DRAFT", "Draft receiving status correct");
  assert(postedRecord.status === "POSTED", "Posted receiving status correct");
  assert(draftRecord.grandTotal === 4500, "Draft receiving grand total correct");
  assert(postedRecord.grandTotal === 3000, "Posted receiving grand total correct");
  assert(draftRecord.totalLines === 1, "Draft receiving line count correct");
  assert(postedRecord.totalLines === 1, "Posted receiving line count correct");
  assert(draftRecord.totalSerials === 2, "Draft receiving serial count correct");
  assert(postedRecord.totalSerials === 3, "Posted receiving serial count correct");

  const draftOnly = await request(
    "/reports/purchase-receiving-summary?status=DRAFT&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(draftOnly.status === 200, "Purchase receiving status filter works");
  assert(
    draftOnly.body.data.records.some((receiving) => receiving.receivingCode === "PHASE14IC-REC-0001"),
    "status filter includes DRAFT receiving"
  );
  assert(
    !draftOnly.body.data.records.some((receiving) => receiving.receivingCode === "PHASE14IC-REC-0002"),
    "status filter excludes POSTED receiving"
  );

  const supplierFilter = await request(
    `/reports/purchase-receiving-summary?supplierId=${supplier.id}&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20`,
    {
      token: adminLogin.token,
    }
  );

  assert(supplierFilter.status === 200, "supplierId filter works");
  assert(
    supplierFilter.body.data.records.some((receiving) => receiving.receivingCode === "PHASE14IC-REC-0001"),
    "supplierId filter includes DRAFT receiving"
  );
  assert(
    supplierFilter.body.data.records.some((receiving) => receiving.receivingCode === "PHASE14IC-REC-0002"),
    "supplierId filter includes POSTED receiving"
  );

  const searchFilter = await request(
    "/reports/purchase-receiving-summary?search=PHASE14IC-REC-0002&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(searchFilter.status === 200, "Purchase receiving search filter works");
  assert(
    searchFilter.body.data.records.some((receiving) => receiving.receivingCode === "PHASE14IC-REC-0002"),
    "search filter includes matching receiving"
  );
  assert(
    !searchFilter.body.data.records.some((receiving) => receiving.receivingCode === "PHASE14IC-REC-0001"),
    "search filter excludes non-matching receiving"
  );

  const ownBranchFilter = await request(
    `/reports/purchase-receiving-summary?branchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(ownBranchFilter.status === 200, "Admin can filter own branch purchase receiving report");

  const otherBranchFilter = await request(
    `/reports/purchase-receiving-summary?branchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(otherBranchFilter.status === 403, "Admin blocked from other branch purchase receiving report");

  const technicianSummary = await request(
    "/reports/purchase-receiving-summary?dateFrom=2026-08-05&dateTo=2026-08-05",
    {
      token: technicianLogin.token,
    }
  );

  assert(technicianSummary.status === 403, "Technician blocked from purchase receiving summary report");

  const invalidStatus = await request("/reports/purchase-receiving-summary?status=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid purchase receiving status rejected");

  const invalidDate = await request("/reports/purchase-receiving-summary?dateFrom=not-a-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid purchase receiving dateFrom rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14I-C PURCHASE RECEIVING SUMMARY REPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14I-C PURCHASE RECEIVING SUMMARY REPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
