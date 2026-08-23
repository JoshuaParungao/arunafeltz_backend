require("dotenv").config();

const app = require("./src/app");

const credentials = {
  admin: { identifier: "mainadmin", password: "Password123!" },
  superOwner: { identifier: "superowner", password: "Password123!" },
};

let passed = 0;

const assert = (condition, message, details) => {
  if (!condition) {
    if (details !== undefined) console.dir(details, { depth: null });
    throw new Error(message);
  }

  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
};

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

const main = async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  };

  const login = async (account) => {
    const response = await request("/auth/login", {
      method: "POST",
      body: account,
    });
    assert(
      response.status === 200 && response.body?.data?.token,
      `Login succeeds for ${account.identifier}`,
      response.body
    );
    return response.body.data;
  };

  try {
    const unauthenticated = await request("/reports/sales-summary");
    assert(unauthenticated.status === 401, "Enterprise reports remain authenticated");

    const [admin, superOwner] = await Promise.all([
      login(credentials.admin),
      login(credentials.superOwner),
    ]);
    const branchId = admin.user.branch?.id || admin.user.branchId;
    assert(Boolean(branchId), "Admin branch is available");

    const sales = await request(
      `/reports/sales-summary?branchId=${branchId}&limit=100`,
      { token: admin.token }
    );
    assert(sales.status === 200, "Branch sales and costing report loads", sales.body);
    const salesTotals = sales.body?.data?.report?.totals || {};
    const salesRecords = sales.body?.data?.records || [];
    assert(
      [
        "netExternalSales",
        "totalOperationalProductCost",
        "totalBranchProductMargin",
        "totalAcquisitionProductCost",
        "totalConsolidatedProductMargin",
      ].every((key) => typeof salesTotals[key] === "number"),
      "Sales totals distinguish external revenue, branch COGS, acquisition COGS, and both margins",
      salesTotals
    );
    assert(
      salesRecords.every((record) => [
        "netOperationalProductCost",
        "branchProductMargin",
        "netAcquisitionProductCost",
        "consolidatedProductMargin",
      ].every((key) => typeof record[key] === "number")),
      "Each sale record exposes return-netted dual-cost margins",
      salesRecords[0]
    );
    const externalRecordTotal = salesRecords.reduce(
      (sum, record) => sum + Number(record.netGrandTotal || 0),
      0
    );
    assert(
      Math.abs(externalRecordTotal - salesTotals.netExternalSales) < 0.01,
      "Net external sales equals ordinary sale records and excludes internal transfers",
      { externalRecordTotal, netExternalSales: salesTotals.netExternalSales }
    );

    const services = await request(
      `/reports/service-summary?branchId=${branchId}&limit=100`,
      { token: admin.token }
    );
    assert(services.status === 200, "Services / Job Orders report loads", services.body);
    const serviceTotals = services.body?.data?.report?.totals || {};
    assert(
      [
        "totalEnteredToday",
        "totalQuickJobs",
        "totalReleasedJobs",
        "totalReleasedUnrepairedJobs",
        "totalNoChargeJobs",
        "totalNotDueJobs",
      ].every((key) => typeof serviceTotals[key] === "number"),
      "Service report exposes enterprise lifecycle and payment-state counts",
      serviceTotals
    );
    assert(
      (services.body?.data?.records || []).every((record) =>
        ["PAID", "UNPAID", "NO_CHARGE", "NOT_DUE"].includes(record.paymentState)
      ),
      "Service rows distinguish paid, payable, no-charge, and not-due work"
    );
    const quickJobs = await request(
      `/reports/service-summary?branchId=${branchId}&isQuickService=true&limit=100`,
      { token: admin.token }
    );
    assert(
      quickJobs.status === 200 &&
        (quickJobs.body?.data?.records || []).every((record) => record.isQuickService === true),
      "Backend-authoritative quick-service report filter works",
      quickJobs.body
    );
    const invalidReleaseFilter = await request(
      `/reports/service-summary?branchId=${branchId}&releaseOutcome=INVALID`,
      { token: admin.token }
    );
    assert(invalidReleaseFilter.status === 400, "Invalid release outcome filter is rejected");

    const transfers = await request(
      `/reports/stock-transfer-summary?branchId=${branchId}&limit=100`,
      { token: admin.token }
    );
    assert(transfers.status === 200, "Branch transfer accounting report loads", transfers.body);
    const transferTotals = transfers.body?.data?.report?.totals || {};
    assert(
      [
        "totalPostedTransferAmount",
        "outgoingTransferSales",
        "incomingTransferPurchases",
        "totalAcquisitionCost",
        "totalSourceOperationalCost",
        "totalSourceInternalMargin",
      ].every((key) => typeof transferTotals[key] === "number"),
      "Transfer report separates internal sale, purchase, acquisition cost, and source margin",
      transferTotals
    );

    const globalTransfers = await request(
      "/reports/stock-transfer-summary?limit=100",
      { token: superOwner.token }
    );
    assert(globalTransfers.status === 200, "Super Owner global transfer report loads", globalTransfers.body);
    const globalTotals = globalTransfers.body?.data?.report?.totals || {};
    assert(
      Math.abs(globalTotals.outgoingTransferSales - globalTotals.incomingTransferPurchases) < 0.01 &&
        Math.abs(globalTotals.consolidatedNetTransferRevenue) < 0.01 &&
        Math.abs(globalTotals.consolidatedInternalElimination - globalTotals.totalPostedTransferAmount) < 0.01,
      "Global report fully eliminates internal transfer revenue",
      globalTotals
    );

    const staff = await request(
      `/reports/staff-performance-summary?branchId=${branchId}&limit=100`,
      { token: admin.token }
    );
    assert(staff.status === 200, "Staff performance report loads", staff.body);
    assert(
      (staff.body?.data?.records || []).every((record) =>
        typeof record.incentiveClassification === "string"
      ),
      "Staff report keeps access role separate from incentive classification"
    );
    assert(
      ["releasedServices", "releasedUnrepairedServices"].every(
        (key) => typeof staff.body?.data?.report?.totals?.[key] === "number"
      ),
      "Staff report distinguishes released work and released-unrepaired work"
    );

    const branches = await request("/branches", { token: superOwner.token });
    const otherBranch = (branches.body?.data || []).find((branch) => branch.id !== branchId);
    if (otherBranch) {
      const forbidden = await request(
        `/reports/sales-summary?branchId=${otherBranch.id}`,
        { token: admin.token }
      );
      assert(forbidden.status === 403, "Branch manager cannot override enterprise report branch scope");
    } else {
      assert(true, "Cross-branch assertion skipped because no second branch exists");
    }

    console.log(`ENTERPRISE_REFINEMENT_REPORT_TEST_PASS ${passed}`);
  } finally {
    await closeServer(server);
  }
};

main().catch((error) => {
  console.error("ENTERPRISE_REFINEMENT_REPORT_TEST_FAIL", error);
  process.exitCode = 1;
});
