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
  const result = await request("/service-jobs", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });

  if (result.status !== 201) {
    console.dir(result.body, { depth: null });
  }

  assert(result.status === 201, "Service job created");

  return result.body.data;
};

const getServiceJobs = async ({ token, query = "" }) => {
  return request(`/service-jobs${query}`, {
    method: "GET",
    token,
  });
};

const getServiceJobById = async ({ token, id }) => {
  return request(`/service-jobs/${id}`, {
    method: "GET",
    token,
  });
};

const main = async () => {
  console.log("\nPHASE 11 MODULE 11D: List / View Service Jobs Test");
  console.log("--------------------------------------------------");

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

  assert(true, "Previous service job list/view test data cleared");

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

  const firstJob = await createServiceJob({
    token: adminLogin.token,
    body: {
      customerId: customer.id,
      assignedTechnicianId: technician.id,
      jobTitle: "Phase 11D Laptop Screen Repair",
      deviceDescription: "Lenovo laptop LCD panel",
      problemDescription: "Broken screen",
      estimatedServiceCharge: 900,
    },
  });

  const secondJob = await createServiceJob({
    token: adminLogin.token,
    body: {
      customerId: customer.id,
      jobTitle: "Phase 11D Desktop Cleaning",
      deviceDescription: "Gaming desktop unit",
      problemDescription: "Dust cleaning and repaste",
      estimatedServiceCharge: 650,
    },
  });

  const noTokenList = await getServiceJobs({
    token: null,
  });

  assert([401, 403].includes(noTokenList.status), "List service jobs blocks missing token");

  const adminList = await getServiceJobs({
    token: adminLogin.token,
  });

  if (adminList.status !== 200) {
    console.dir(adminList.body, { depth: null });
  }

  assert(adminList.status === 200, "Admin can list service jobs");
  assert(Array.isArray(adminList.body.data), "List data is array");
  assert(adminList.body.data.length >= 2, "List includes created service jobs");
  assert(Number.isInteger(adminList.body.meta.total), "List includes meta total");

  const listedIds = adminList.body.data.map((job) => job.id);

  assert(listedIds.includes(firstJob.id), "List includes first created job");
  assert(listedIds.includes(secondJob.id), "List includes second created job");

  const statusFilter = await getServiceJobs({
    token: adminLogin.token,
    query: "?status=PENDING",
  });

  assert(statusFilter.status === 200, "Status filter works");
  assert(statusFilter.body.data.every((job) => job.status === "PENDING"), "Status filter returns PENDING only");

  const customerFilter = await getServiceJobs({
    token: adminLogin.token,
    query: `?customerId=${customer.id}`,
  });

  assert(customerFilter.status === 200, "Customer filter works");
  assert(customerFilter.body.data.every((job) => job.customer?.id === customer.id), "Customer filter returns selected customer only");

  const technicianFilter = await getServiceJobs({
    token: adminLogin.token,
    query: `?assignedTechnicianId=${technician.id}`,
  });

  assert(technicianFilter.status === 200, "Assigned technician filter works");
  assert(technicianFilter.body.data.some((job) => job.id === firstJob.id), "Assigned technician filter includes assigned job");

  const searchJobCode = await getServiceJobs({
    token: adminLogin.token,
    query: `?search=${encodeURIComponent(firstJob.jobCode)}`,
  });

  assert(searchJobCode.status === 200, "Search by job code works");
  assert(searchJobCode.body.data.some((job) => job.id === firstJob.id), "Search by job code finds first job");

  const searchTitle = await getServiceJobs({
    token: adminLogin.token,
    query: "?search=Desktop%20Cleaning",
  });

  assert(searchTitle.status === 200, "Search by title works");
  assert(searchTitle.body.data.some((job) => job.id === secondJob.id), "Search by title finds second job");

  const searchDevice = await getServiceJobs({
    token: adminLogin.token,
    query: "?search=Lenovo",
  });

  assert(searchDevice.status === 200, "Search by device description works");
  assert(searchDevice.body.data.some((job) => job.id === firstJob.id), "Search by device description finds first job");

  const dateFilter = await getServiceJobs({
    token: adminLogin.token,
    query: "?dateFrom=2020-01-01&dateTo=2099-12-31",
  });

  assert(dateFilter.status === 200, "Date filter works");
  assert(dateFilter.body.data.some((job) => job.id === firstJob.id), "Date filter includes first job");

  const pageLimit = await getServiceJobs({
    token: adminLogin.token,
    query: "?page=1&limit=1",
  });

  assert(pageLimit.status === 200, "Pagination works");
  assert(pageLimit.body.data.length === 1, "Pagination limit respected");
  assert(pageLimit.body.meta.limit === 1, "Pagination meta limit saved");

  const adminView = await getServiceJobById({
    token: adminLogin.token,
    id: firstJob.id,
  });

  if (adminView.status !== 200) {
    console.dir(adminView.body, { depth: null });
  }

  assert(adminView.status === 200, "Admin can view service job detail");
  assert(adminView.body.data.id === firstJob.id, "View returns correct service job");
  assert(adminView.body.data.branch.id === branchId, "View includes branch");
  assert(adminView.body.data.customer.id === customer.id, "View includes customer");
  assert(adminView.body.data.assignedTechnician.id === technician.id, "View includes assigned technician");

  const techList = await getServiceJobs({
    token: techLogin.token,
  });

  assert(techList.status === 200, "Technician can list own branch service jobs");
  assert(techList.body.data.every((job) => job.branch.id === branchId), "Technician list is branch-scoped");

  const techView = await getServiceJobById({
    token: techLogin.token,
    id: firstJob.id,
  });

  assert(techView.status === 200, "Technician can view own branch service job");

  const superList = await getServiceJobs({
    token: superLogin.token,
    query: `?branchId=${branchId}`,
  });

  assert(superList.status === 200, "Super Owner can list service jobs with branch filter");
  assert(superList.body.data.some((job) => job.id === firstJob.id), "Super Owner branch filter includes first job");

  const missingView = await getServiceJobById({
    token: adminLogin.token,
    id: "not-existing-service-job-id",
  });

  assert(missingView.status === 404, "Missing service job view returns 404");

  const health = await request("/health");

  assert(health.status === 200, "Health endpoint returns 200");
  assert(health.body.data.status === "healthy", "Backend status is healthy");

  console.log("\nPHASE 11 MODULE 11D LIST / VIEW SERVICE JOBS TEST PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 11 MODULE 11D LIST / VIEW SERVICE JOBS TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
