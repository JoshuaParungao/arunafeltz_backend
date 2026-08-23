require("dotenv").config();

const prisma = require("./src/config/prisma");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS: ${message}`);
};

const main = async () => {
  console.log("PHASE 11 MODULE 11A: SERVICE JOB DB CHECK");
  console.log("------------------------------------------");

  assert(typeof prisma.serviceJob === "object", "Prisma serviceJob model is available");

  const count = await prisma.serviceJob.count();

  assert(Number.isInteger(count), "ServiceJob count works");

  const branches = await prisma.branch.findMany({
    include: {
      serviceJobs: true,
    },
    orderBy: {
      code: "asc",
    },
  });

  assert(branches.length >= 1, "Branches found");

  for (const branch of branches) {
    assert(Array.isArray(branch.serviceJobs), `${branch.code} serviceJobs relation works`);
  }

  const customers = await prisma.customer.findMany({
    take: 1,
    include: {
      serviceJobs: true,
    },
  });

  if (customers.length > 0) {
    assert(Array.isArray(customers[0].serviceJobs), "Customer serviceJobs relation works");
  } else {
    console.log("SKIP: No customer found for customer relation check");
  }

  const users = await prisma.user.findMany({
    take: 1,
    include: {
      assignedServiceJobs: true,
      createdServiceJobs: true,
      updatedServiceJobs: true,
      cancelledServiceJobs: true,
    },
  });

  assert(users.length >= 1, "Users found");
  assert(Array.isArray(users[0].assignedServiceJobs), "User assignedServiceJobs relation works");
  assert(Array.isArray(users[0].createdServiceJobs), "User createdServiceJobs relation works");
  assert(Array.isArray(users[0].updatedServiceJobs), "User updatedServiceJobs relation works");
  assert(Array.isArray(users[0].cancelledServiceJobs), "User cancelledServiceJobs relation works");

  console.log("\nPHASE 11 MODULE 11A SERVICE JOB DB CHECK PASSED");
};

main()
  .catch((error) => {
    console.error("\nPHASE 11 MODULE 11A SERVICE JOB DB CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
