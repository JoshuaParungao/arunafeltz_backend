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

const createWarrantyClaim = async (token, customerId, itemId, issueDescription) => {
  const result = await request("/warranty-claims", {
    method: "POST",
    token,
    body: JSON.stringify({
      customerId,
      itemId,
      issueDescription,
    }),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Warranty IN claim created");

  return result.body.data;
};

const updateStatus = async (token, id, body) => {
  return request(`/warranty-claims/${id}/status`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
};

const main = async () => {
  console.log("\nPHASE 12 MODULE 12C: Warranty Status Flow Test");
  console.log("----------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.warrantyClaim.deleteMany({
    where: {
      branchId,
    },
  });

  assert(true, "Previous warranty status test data cleared");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const item = await prisma.item.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(item), "Active item found");

  const missingTokenClaim = await createWarrantyClaim(
    adminLogin.token,
    customer.id,
    item.id,
    "12C missing token update test"
  );

  const missingToken = await updateStatus(null, missingTokenClaim.id, {
    status: "CHECKING",
  });

  assert(missingToken.status === 401, "Update status blocks missing token");

  const invalidStatus = await updateStatus(adminLogin.token, missingTokenClaim.id, {
    status: "BAD_STATUS",
  });

  assert(invalidStatus.status === 400, "Invalid status value is blocked by validation");

  const directOut = await updateStatus(adminLogin.token, missingTokenClaim.id, {
    status: "OUT",
  });

  assert(directOut.status === 400, "IN cannot go directly to OUT");

  const mainClaim = await createWarrantyClaim(
    adminLogin.token,
    customer.id,
    item.id,
    "12C main warranty flow"
  );

  const checking = await updateStatus(techLogin.token, mainClaim.id, {
    status: "CHECKING",
    diagnosis: "Initial checking started",
    remarks: "Technician checking",
  });

  if (checking.status !== 200) {
    console.dir(checking.body, { depth: null });
  }

  assert(checking.status === 200, "Technician can update IN to CHECKING");
  assert(checking.body.data.status === "CHECKING", "Status becomes CHECKING");
  assert(Boolean(checking.body.data.checkingAt), "checkingAt saved");
  assert(checking.body.data.diagnosis === "Initial checking started", "Diagnosis saved");
  assert(checking.body.data.statusUpdatedBy.id === techLogin.user.id, "statusUpdatedBy is technician");

  const sentToSupplier = await updateStatus(adminLogin.token, mainClaim.id, {
    status: "SENT_TO_SUPPLIER",
    supplierName: "Test Supplier",
    supplierReferenceNo: "SUP-12C-001",
    remarks: "Sent to supplier for checking",
  });

  assert(sentToSupplier.status === 200, "Admin can update CHECKING to SENT_TO_SUPPLIER");
  assert(sentToSupplier.body.data.status === "SENT_TO_SUPPLIER", "Status becomes SENT_TO_SUPPLIER");
  assert(Boolean(sentToSupplier.body.data.sentToSupplierAt), "sentToSupplierAt saved");
  assert(sentToSupplier.body.data.supplierName === "Test Supplier", "Supplier name saved");
  assert(sentToSupplier.body.data.supplierReferenceNo === "SUP-12C-001", "Supplier reference saved");

  const approved = await updateStatus(adminLogin.token, mainClaim.id, {
    status: "APPROVED",
    actionTaken: "Supplier approved warranty",
  });

  assert(approved.status === 200, "Admin can update SENT_TO_SUPPLIER to APPROVED");
  assert(approved.body.data.status === "APPROVED", "Status becomes APPROVED");
  assert(Boolean(approved.body.data.approvedAt), "approvedAt saved");
  assert(approved.body.data.actionTaken === "Supplier approved warranty", "Action taken saved");

  const repaired = await updateStatus(techLogin.token, mainClaim.id, {
    status: "REPAIRED",
    actionTaken: "Unit repaired",
  });

  assert(repaired.status === 200, "Technician can update APPROVED to REPAIRED");
  assert(repaired.body.data.status === "REPAIRED", "Status becomes REPAIRED");
  assert(Boolean(repaired.body.data.repairedAt), "repairedAt saved");

  const out = await updateStatus(adminLogin.token, mainClaim.id, {
    status: "OUT",
    remarks: "Released to customer",
  });

  assert(out.status === 200, "Admin can update REPAIRED to OUT");
  assert(out.body.data.status === "OUT", "Status becomes OUT");
  assert(Boolean(out.body.data.releasedAt), "releasedAt saved");
  assert(out.body.data.releasedBy.id === adminLogin.user.id, "releasedBy is actor");

  const updateAfterOut = await updateStatus(adminLogin.token, mainClaim.id, {
    status: "CHECKING",
  });

  assert(updateAfterOut.status === 400, "OUT warranty cannot be updated again");

  const rejectedClaim = await createWarrantyClaim(
    adminLogin.token,
    customer.id,
    item.id,
    "12C rejected warranty flow"
  );

  const rejectedChecking = await updateStatus(adminLogin.token, rejectedClaim.id, {
    status: "CHECKING",
  });

  assert(rejectedChecking.status === 200, "Rejected flow moved to CHECKING");

  const rejected = await updateStatus(adminLogin.token, rejectedClaim.id, {
    status: "REJECTED",
    diagnosis: "Warranty void",
  });

  assert(rejected.status === 200, "Admin can update CHECKING to REJECTED");
  assert(rejected.body.data.status === "REJECTED", "Status becomes REJECTED");
  assert(Boolean(rejected.body.data.rejectedAt), "rejectedAt saved");

  const rejectedOut = await updateStatus(adminLogin.token, rejectedClaim.id, {
    status: "OUT",
  });

  assert(rejectedOut.status === 200, "REJECTED can move to OUT");

  const replacedClaim = await createWarrantyClaim(
    adminLogin.token,
    customer.id,
    item.id,
    "12C replaced warranty flow"
  );

  const replacedChecking = await updateStatus(adminLogin.token, replacedClaim.id, {
    status: "CHECKING",
  });

  assert(replacedChecking.status === 200, "Replaced flow moved to CHECKING");

  const replacedSentToSupplier = await updateStatus(adminLogin.token, replacedClaim.id, {
    status: "SENT_TO_SUPPLIER",
    supplierName: "Replacement Supplier",
    supplierReferenceNo: "REP-12C-001",
  });

  assert(replacedSentToSupplier.status === 200, "Replaced flow moved to SENT_TO_SUPPLIER");

  const replaced = await updateStatus(adminLogin.token, replacedClaim.id, {
    status: "REPLACED",
    actionTaken: "Unit replaced",
  });

  assert(replaced.status === 200, "SENT_TO_SUPPLIER can move to REPLACED");
  assert(replaced.body.data.status === "REPLACED", "Status becomes REPLACED");
  assert(Boolean(replaced.body.data.replacedAt), "replacedAt saved");

  const replacedOut = await updateStatus(adminLogin.token, replacedClaim.id, {
    status: "OUT",
  });

  assert(replacedOut.status === 200, "REPLACED can move to OUT");

  const missingClaim = await updateStatus(adminLogin.token, "not-existing-warranty-claim-id", {
    status: "CHECKING",
  });

  assert(missingClaim.status === 404, "Missing warranty claim returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 12 MODULE 12C WARRANTY STATUS FLOW TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 12 MODULE 12C WARRANTY STATUS FLOW TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
