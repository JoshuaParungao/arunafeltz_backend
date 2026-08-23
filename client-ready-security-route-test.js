const assert = require("node:assert/strict");

const app = require("./src/app");
const prisma = require("./src/config/prisma");
const { signToken } = require("./src/utils/jwt");

let passed = 0;

const check = (condition, message) => {
  assert.ok(condition, message);
  passed += 1;
};

const main = async () => {
  const branchActor = await prisma.user.findFirst({
    where: {
      status: "ACTIVE",
      branchId: { not: null },
      role: { in: ["BRANCH_OWNER", "ADMIN", "CASHIER", "TECHNICIAN"] },
      branch: { is: { status: "ACTIVE" } },
    },
    select: { id: true, role: true, branchId: true },
  });
  const superOwner = await prisma.user.findFirst({
    where: { status: "ACTIVE", role: "SUPER_OWNER" },
    select: { id: true, role: true, branchId: true },
  });
  const branchManager = await prisma.user.findFirst({
    where: {
      status: "ACTIVE",
      branchId: { not: null },
      role: { in: ["BRANCH_OWNER", "ADMIN"] },
      branch: { is: { status: "ACTIVE" } },
    },
    select: { id: true, role: true, branchId: true },
  });

  check(Boolean(branchActor), "An active branch-scoped test actor is required");
  check(Boolean(superOwner), "An active Super Owner test actor is required");
  check(Boolean(branchManager), "An active branch manager test actor is required");

  const otherBranch = await prisma.branch.findFirst({
    where: { id: { not: branchActor.branchId } },
    select: { id: true },
  });
  const branchCount = await prisma.branch.count();
  const otherManagerBranch = await prisma.branch.findFirst({
    where: { id: { not: branchManager.branchId } },
    select: { id: true },
  });

  const branchToken = signToken({
    sub: branchActor.id,
    role: branchActor.role,
    branchId: branchActor.branchId,
  });
  const superToken = signToken({
    sub: superOwner.id,
    role: superOwner.role,
    branchId: superOwner.branchId,
  });
  const managerToken = signToken({
    sub: branchManager.id,
    role: branchManager.role,
    branchId: branchManager.branchId,
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = async (path, { token, headers, ...options } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers || {}),
      },
    });
    const body = await response.json().catch(() => null);
    return { response, body };
  };

  try {
    const health = await request("/api/health");
    check(health.response.status === 200, "Health route should remain public");
    check(
      health.response.headers.get("x-content-type-options") === "nosniff",
      "Helmet security headers should be present"
    );

    const protectedReadPaths = [
      "/api/branches",
      "/api/users",
      "/api/settings",
      "/api/customers",
      "/api/suppliers",
      "/api/purchase-orders",
      "/api/purchase-receivings",
      "/api/stock-transfers",
      "/api/item-categories",
      "/api/units",
      "/api/items",
      "/api/inventory/overview",
      "/api/quotations",
      "/api/sales",
      "/api/credit-accounts",
      "/api/cash-boxes",
      "/api/service-jobs",
      "/api/warranty-claims",
      "/api/audit-logs",
      "/api/reports/inventory-summary",
      "/api/incentives",
      "/api/incentives/configuration",
      "/api/incentives/calendar",
      "/api/incentives/cycles",
      "/api/incentives/claims",
    ];

    for (const path of protectedReadPaths) {
      const result = await request(path);
      check(result.response.status === 401, `${path} must reject anonymous access`);
    }

    const protectedMutationRequests = [
      ["POST", "/api/branches"],
      ["PATCH", "/api/branches/invalid-id"],
      ["PATCH", "/api/branches/invalid-id/deactivate"],
      ["POST", "/api/users"],
      ["PATCH", "/api/users/invalid-id"],
      ["PATCH", "/api/users/invalid-id/approve"],
      ["PATCH", "/api/users/invalid-id/reject"],
      ["PATCH", "/api/users/invalid-id/disable"],
      ["PATCH", "/api/settings/scope/GLOBAL%3Atest"],
      ["POST", "/api/customers"],
      ["PATCH", "/api/customers/invalid-id"],
      ["POST", "/api/suppliers"],
      ["PATCH", "/api/suppliers/invalid-id"],
      ["PATCH", "/api/suppliers/invalid-id/status"],
      ["POST", "/api/purchase-orders"],
      ["PATCH", "/api/purchase-orders/invalid-id"],
      ["PATCH", "/api/purchase-orders/invalid-id/status"],
      ["POST", "/api/purchase-receivings"],
      ["PATCH", "/api/purchase-receivings/invalid-id"],
      ["PATCH", "/api/purchase-receivings/invalid-id/status"],
      ["POST", "/api/stock-transfers"],
      ["POST", "/api/stock-transfers/requests"],
      ["PATCH", "/api/stock-transfers/invalid-id"],
      ["PATCH", "/api/stock-transfers/invalid-id/pricing"],
      ["PATCH", "/api/stock-transfers/invalid-id/status"],
      ["POST", "/api/item-categories"],
      ["PATCH", "/api/item-categories/invalid-id"],
      ["POST", "/api/units"],
      ["PATCH", "/api/units/invalid-id"],
      ["POST", "/api/items"],
      ["PATCH", "/api/items/invalid-id"],
      ["PATCH", "/api/inventory/serials/invalid-id/status"],
      ["POST", "/api/inventory/stock-in"],
      ["POST", "/api/inventory/adjustments"],
      ["POST", "/api/quotations"],
      ["PATCH", "/api/quotations/invalid-id"],
      ["PATCH", "/api/quotations/invalid-id/status"],
      ["POST", "/api/sales"],
      ["POST", "/api/sales/invalid-id/returns"],
      ["POST", "/api/sales/invalid-id/credit-account"],
      ["PATCH", "/api/sales/invalid-id/cancel"],
      ["POST", "/api/credit-accounts/invalid-id/collections"],
      ["POST", "/api/credit-accounts/collections/invalid-id/cancel"],
      ["POST", "/api/cash-boxes/invalid-id/transactions"],
      ["POST", "/api/cash-boxes/transactions/invalid-id/cancel"],
      ["POST", "/api/cash-boxes/invalid-id/handovers"],
      ["POST", "/api/cash-boxes/handovers/invalid-id/receive"],
      ["POST", "/api/cash-boxes/handovers/invalid-id/cancel"],
      ["POST", "/api/service-jobs"],
      ["PATCH", "/api/service-jobs/invalid-id/assignment"],
      ["PATCH", "/api/service-jobs/invalid-id/status"],
      ["POST", "/api/service-jobs/invalid-id/release"],
      ["POST", "/api/service-jobs/invalid-id/payment"],
      ["POST", "/api/warranty-claims"],
      ["PATCH", "/api/warranty-claims/invalid-id/status"],
      ["POST", "/api/warranty-claims/invalid-id/release"],
      ["PATCH", "/api/incentives/rules"],
      ["POST", "/api/incentives/rate-versions"],
      ["POST", "/api/incentives/schedule/preview"],
      ["POST", "/api/incentives/schedule-versions"],
      ["POST", "/api/incentives/initialize-from-legacy"],
      ["POST", "/api/incentives/cycles/manual"],
      ["POST", "/api/incentives/cycles/invalid-id/claim"],
      ["PATCH", "/api/incentives/claims/invalid-id/approve"],
      ["PATCH", "/api/incentives/claims/invalid-id/paid"],
    ];

    for (const [method, path] of protectedMutationRequests) {
      const result = await request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      check(
        result.response.status === 401,
        `${method} ${path} must authenticate before any mutation or validation`
      );
    }

    const ownBranches = await request("/api/branches", { token: branchToken });
    check(ownBranches.response.status === 200, "Branch actor should list the branch directory");
    check(Array.isArray(ownBranches.body?.data), "Branch list should return an array");
    check(
      ownBranches.body.data.length === branchCount,
      "Branch directory should remain available for the authorized stock-request workflow"
    );
    check(
      ownBranches.body.data.some((branch) => branch.id === branchActor.branchId),
      "Branch directory should include the actor's assigned branch"
    );

    const ownBranch = await request(`/api/branches/${branchActor.branchId}`, {
      token: branchToken,
    });
    check(ownBranch.response.status === 200, "Branch actor should read its own branch");

    if (otherBranch) {
      const crossBranch = await request(`/api/branches/${otherBranch.id}`, {
        token: branchToken,
      });
      check(crossBranch.response.status === 200, "Authorized branch directory detail should remain readable");

      const crossBranchInventory = await request(
        `/api/inventory/overview?branchId=${otherBranch.id}`,
        { token: branchToken }
      );
      check(
        crossBranchInventory.response.status === 403,
        "Cross-branch inventory overview must remain denied"
      );
    }

    const allBranches = await request("/api/branches", { token: superToken });
    check(allBranches.response.status === 200, "Super Owner should list branches");
    check(
      allBranches.body?.data?.length === branchCount,
      "Super Owner branch listing should remain global"
    );

    const invalidBranchFilter = await request("/api/branches?status=INVALID", {
      token: branchToken,
    });
    check(invalidBranchFilter.response.status === 400, "Invalid branch status must be rejected");

    const settings = await request("/api/settings", { token: managerToken });
    check(settings.response.status === 200, "Branch manager should read accessible settings");
    const globalSetting = settings.body?.data?.find((setting) => !setting.branchId);
    if (globalSetting) {
      const forbiddenGlobalUpdate = await request(
        `/api/settings/scope/${encodeURIComponent(globalSetting.scopeKey)}`,
        {
          method: "PATCH",
          token: managerToken,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: globalSetting.label }),
        }
      );
      check(
        forbiddenGlobalUpdate.response.status === 403,
        "Branch manager cannot mutate a global business setting"
      );
    } else {
      check(true, "Global business setting mutation check skipped because no setting exists");
    }
    if (otherManagerBranch) {
      const crossBranchSettings = await request(
        `/api/settings?branchId=${otherManagerBranch.id}`,
        { token: managerToken }
      );
      check(
        crossBranchSettings.response.status === 403,
        "Cross-branch settings filter must be denied"
      );
    }

    const invalidQuotationFilter = await request("/api/quotations?status=INVALID", {
      token: branchToken,
    });
    check(invalidQuotationFilter.response.status === 400, "Invalid quotation status must be rejected");

    const invalidSaleFilter = await request("/api/sales?status=INVALID", {
      token: branchToken,
    });
    check(invalidSaleFilter.response.status === 400, "Invalid sale status must be rejected");

    const me = await request("/api/auth/me", { token: branchToken });
    check(me.response.status === 200, "Valid token should authenticate");
    check(!JSON.stringify(me.body).includes("passwordHash"), "Auth response must not leak passwordHash");

    const lowerCaseBearer = await request("/api/auth/me", {
      headers: { Authorization: `bearer ${branchToken}` },
    });
    check(lowerCaseBearer.response.status === 200, "Bearer scheme should be case-insensitive");

    const malformedBearer = await request("/api/auth/me", {
      headers: { Authorization: `Bearer ${branchToken} trailing-data` },
    });
    check(malformedBearer.response.status === 401, "Malformed bearer header must be rejected");

    const users = await request("/api/users?limit=5", { token: superToken });
    check(users.response.status === 200, "Super Owner should list users");
    check(!JSON.stringify(users.body).includes("passwordHash"), "User list must not leak passwordHash");

    const oversizedLogin = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "x".repeat(255), password: "invalid-password" }),
    });
    check(oversizedLogin.response.status === 400, "Oversized login input must be rejected");

    let lastFailedLogin;
    for (let attempt = 1; attempt <= 21; attempt += 1) {
      lastFailedLogin = await request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "security-audit-user-that-does-not-exist",
          password: "invalid-password",
        }),
      });

      if (attempt <= 20) {
        check(lastFailedLogin.response.status === 401, `Failed login ${attempt} should be unauthorized`);
      }
    }
    check(lastFailedLogin.response.status === 429, "Repeated failed logins must be rate limited");
    check(Boolean(lastFailedLogin.response.headers.get("retry-after")), "Rate limit should return Retry-After");

    const deniedOrigin = await request("/", {
      headers: { Origin: "https://untrusted.invalid" },
    });
    check(deniedOrigin.response.status === 403, "Untrusted browser origin must be rejected");

    console.log(`Security route regression passed: ${passed} assertions`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
