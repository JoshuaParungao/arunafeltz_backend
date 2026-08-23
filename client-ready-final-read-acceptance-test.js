require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");

const credentials = {
  admin: { identifier: "mainadmin", password: "Password123!" },
  superOwner: { identifier: "superowner", password: "Password123!" },
};

let passed = 0;
let skipped = 0;

const check = (condition, message, details) => {
  if (!condition) {
    if (details !== undefined) console.dir(details, { depth: 6 });
    throw new Error(message);
  }

  passed += 1;
  console.log(`PASS ${passed}: ${message}`);
};

const skip = (message) => {
  skipped += 1;
  console.log(`SKIP ${skipped}: ${message}`);
};

const main = async () => {
  const configuredBaseUrl = process.env.ACCEPTANCE_BASE_URL?.replace(/\/$/, "");
  const server = configuredBaseUrl ? null : app.listen(0);
  if (server) await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = configuredBaseUrl || `http://127.0.0.1:${server.address().port}/api`;

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

  const expectOk = async (label, path, token) => {
    const result = await request(path, { token });
    check(result.status === 200, `${label} responds successfully`, result.body);
    check(result.body?.success === true, `${label} uses the success envelope`, result.body);
    check(!JSON.stringify(result.body).includes("passwordHash"), `${label} does not expose password hashes`);
    return result.body;
  };

  const login = async (label, account) => {
    const result = await request("/auth/login", {
      method: "POST",
      body: account,
    });
    check(result.status === 200, `${label} login succeeds`, result.body);
    check(Boolean(result.body?.data?.token), `${label} login returns an access token`);
    check(!JSON.stringify(result.body).includes("passwordHash"), `${label} login response is safe`);
    return result.body.data;
  };

  try {
    const health = await request("/health");
    check(health.status === 200, "Health endpoint responds successfully", health.body);
    check(health.body?.data?.database === "reachable", "Health endpoint verifies PostgreSQL", health.body);

    const anonymousSales = await request("/sales");
    check(anonymousSales.status === 401, "Business data rejects anonymous access", anonymousSales.body);

    const admin = await login("Branch admin", credentials.admin);
    const superOwner = await login("Super Owner", credentials.superOwner);
    const branchId = admin.user?.branch?.id || admin.user?.branchId;
    check(Boolean(branchId), "Branch admin has an assigned branch");

    const me = await expectOk("Authenticated session", "/auth/me", admin.token);
    check(me.data?.user?.id === admin.user.id, "Authenticated session resolves the current user");
    check(
      typeof me.data?.user?.incentiveClassification === "string",
      "Authenticated user safely exposes incentive classification separately from access role"
    );

    const branchDirectory = await expectOk("Branch directory", "/branches", admin.token);
    check(Array.isArray(branchDirectory.data), "Branch directory returns records");

    const ownBranch = await expectOk("Assigned branch detail", `/branches/${branchId}`, admin.token);
    check(ownBranch.data?.id === branchId, "Assigned branch detail matches the actor branch");

    const readChecks = [
      ["Owner dashboard alert source", `/reports/alert-summary?branchId=${branchId}&limit=3`],
      ["Catalog items", `/items?branchId=${branchId}&limit=3`],
      ["Customers", `/customers?branchId=${branchId}&limit=3`],
      ["Quotations", `/quotations?branchId=${branchId}&limit=3`],
      ["Quotation service staff", `/quotations/service-staff?branchId=${branchId}`],
      ["Inventory overview", `/inventory/overview?branchId=${branchId}&limit=3`],
      ["Inventory batches", `/inventory/batches?branchId=${branchId}&limit=3`],
      ["Inventory movements", `/inventory/movements?branchId=${branchId}&limit=3`],
      ["Serial monitoring", `/inventory/serials?branchId=${branchId}&limit=3`],
      ["Stock transfers", `/stock-transfers?branchId=${branchId}&limit=3`],
      ["Sales", `/sales?branchId=${branchId}&limit=3`],
      ["Service jobs", `/service-jobs?branchId=${branchId}&limit=3`],
      ["Service technician lookup", `/service-jobs/technicians?branchId=${branchId}`],
      ["Warranty claims", `/warranty-claims?branchId=${branchId}&limit=3`],
      ["Suppliers", `/suppliers?branchId=${branchId}&limit=3`],
      ["Purchase orders", `/purchase-orders?branchId=${branchId}&limit=3`],
      ["Purchase receiving", `/purchase-receivings?branchId=${branchId}&limit=3`],
      ["Cash boxes", `/cash-boxes?branchId=${branchId}&limit=3`],
      ["Cash handovers", `/cash-boxes/handovers?branchId=${branchId}&limit=3`],
      ["Credit accounts", `/credit-accounts?branchId=${branchId}&limit=3`],
      ["Users", `/users?branchId=${branchId}&limit=3`],
      ["Settings", `/settings?branchId=${branchId}`],
      ["Audit logs", `/audit-logs?branchId=${branchId}&limit=3`],
    ];

    const readResults = new Map();
    for (const [label, path] of readChecks) {
      readResults.set(label, await expectOk(label, path, admin.token));
    }

    const serviceStaff = readResults.get("Quotation service staff")?.data || [];
    check(Array.isArray(serviceStaff), "Quotation service staff response is a minimal list");
    check(serviceStaff.every((staff) => staff.role !== "SUPER_OWNER"), "Quotation service staff excludes Super Owner");
    check(
      serviceStaff.every((staff) => Object.keys(staff).every((key) => ["id", "fullName", "role"].includes(key))),
      "Quotation service staff exposes only workflow-safe fields"
    );

    const branchTransfers = readResults.get("Stock transfers")?.data?.items || [];
    check(Array.isArray(branchTransfers), "Stock transfers return a paginated record list");
    check(
      branchTransfers.every(
        (transfer) => transfer.fromBranchId === branchId || transfer.toBranchId === branchId
      ),
      "Selected-branch stock transfers include only linked routes"
    );

    const serialRows = readResults.get("Serial monitoring")?.data?.data || [];
    check(Array.isArray(serialRows), "Serial monitoring returns a paginated record list");
    if (serialRows.length > 0) {
      check(serialRows.every((row) => Array.isArray(row.saleItems)), "Serial records include outbound sale references");
      check(serialRows.every((row) => Array.isArray(row.warrantyClaims)), "Serial records include warranty references");
      check(serialRows.every((row) => Array.isArray(row.stockTransferSerials)), "Serial records include transfer references");
    } else {
      skip("Serial reference shape checks: branch has no serial records");
    }

    const detailTargets = [
      ["Customer detail", "customer", "/customers", { branchId }],
      ["Quotation detail", "quotation", "/quotations", { branchId }],
      ["Sale detail", "sale", "/sales", { branchId }],
      ["Service job detail", "serviceJob", "/service-jobs", { branchId }],
      ["Warranty detail", "warrantyClaim", "/warranty-claims", { branchId }],
      ["Purchase order detail", "purchaseOrder", "/purchase-orders", { branchId }],
      ["Receiving detail", "purchaseReceiving", "/purchase-receivings", { branchId }],
      ["Transfer detail", "stockTransfer", "/stock-transfers", { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }],
      ["Cash box detail", "cashBox", "/cash-boxes", { branchId }],
      ["Credit detail", "creditAccount", "/credit-accounts", { branchId }],
    ];

    for (const [label, model, path, where] of detailTargets) {
      const target = await prisma[model].findFirst({ where, select: { id: true } });
      if (!target) {
        skip(`${label}: no branch record exists`);
        continue;
      }

      const detail = await expectOk(label, `${path}/${target.id}`, admin.token);
      check(Boolean(detail.data), `${label} returns data`);

      if (model === "customer") {
        await expectOk("Customer transaction history", `${path}/${target.id}/history?limit=3`, admin.token);
      }

      if (model === "quotation") {
        check(Boolean(detail.data?.preparedBy), "Quotation detail preserves Prepared By attribution", detail.data);
        check(Object.hasOwn(detail.data, "serviceDoneBy"), "Quotation detail exposes separate Service Done By attribution", detail.data);
      }

      if (model === "sale") {
        check(Array.isArray(detail.data?.items), "Sale detail includes immutable sale lines", detail.data);
        check(Array.isArray(detail.data?.returnRequests), "Sale detail includes auditable line-return history", detail.data);
      }

      if (model === "serviceJob") {
        check(Array.isArray(detail.data?.actionHistory), "Service job detail exposes safe action history", detail.data);
        check(Object.hasOwn(detail.data, "receivedBy"), "Service job distinguishes Received By", detail.data);
        check(Object.hasOwn(detail.data, "releasedBy"), "Service job distinguishes Released By", detail.data);
      }

      if (model === "stockTransfer") {
        check(
          (detail.data?.items || []).every((item) => Array.isArray(item.allocations)),
          "Transfer detail exposes exact allocation lineage"
        );
      }
    }

    const reports = [
      "inventory-summary",
      "sales-summary",
      "service-summary",
      "warranty-summary",
      "cash-summary",
      "supplier-summary",
      "purchase-order-summary",
      "purchase-receiving-summary",
      "stock-transfer-summary",
      "credit-summary",
      "staff-performance-summary",
    ];

    for (const report of reports) {
      const body = await expectOk(
        `Report ${report}`,
        `/reports/${report}?branchId=${branchId}&limit=3`,
        admin.token
      );
      check(Array.isArray(body.data?.records), `Report ${report} returns live records`);
      if (report === "sales-summary") {
        const totals = body.data?.report?.totals || {};
        check(
          Math.abs(
            Number(totals.totalGrossGrandTotal || 0) -
              Number(totals.totalRefundAmount || 0) -
              Number(totals.totalGrandTotal || 0)
          ) < 0.001,
          "Sales report nets completed line returns from overall revenue",
          totals
        );
        check(
          Math.abs(
            Number(totals.totalGrossProductRevenue || 0) -
              Number(totals.totalProductRefundAmount || 0) -
              Number(totals.totalProductRevenue || 0)
          ) < 0.001,
          "Sales report nets completed line returns from product revenue",
          totals
        );
        check(
          [
            "netExternalSales",
            "totalOperationalProductCost",
            "totalBranchProductMargin",
            "totalAcquisitionProductCost",
            "totalConsolidatedProductMargin",
          ].every((key) => typeof totals[key] === "number"),
          "Sales report separates external revenue, branch cost, acquisition cost, and margins",
          totals
        );
      }

      if (report === "service-summary") {
        const totals = body.data?.report?.totals || {};
        check(
          [
            "totalQuickJobs",
            "totalReleasedJobs",
            "totalReleasedUnrepairedJobs",
            "totalNoChargeJobs",
            "totalNotDueJobs",
          ].every((key) => typeof totals[key] === "number"),
          "Service report exposes quick, release, outcome, and payment-state monitoring",
          totals
        );
      }

      if (report === "stock-transfer-summary") {
        const totals = body.data?.report?.totals || {};
        check(
          [
            "totalPostedTransferAmount",
            "outgoingTransferSales",
            "incomingTransferPurchases",
            "totalAcquisitionCost",
          ].every((key) => typeof totals[key] === "number"),
          "Transfer report separates transfer sale, purchase, and original acquisition cost",
          totals
        );
      }
    }

    const incentiveRules = await expectOk(
      "Incentive settings",
      "/settings/scope/GLOBAL%3Aincentive.rules",
      admin.token
    );
    const incentives = await request(`/incentives?branchId=${branchId}&limit=3`, {
      token: admin.token,
    });
    const ownerCanViewAll = incentiveRules.data?.value?.ownerCanViewAllIncentives !== false;
    check(
      incentives.status === (ownerCanViewAll ? 200 : 403),
      "Incentive ledger visibility follows saved Settings rules",
      incentives.body
    );

    const incentiveConfigurationResult = await request(
      "/incentives/configuration",
      { token: admin.token }
    );
    check(
      incentiveConfigurationResult.status === (ownerCanViewAll ? 200 : 403),
      "Enterprise incentive configuration visibility follows saved Settings rules",
      incentiveConfigurationResult.body
    );
    const incentiveConfiguration = ownerCanViewAll
      ? incentiveConfigurationResult.body
      : await expectOk(
          "Super Owner enterprise incentive configuration",
          "/incentives/configuration",
          superOwner.token
        );
    check(
      Array.isArray(incentiveConfiguration.data?.classifications) &&
        incentiveConfiguration.data.classifications.length === 4,
      "Incentive configuration exposes the four compensation classifications"
    );

    for (const [label, path] of [
      ["Incentive calendar", `/incentives/calendar?branchId=${branchId}&limit=6`],
      ["Incentive cycles", `/incentives/cycles?branchId=${branchId}&limit=3`],
      ["Incentive claims", `/incentives/claims?branchId=${branchId}&limit=3`],
    ]) {
      const result = await request(path, { token: admin.token });
      check(
        result.status === (ownerCanViewAll ? 200 : 403),
        `${label} visibility follows saved Settings rules`,
        result.body
      );
    }

    const superGlobalSales = await expectOk(
      "Super Owner multi-branch sales report",
      "/reports/sales-summary?limit=3",
      superOwner.token
    );
    check(
      superGlobalSales.data?.report?.filters?.branchId === null,
      "Super Owner report supports an all-branch view",
      superGlobalSales.data
    );

    const superBranchTransfers = await expectOk(
      "Super Owner selected-branch stock transfers",
      `/stock-transfers?branchId=${branchId}&limit=100`,
      superOwner.token
    );
    check(
      (superBranchTransfers.data?.items || []).every(
        (transfer) => transfer.fromBranchId === branchId || transfer.toBranchId === branchId
      ),
      "Super Owner transfer view follows the selected branch",
      superBranchTransfers.data
    );

    const otherBranch = branchDirectory.data.find((branch) => branch.id !== branchId);
    if (otherBranch) {
      const crossInventory = await request(
        `/inventory/overview?branchId=${otherBranch.id}&limit=1`,
        { token: admin.token }
      );
      check(crossInventory.status === 403, "Branch admin cannot override inventory branch scope", crossInventory.body);

      const crossReport = await request(
        `/reports/sales-summary?branchId=${otherBranch.id}&limit=1`,
        { token: admin.token }
      );
      check(crossReport.status === 403, "Branch admin cannot override report branch scope", crossReport.body);

      const crossTransfers = await request(
        `/stock-transfers?branchId=${otherBranch.id}&limit=1`,
        { token: admin.token }
      );
      check(
        crossTransfers.status === 403,
        "Branch admin cannot override stock-transfer branch scope",
        crossTransfers.body
      );
    } else {
      skip("Cross-branch checks: only one branch exists");
    }

    console.log(`FINAL_READ_ACCEPTANCE_PASS passed=${passed} skipped=${skipped}`);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error("FINAL_READ_ACCEPTANCE_FAIL", error);
  process.exitCode = 1;
});
