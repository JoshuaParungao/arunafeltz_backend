require("dotenv").config();

const prisma = require("./src/config/prisma");

const BASE_URL = "http://localhost:5000/api";

const users = {
  superOwner: {
    identifier: "superowner",
    password: "Password123!",
  },
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
  console.log("\nPHASE 14 MODULE 14B: Audit Logs API Test");
  console.log("----------------------------------------");

  const superLogin = await login(users.superOwner);
  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const mainBranchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  const mabBranch = await prisma.branch.findFirst({
    where: {
      code: "MAB",
      status: "ACTIVE",
    },
  });

  assert(Boolean(mainBranchId), "MAIN branch detected");
  assert(Boolean(mabBranch), "MAB branch detected");

  await prisma.auditLog.deleteMany({
    where: {
      action: {
        startsWith: "FINAL14B_",
      },
    },
  });

  assert(true, "Previous 14B audit log test data cleared");

  const mainAuditLog = await prisma.auditLog.create({
    data: {
      actorId: adminLogin.user.id,
      branchId: mainBranchId,
      action: "FINAL14B_MAIN_ACTION",
      entityType: "FINAL14B_ENTITY",
      entityId: "FINAL14B-MAIN-ENTITY-001",
      description: "Phase 14B MAIN audit log test",
      metadata: {
        test: true,
        branch: "MAIN",
      },
      ipAddress: "127.0.0.1",
      userAgent: "Phase14BTest",
    },
  });

  const mabAuditLog = await prisma.auditLog.create({
    data: {
      actorId: superLogin.user.id,
      branchId: mabBranch.id,
      action: "FINAL14B_MAB_ACTION",
      entityType: "FINAL14B_ENTITY",
      entityId: "FINAL14B-MAB-ENTITY-001",
      description: "Phase 14B MAB audit log test",
      metadata: {
        test: true,
        branch: "MAB",
      },
      ipAddress: "127.0.0.1",
      userAgent: "Phase14BTest",
    },
  });

  const globalAuditLog = await prisma.auditLog.create({
    data: {
      actorId: superLogin.user.id,
      branchId: null,
      action: "FINAL14B_GLOBAL_ACTION",
      entityType: "FINAL14B_GLOBAL_ENTITY",
      entityId: "FINAL14B-GLOBAL-ENTITY-001",
      description: "Phase 14B global audit log test",
      metadata: {
        test: true,
        branch: null,
      },
      ipAddress: "127.0.0.1",
      userAgent: "Phase14BTest",
    },
  });

  assert(Boolean(mainAuditLog.id), "MAIN audit log test record created");
  assert(Boolean(mabAuditLog.id), "MAB audit log test record created");
  assert(Boolean(globalAuditLog.id), "Global audit log test record created");

  const technicianList = await request("/audit-logs", {
    token: technicianLogin.token,
  });

  assert(technicianList.status === 403, "Technician is blocked from audit logs");

  const superList = await request("/audit-logs?search=FINAL14B&page=1&limit=10", {
    token: superLogin.token,
  });

  if (superList.status !== 200) {
    console.dir(superList.body, { depth: null });
  }

  assert(superList.status === 200, "SUPER_OWNER can list audit logs");
  assert(Array.isArray(superList.body.data), "SUPER_OWNER list returns array");
  assert(superList.body.data.length >= 3, "SUPER_OWNER can see MAIN, MAB, and global audit logs");
  assert(Boolean(superList.body.meta), "SUPER_OWNER list returns meta");
  assert(superList.body.meta.page === 1, "Pagination page meta saved");
  assert(superList.body.meta.limit === 10, "Pagination limit meta saved");

  const adminList = await request("/audit-logs?search=FINAL14B&page=1&limit=10", {
    token: adminLogin.token,
  });

  if (adminList.status !== 200) {
    console.dir(adminList.body, { depth: null });
  }

  assert(adminList.status === 200, "ADMIN can list audit logs");
  assert(Array.isArray(adminList.body.data), "ADMIN list returns array");
  assert(adminList.body.data.some((log) => log.id === mainAuditLog.id), "ADMIN can see own branch audit log");
  assert(!adminList.body.data.some((log) => log.id === mabAuditLog.id), "ADMIN cannot see MAB audit log in list");
  assert(!adminList.body.data.some((log) => log.id === globalAuditLog.id), "ADMIN cannot see global audit log in list");

  const superGetMain = await request(`/audit-logs/${mainAuditLog.id}`, {
    token: superLogin.token,
  });

  assert(superGetMain.status === 200, "SUPER_OWNER can view MAIN audit log by ID");
  assert(superGetMain.body.data.id === mainAuditLog.id, "SUPER_OWNER gets correct audit log ID");

  const superGetMab = await request(`/audit-logs/${mabAuditLog.id}`, {
    token: superLogin.token,
  });

  assert(superGetMab.status === 200, "SUPER_OWNER can view MAB audit log by ID");

  const superGetGlobal = await request(`/audit-logs/${globalAuditLog.id}`, {
    token: superLogin.token,
  });

  assert(superGetGlobal.status === 200, "SUPER_OWNER can view global audit log by ID");

  const adminGetMain = await request(`/audit-logs/${mainAuditLog.id}`, {
    token: adminLogin.token,
  });

  assert(adminGetMain.status === 200, "ADMIN can view own branch audit log by ID");
  assert(adminGetMain.body.data.id === mainAuditLog.id, "ADMIN gets correct own branch audit log ID");

  const adminGetMab = await request(`/audit-logs/${mabAuditLog.id}`, {
    token: adminLogin.token,
  });

  assert(adminGetMab.status === 403, "ADMIN blocked from MAB audit log by ID");

  const adminGetGlobal = await request(`/audit-logs/${globalAuditLog.id}`, {
    token: adminLogin.token,
  });

  assert(adminGetGlobal.status === 403, "ADMIN blocked from global audit log by ID");

  const adminBranchMismatch = await request(`/audit-logs?branchId=${mabBranch.id}`, {
    token: adminLogin.token,
  });

  assert(adminBranchMismatch.status === 403, "ADMIN blocked from querying other branch audit logs");

  const superFilterByAction = await request("/audit-logs?action=FINAL14B_MAIN_ACTION", {
    token: superLogin.token,
  });

  assert(superFilterByAction.status === 200, "SUPER_OWNER can filter by action");
  assert(
    superFilterByAction.body.data.some((log) => log.id === mainAuditLog.id),
    "Action filter returns matching audit log"
  );

  const superFilterByEntityType = await request("/audit-logs?entityType=FINAL14B_ENTITY", {
    token: superLogin.token,
  });

  assert(superFilterByEntityType.status === 200, "SUPER_OWNER can filter by entityType");
  assert(superFilterByEntityType.body.data.length >= 2, "Entity type filter returns matching audit logs");

  const superFilterByEntityId = await request("/audit-logs?entityId=FINAL14B-MAIN-ENTITY-001", {
    token: superLogin.token,
  });

  assert(superFilterByEntityId.status === 200, "SUPER_OWNER can filter by entityId");
  assert(superFilterByEntityId.body.data.some((log) => log.id === mainAuditLog.id), "Entity ID filter returns matching audit log");

  const invalidId = await request("/audit-logs/not-existing-audit-log-id", {
    token: superLogin.token,
  });

  assert(invalidId.status === 404, "Missing audit log returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14 MODULE 14B AUDIT LOGS API TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14 MODULE 14B AUDIT LOGS API TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
