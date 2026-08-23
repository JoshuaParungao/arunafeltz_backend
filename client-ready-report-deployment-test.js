require("dotenv").config();

const app = require("./src/app");
const prisma = require("./src/config/prisma");

const credentials = {
  admin: { identifier: "mainadmin", password: "Password123!" },
  technician: { identifier: "pendingtech", password: "Password123!" },
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

const main = async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.origin ? { Origin: options.origin } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json().catch(() => null),
    };
  };

  const login = async (account) => {
    const result = await request("/auth/login", { method: "POST", body: account });
    assert(result.status === 200 && result.body?.data?.token, `Login succeeds for ${account.identifier}`, result.body);
    return result.body.data;
  };

  try {
    const health = await request("/health");
    assert(health.status === 200, "Database-aware health endpoint is healthy", health.body);
    assert(health.body?.data?.database === "reachable", "Health response confirms database reachability", health.body);

    const allowedOrigin = await request("/health", { origin: "http://localhost:5173" });
    assert(allowedOrigin.status === 200, "Configured development browser origin is accepted", allowedOrigin.body);
    assert(allowedOrigin.headers.get("access-control-allow-origin") === "http://localhost:5173", "CORS echoes only the accepted origin");

    const blockedOrigin = await request("/health", { origin: "https://untrusted.example" });
    assert(blockedOrigin.status === 403, "Untrusted browser origin is rejected", blockedOrigin.body);
    assert(blockedOrigin.body?.error?.code === "CORS_ORIGIN_DENIED", "Rejected CORS response uses a safe explicit code", blockedOrigin.body);

    const unauthenticated = await request("/reports/credit-summary");
    assert(unauthenticated.status === 401, "Reports reject unauthenticated access", unauthenticated.body);

    const [admin, technician, superOwner] = await Promise.all([
      login(credentials.admin),
      login(credentials.technician),
      login(credentials.superOwner),
    ]);
    const branchId = admin.user.branch?.id || admin.user.branchId;
    assert(Boolean(branchId), "Admin branch is available");

    const creditReport = await request(`/reports/credit-summary?branchId=${branchId}&limit=5`, { token: admin.token });
    assert(creditReport.status === 200, "Admin can read own-branch credit report", creditReport.body);
    assert(Array.isArray(creditReport.body?.data?.records), "Credit report returns records array", creditReport.body);
    assert(typeof creditReport.body?.data?.report?.totals?.totalRemaining === "number", "Credit report exposes numeric balance totals", creditReport.body);

    const invalidCreditFilter = await request(`/reports/credit-summary?branchId=${branchId}&overdueOnly=maybe`, { token: admin.token });
    assert(invalidCreditFilter.status === 400, "Credit report validates overdue filter", invalidCreditFilter.body);

    const staffReport = await request(`/reports/staff-performance-summary?branchId=${branchId}&limit=5`, { token: admin.token });
    assert(staffReport.status === 200, "Admin can read own-branch staff performance report", staffReport.body);
    assert(Array.isArray(staffReport.body?.data?.records), "Staff performance returns records array", staffReport.body);
    assert(staffReport.body?.data?.records.every((row) => row.branch?.id === branchId), "Staff performance records remain branch scoped", staffReport.body);

    const alerts = await request(`/reports/alert-summary?branchId=${branchId}&limit=5`, { token: admin.token });
    assert(alerts.status === 200, "Admin can read expanded alert summary", alerts.body);
    assert(alerts.body?.data?.alerts?.creditAccounts && Array.isArray(alerts.body.data.alerts.creditAccounts.records), "Alerts include overdue-credit group", alerts.body);

    const technicianReport = await request(`/reports/credit-summary?branchId=${branchId}`, { token: technician.token });
    assert(technicianReport.status === 403, "Technician cannot access management reports", technicianReport.body);

    const branches = await request("/branches", { token: superOwner.token });
    const branchList = Array.isArray(branches.body?.data) ? branches.body.data : [];
    const otherBranch = branchList.find((branch) => branch.id !== branchId);
    if (otherBranch) {
      const crossBranchReport = await request(`/reports/staff-performance-summary?branchId=${otherBranch.id}`, { token: admin.token });
      assert(crossBranchReport.status === 403, "Branch admin cannot override report branch scope", crossBranchReport.body);
    } else {
      assert(true, "Cross-branch report check skipped because only one branch exists");
    }

    const incentiveRules = await request("/settings/scope/GLOBAL%3Aincentive.rules", { token: admin.token });
    assert(incentiveRules.status === 200, "Admin can read saved incentive visibility rules", incentiveRules.body);
    const rules = incentiveRules.body?.data?.value || {};
    const adminIncentives = await request(`/incentives?branchId=${branchId}&limit=5`, { token: admin.token });
    assert(adminIncentives.status === (rules.ownerCanViewAllIncentives === false ? 403 : 200), "Owner/admin incentive visibility follows saved rules", adminIncentives.body);
    const technicianIncentives = await request(`/incentives?branchId=${branchId}&limit=5`, { token: technician.token });
    assert(technicianIncentives.status === (rules.staffCanViewOwnIncentives === false ? 403 : 200), "Staff incentive visibility follows saved rules", technicianIncentives.body);

    console.log(`REPORT_DEPLOYMENT_TEST_PASS ${passed}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error("REPORT_DEPLOYMENT_TEST_FAIL", error);
  process.exitCode = 1;
});
