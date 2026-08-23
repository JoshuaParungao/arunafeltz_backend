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
  console.log("\nPHASE 14 MODULE 14C: Supplier Audit Hooks Test");
  console.log("----------------------------------------------");

  const adminLogin = await login(users.admin);
  const technicianLogin = await login(users.technician);

  const mainBranchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(mainBranchId), "MAIN branch detected");

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          action: {
            in: [
              "SUPPLIER_CREATED",
              "SUPPLIER_UPDATED",
              "SUPPLIER_STATUS_UPDATED",
            ],
          },
        },
        {
          entityId: {
            startsWith: "PHASE14C-",
          },
        },
      ],
    },
  });

  await prisma.supplier.deleteMany({
    where: {
      supplierCode: {
        startsWith: "PHASE14C-",
      },
    },
  });

  assert(true, "Previous 14C supplier/audit test data cleared");

  const createSupplier = await request("/suppliers", {
    method: "POST",
    token: adminLogin.token,
    body: JSON.stringify({
      supplierCode: "PHASE14C-SUPPLIER",
      name: "Phase 14C Supplier",
      contactPerson: "Audit Tester",
      contactNo: "09171400001",
      email: "phase14c@supplier.test",
      address: "Phase 14C Address",
      tin: "PHASE14C-TIN",
      notes: "Created for audit hook test",
    }),
  });

  if (createSupplier.status !== 201) {
    console.dir(createSupplier.body, { depth: null });
  }

  assert(createSupplier.status === 201, "Supplier created through API");
  assert(createSupplier.body.data.supplierCode === "PHASE14C-SUPPLIER", "Supplier code saved");

  const supplierId = createSupplier.body.data.id;

  const createAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "SUPPLIER_CREATED",
      entityType: "Supplier",
      entityId: supplierId,
    },
  });

  assert(Boolean(createAuditLog), "SUPPLIER_CREATED audit log created");
  assert(createAuditLog.actorId === adminLogin.user.id, "Create audit actorId saved");
  assert(createAuditLog.branchId === mainBranchId, "Create audit branchId saved");
  assert(createAuditLog.metadata.supplierCode === "PHASE14C-SUPPLIER", "Create audit metadata saved");

  const updateSupplier = await request(`/suppliers/${supplierId}`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      name: "Phase 14C Supplier Updated",
      contactPerson: "Audit Tester Updated",
      notes: "Updated for audit hook test",
    }),
  });

  if (updateSupplier.status !== 200) {
    console.dir(updateSupplier.body, { depth: null });
  }

  assert(updateSupplier.status === 200, "Supplier updated through API");
  assert(updateSupplier.body.data.name === "Phase 14C Supplier Updated", "Supplier update saved");

  const updateAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "SUPPLIER_UPDATED",
      entityType: "Supplier",
      entityId: supplierId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(updateAuditLog), "SUPPLIER_UPDATED audit log created");
  assert(updateAuditLog.actorId === adminLogin.user.id, "Update audit actorId saved");
  assert(updateAuditLog.branchId === mainBranchId, "Update audit branchId saved");
  assert(Array.isArray(updateAuditLog.metadata.changedFields), "Update audit changedFields saved");
  assert(updateAuditLog.metadata.changedFields.includes("name"), "Update audit tracks changed field: name");
  assert(updateAuditLog.metadata.previous.name === "Phase 14C Supplier", "Update audit previous data saved");
  assert(updateAuditLog.metadata.current.name === "Phase 14C Supplier Updated", "Update audit current data saved");

  const statusUpdate = await request(`/suppliers/${supplierId}/status`, {
    method: "PATCH",
    token: adminLogin.token,
    body: JSON.stringify({
      status: "INACTIVE",
    }),
  });

  if (statusUpdate.status !== 200) {
    console.dir(statusUpdate.body, { depth: null });
  }

  assert(statusUpdate.status === 200, "Supplier status updated through API");
  assert(statusUpdate.body.data.status === "INACTIVE", "Supplier status saved as INACTIVE");

  const statusAuditLog = await prisma.auditLog.findFirst({
    where: {
      action: "SUPPLIER_STATUS_UPDATED",
      entityType: "Supplier",
      entityId: supplierId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  assert(Boolean(statusAuditLog), "SUPPLIER_STATUS_UPDATED audit log created");
  assert(statusAuditLog.actorId === adminLogin.user.id, "Status audit actorId saved");
  assert(statusAuditLog.branchId === mainBranchId, "Status audit branchId saved");
  assert(statusAuditLog.metadata.previousStatus === "ACTIVE", "Status audit previousStatus saved");
  assert(statusAuditLog.metadata.currentStatus === "INACTIVE", "Status audit currentStatus saved");

  const auditList = await request("/audit-logs?search=PHASE14C-SUPPLIER&page=1&limit=10", {
    token: adminLogin.token,
  });

  if (auditList.status !== 200) {
    console.dir(auditList.body, { depth: null });
  }

  assert(auditList.status === 200, "Audit logs API can search supplier audit logs");
  assert(
    auditList.body.data.some((log) => log.action === "SUPPLIER_CREATED"),
    "Audit logs API returns supplier created log"
  );
  assert(
    auditList.body.data.some((log) => log.action === "SUPPLIER_UPDATED"),
    "Audit logs API returns supplier updated log"
  );
  assert(
    auditList.body.data.some((log) => log.action === "SUPPLIER_STATUS_UPDATED"),
    "Audit logs API returns supplier status updated log"
  );

  const technicianSupplierCreate = await request("/suppliers", {
    method: "POST",
    token: technicianLogin.token,
    body: JSON.stringify({
      supplierCode: "PHASE14C-TECH-BLOCKED",
      name: "Should Not Create",
    }),
  });

  assert(technicianSupplierCreate.status === 403, "Technician still blocked from supplier create");

  const blockedAuditLog = await prisma.auditLog.findFirst({
    where: {
      entityType: "Supplier",
      metadata: {
        path: ["supplierCode"],
        equals: "PHASE14C-TECH-BLOCKED",
      },
    },
  });

  assert(!blockedAuditLog, "Blocked supplier action did not create supplier audit log");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 14 MODULE 14C SUPPLIER AUDIT HOOKS TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 14 MODULE 14C SUPPLIER AUDIT HOOKS TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
