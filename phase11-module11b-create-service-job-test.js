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
  superOwner: {
    identifier: "superowner",
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

  console.log(`PASS: ${message}`);
};

const login = async (user) => {
  const result = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify(user),
  });

  if (!result.body?.data?.token) {
    console.dir(result.body, { depth: null });
    throw new Error(`Login failed for ${user.identifier}`);
  }

  return {
    token: result.body.data.token,
    user: result.body.data.user,
  };
};

const createServiceJob = async ({ token, body }) => {
  return request("/service-jobs", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
};

const main = async () => {
  console.log("\nPHASE 11 MODULE 11B: Create Service Job Test");
  console.log("--------------------------------------------");

  const adminLogin = await login(users.admin);
  const techLogin = await login(users.technician);
  const superLogin = await login(users.superOwner);

  const branchId = adminLogin.user.branch.id || adminLogin.user.branchId;

  assert(Boolean(branchId), "Admin branch detected");

  await prisma.servicePayment.deleteMany({
    where: {
      branchId,
    },
  });

  await prisma.cashTransaction.deleteMany({
    where: {
      branchId,
      source: "SERVICE_JOB",
    },
  });

  await prisma.serviceJob.deleteMany({
    where: {
      branchId,
    },
  });

  assert(true, "Previous service job test data cleared");

  const customer = await prisma.customer.findFirst({
    where: {
      branchId,
      status: "ACTIVE",
    },
  });

  assert(Boolean(customer), "Active customer found");

  const technician = await prisma.user.findFirst({
    where: {
      branchId,
      role: "TECHNICIAN",
      status: "ACTIVE",
    },
  });

  assert(Boolean(technician), "Active technician found");

  const noToken = await createServiceJob({
    token: null,
    body: {
      jobTitle: "No token service job",
    },
  });

  assert([401, 403].includes(noToken.status), "Create service job blocks missing token");

  const missingTitle = await createServiceJob({
    token: adminLogin.token,
    body: {
      customerId: customer.id,
      estimatedServiceCharge: 500,
    },
  });

  assert(missingTitle.status === 400, "Missing job title is blocked");

  const badCustomer = await createServiceJob({
    token: adminLogin.token,
    body: {
      customerId: "not-existing-customer-id",
      jobTitle: "Bad customer service job",
      estimatedServiceCharge: 500,
    },
  });

  assert(badCustomer.status === 404, "Invalid customer is blocked");

  const badTechnician = await createServiceJob({
    token: adminLogin.token,
    body: {
      jobTitle: "Bad technician service job",
      assignedTechnicianId: "not-existing-technician-id",
      estimatedServiceCharge: 500,
    },
  });

  assert(badTechnician.status === 404, "Invalid assigned technician is blocked");

  const adminCreate = await createServiceJob({
    token: adminLogin.token,
    body: {
      customerId: customer.id,
      assignedTechnicianId: technician.id,
      jobTitle: "Laptop no display repair",
      deviceDescription: "HP Pavilion laptop",
      problemDescription: "No display after power on",
      diagnosis: "For checking",
      serviceNotes: "Created by Phase 11 Module 11B test",
      estimatedServiceCharge: 1500,
    },
  });

  if (adminCreate.status !== 201) {
    console.dir(adminCreate.body, { depth: null });
  }

  assert(adminCreate.status === 201, "Admin can create service job");
  assert(adminCreate.body.data.jobCode.startsWith("SVC-MAIN-"), "Service job code generated");
  assert(adminCreate.body.data.status === "PENDING", "Service job starts as PENDING");
  assert(adminCreate.body.data.jobTitle === "Laptop no display repair", "Job title saved");
  assert(Number(adminCreate.body.data.estimatedServiceCharge) === 1500, "Estimated service charge saved");
  assert(Number(adminCreate.body.data.finalServiceCharge) === 0, "Final service charge starts at zero");
  assert(adminCreate.body.data.branch.id === branchId, "Service job linked to own branch");
  assert(adminCreate.body.data.customer.id === customer.id, "Service job linked to customer");
  assert(adminCreate.body.data.assignedTechnician.id === technician.id, "Service job linked to assigned technician");
  assert(adminCreate.body.data.createdBy.id === adminLogin.user.id, "createdBy is actor");
  assert(adminCreate.body.data.updatedBy.id === adminLogin.user.id, "updatedBy is actor");

  const dbJob = await prisma.serviceJob.findUnique({
    where: {
      id: adminCreate.body.data.id,
    },
  });

  assert(Boolean(dbJob), "Service job saved in database");
  assert(dbJob.status === "PENDING", "Database status is PENDING");

  const techCreate = await createServiceJob({
    token: techLogin.token,
    body: {
      customerId: customer.id,
      jobTitle: "Technician intake test",
      deviceDescription: "Desktop PC",
      problemDescription: "Random restart",
      estimatedServiceCharge: 800,
    },
  });

  if (techCreate.status !== 201) {
    console.dir(techCreate.body, { depth: null });
  }

  assert(techCreate.status === 201, "Technician can create own branch service job");
  assert(techCreate.body.data.branch.id === branchId, "Technician-created job is own branch");

  const superWithoutBranch = await createServiceJob({
    token: superLogin.token,
    body: {
      jobTitle: "Super owner without branch test",
      estimatedServiceCharge: 500,
    },
  });

  assert(superWithoutBranch.status === 400, "Super Owner must provide branchId");

  const superCreate = await createServiceJob({
    token: superLogin.token,
    body: {
      branchId,
      customerId: customer.id,
      jobTitle: "Super owner service job test",
      estimatedServiceCharge: 1200,
    },
  });

  if (superCreate.status !== 201) {
    console.dir(superCreate.body, { depth: null });
  }

  assert(superCreate.status === 201, "Super Owner can create service job with branchId");
  assert(superCreate.body.data.branch.id === branchId, "Super Owner job linked to requested branch");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 11 MODULE 11B CREATE SERVICE JOB TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 11 MODULE 11B CREATE SERVICE JOB TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
