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
  console.log("\nPHASE 14J-B: Alert Summary Endpoint Test");
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

  const summary = await request("/reports/alert-summary?limit=10", {
    token: adminLogin.token,
  });

  if (summary.status !== 200) {
    console.dir(summary.body, { depth: null });
  }

  assert(summary.status === 200, "Admin can access alert summary");
  assert(summary.body.success === true, "Alert summary success response returned");
  assert(summary.body.message === "Alert summary report retrieved successfully", "Alert summary message returned");
  assert(Boolean(summary.body.data.report), "Alert summary report object returned");
  assert(Boolean(summary.body.data.alerts), "Alert groups returned");

  const report = summary.body.data.report;
  const alerts = summary.body.data.alerts;

  assert(report.name === "Alert Summary", "Report name is Alert Summary");
  assert(Boolean(report.generatedAt), "Report generatedAt returned");
  assert(Boolean(report.filters), "Report filters returned");
  assert(Boolean(report.totals), "Report totals returned");

  assert(typeof report.totals.totalAlerts === "number", "totalAlerts is numeric");
  assert(typeof report.totals.inventoryAlerts === "number", "inventoryAlerts is numeric");
  assert(typeof report.totals.stockTransferAlerts === "number", "stockTransferAlerts is numeric");
  assert(typeof report.totals.warrantyAlerts === "number", "warrantyAlerts is numeric");
  assert(typeof report.totals.purchaseOrderAlerts === "number", "purchaseOrderAlerts is numeric");
  assert(typeof report.totals.purchaseReceivingAlerts === "number", "purchaseReceivingAlerts is numeric");
  assert(typeof report.totals.cashHandoverAlerts === "number", "cashHandoverAlerts is numeric");

  assert(Boolean(alerts.inventory), "Inventory alert group returned");
  assert(Boolean(alerts.stockTransfers), "Stock transfer alert group returned");
  assert(Boolean(alerts.warrantyClaims), "Warranty alert group returned");
  assert(Boolean(alerts.purchaseOrders), "Purchase order alert group returned");
  assert(Boolean(alerts.purchaseReceivings), "Purchase receiving alert group returned");
  assert(Boolean(alerts.cashHandovers), "Cash handover alert group returned");

  assert(Array.isArray(alerts.inventory.records), "Inventory alert records returned");
  assert(Array.isArray(alerts.stockTransfers.records), "Stock transfer alert records returned");
  assert(Array.isArray(alerts.warrantyClaims.records), "Warranty alert records returned");
  assert(Array.isArray(alerts.purchaseOrders.records), "Purchase order alert records returned");
  assert(Array.isArray(alerts.purchaseReceivings.records), "Purchase receiving alert records returned");
  assert(Array.isArray(alerts.cashHandovers.records), "Cash handover alert records returned");

  const computedTotal =
    alerts.inventory.total +
    alerts.stockTransfers.total +
    alerts.warrantyClaims.total +
    alerts.purchaseOrders.total +
    alerts.purchaseReceivings.total +
    alerts.cashHandovers.total;

  assert(report.totals.totalAlerts === computedTotal, "totalAlerts matches alert group totals");

  const ownBranchSummary = await request(`/reports/alert-summary?branchId=${mainBranchId}&limit=10`, {
    token: adminLogin.token,
  });

  assert(ownBranchSummary.status === 200, "Admin can access own branch alert summary");

  const otherBranchSummary = await request(`/reports/alert-summary?branchId=${otherBranch.id}&limit=10`, {
    token: adminLogin.token,
  });

  assert(otherBranchSummary.status === 403, "Admin blocked from other branch alert summary");

  const technicianSummary = await request("/reports/alert-summary?limit=10", {
    token: technicianLogin.token,
  });

  assert(technicianSummary.status === 403, "Technician blocked from alert summary");

  const invalidLimit = await request("/reports/alert-summary?limit=abc", {
    token: adminLogin.token,
  });

  assert(invalidLimit.status === 400, "Invalid limit rejected");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14J-B ALERT SUMMARY ENDPOINT TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14J-B ALERT SUMMARY ENDPOINT TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
