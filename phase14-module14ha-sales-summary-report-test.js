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
  console.log("\nPHASE 14H-A: Sales Summary Report Test");
  console.log("--------------------------------------");

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

  await prisma.salePayment.deleteMany({
    where: {
      sale: {
        receiptCode: {
          startsWith: "PHASE14HA-",
        },
      },
    },
  });

  await prisma.saleItem.deleteMany({
    where: {
      sale: {
        receiptCode: {
          startsWith: "PHASE14HA-",
        },
      },
    },
  });

  await prisma.sale.deleteMany({
    where: {
      receiptCode: {
        startsWith: "PHASE14HA-",
      },
    },
  });

  assert(true, "Previous 14H-A sales report test data cleared");

  const sale1 = await prisma.sale.create({
    data: {
      branchId: mainBranchId,
      receiptCode: "PHASE14HA-SALE-0001",
      status: "COMPLETED",
      paymentStatus: "PAID",
      subtotal: "10000",
      totalDiscount: "500",
      serviceCharge: "300",
      grandTotal: "9800",
      amountPaid: "10000",
      changeAmount: "200",
      saleDate: new Date("2026-08-05T10:00:00.000Z"),
      cashierId: adminLogin.user.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      items: {
        create: [
          {
            lineNo: 1,
            description: "Phase 14H-A Custom Sale Item 1",
            quantity: "1",
            unitPrice: "10000",
            discountAmount: "500",
            lineTotal: "9500",
          },
        ],
      },
      payments: {
        create: [
          {
            paymentMethod: "CASH",
            amount: "9800",
            referenceNo: "PHASE14HA-CASH-0001",
            createdById: adminLogin.user.id,
          },
        ],
      },
    },
  });

  const sale2 = await prisma.sale.create({
    data: {
      branchId: mainBranchId,
      receiptCode: "PHASE14HA-SALE-0002",
      status: "CANCELLED",
      paymentStatus: "REFUNDED",
      subtotal: "3000",
      totalDiscount: "0",
      serviceCharge: "0",
      grandTotal: "3000",
      amountPaid: "3000",
      changeAmount: "0",
      saleDate: new Date("2026-08-05T11:00:00.000Z"),
      cashierId: adminLogin.user.id,
      createdById: adminLogin.user.id,
      updatedById: adminLogin.user.id,
      cancellationReason: "Phase 14H-A test cancellation",
      items: {
        create: [
          {
            lineNo: 1,
            description: "Phase 14H-A Custom Sale Item 2",
            quantity: "1",
            unitPrice: "3000",
            discountAmount: "0",
            lineTotal: "3000",
          },
        ],
      },
      payments: {
        create: [
          {
            paymentMethod: "GCASH",
            amount: "3000",
            referenceNo: "PHASE14HA-GCASH-0001",
            createdById: adminLogin.user.id,
          },
        ],
      },
    },
  });

  assert(Boolean(sale1.id), "Completed sale seeded");
  assert(Boolean(sale2.id), "Cancelled sale seeded");

  const summary = await request(
    "/reports/sales-summary?dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access sales summary report");
  assert(summary.body.success === true, "Sales summary success response returned");
  assert(summary.body.message === "Sales summary report retrieved successfully", "Sales summary message returned");
  assert(Boolean(summary.body.data.report), "Sales report object returned");
  assert(Array.isArray(summary.body.data.records), "Sales report records returned");
  assert(Boolean(summary.body.meta), "Sales report meta returned");

  const records = summary.body.data.records.filter((sale) => {
    return sale.receiptCode.startsWith("PHASE14HA-");
  });

  assert(records.length === 2, "Sales summary includes 2 PHASE14HA test records");

  const report = summary.body.data.report;

  assert(report.name === "Sales Summary", "Report name is Sales Summary");
  assert(report.totals.totalSales >= 2, "Report totalSales includes test sales");
  assert(report.totals.totalGrandTotal >= 12800, "Report totalGrandTotal includes test sales");
  assert(report.totals.totalAmountPaid >= 13000, "Report totalAmountPaid includes test sales");
  assert(report.totals.totalDiscount >= 500, "Report totalDiscount includes test discount");
  assert(report.totals.totalServiceCharge >= 300, "Report totalServiceCharge includes test service charge");

  const completedSale = records.find((sale) => sale.receiptCode === "PHASE14HA-SALE-0001");
  const cancelledSale = records.find((sale) => sale.receiptCode === "PHASE14HA-SALE-0002");

  assert(Boolean(completedSale), "Completed test sale included");
  assert(Boolean(cancelledSale), "Cancelled test sale included");
  assert(completedSale.status === "COMPLETED", "Completed sale status correct");
  assert(completedSale.paymentStatus === "PAID", "Completed sale paymentStatus correct");
  assert(completedSale.grandTotal === 9800, "Completed sale grandTotal correct");
  assert(completedSale.paymentMethods.CASH === 9800, "Completed sale CASH payment total correct");
  assert(cancelledSale.status === "CANCELLED", "Cancelled sale status correct");
  assert(cancelledSale.paymentStatus === "REFUNDED", "Cancelled sale paymentStatus correct");
  assert(cancelledSale.paymentMethods.GCASH === 3000, "Cancelled sale GCASH payment total correct");

  const completedOnly = await request(
    "/reports/sales-summary?status=COMPLETED&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  if (completedOnly.status !== 200) {
    console.dir(completedOnly.body, { depth: null });
  }

  assert(completedOnly.status === 200, "status filter works");
  assert(
    completedOnly.body.data.records.some((sale) => sale.receiptCode === "PHASE14HA-SALE-0001"),
    "status filter includes completed test sale"
  );
  assert(
    !completedOnly.body.data.records.some((sale) => sale.receiptCode === "PHASE14HA-SALE-0002"),
    "status filter excludes cancelled test sale"
  );

  const paidOnly = await request(
    "/reports/sales-summary?paymentStatus=PAID&dateFrom=2026-08-05&dateTo=2026-08-05&page=1&limit=20",
    {
      token: adminLogin.token,
    }
  );

  assert(paidOnly.status === 200, "paymentStatus filter works");
  assert(
    paidOnly.body.data.records.some((sale) => sale.receiptCode === "PHASE14HA-SALE-0001"),
    "paymentStatus filter includes paid test sale"
  );
  assert(
    !paidOnly.body.data.records.some((sale) => sale.receiptCode === "PHASE14HA-SALE-0002"),
    "paymentStatus filter excludes refunded test sale"
  );

  const ownBranchFilter = await request(
    `/reports/sales-summary?branchId=${mainBranchId}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(ownBranchFilter.status === 200, "Admin can filter own branch sales report");

  const otherBranchFilter = await request(
    `/reports/sales-summary?branchId=${otherBranch.id}&dateFrom=2026-08-05&dateTo=2026-08-05`,
    {
      token: adminLogin.token,
    }
  );

  assert(otherBranchFilter.status === 403, "Admin blocked from other branch sales report");

  const technicianSummary = await request("/reports/sales-summary?dateFrom=2026-08-05&dateTo=2026-08-05", {
    token: technicianLogin.token,
  });

  assert(technicianSummary.status === 403, "Technician blocked from sales summary report");

  const invalidStatus = await request("/reports/sales-summary?status=INVALID", {
    token: adminLogin.token,
  });

  assert(invalidStatus.status === 400, "Invalid sales status rejected");

  const invalidDate = await request("/reports/sales-summary?dateFrom=not-a-date", {
    token: adminLogin.token,
  });

  assert(invalidDate.status === 400, "Invalid dateFrom rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14H-A SALES SUMMARY REPORT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14H-A SALES SUMMARY REPORT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



