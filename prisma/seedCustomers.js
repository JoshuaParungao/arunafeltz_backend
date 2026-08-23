require("../src/config/env");
const prisma = require("../src/config/prisma");

async function getRequiredBranchByCode(code) {
  const branch = await prisma.branch.findFirst({
    where: {
      code,
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  });

  if (!branch) {
    throw new Error(`Required branch not found: ${code}`);
  }

  if (branch.status !== "ACTIVE") {
    throw new Error(`Required branch is not active: ${code}`);
  }

  return branch;
}

async function getRequiredUserByUsername(username) {
  const user = await prisma.user.findFirst({
    where: {
      username,
    },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      status: true,
    },
  });

  if (!user) {
    throw new Error(`Required user not found: ${username}`);
  }

  if (user.status !== "ACTIVE") {
    throw new Error(`Required user is not active: ${username}`);
  }

  return user;
}

async function upsertCustomer(customer) {
  return prisma.customer.upsert({
    where: {
      branchId_customerCode: {
        branchId: customer.branchId,
        customerCode: customer.customerCode,
      },
    },
    update: {
      fullName: customer.fullName,
      mobileNumber: customer.mobileNumber,
      email: customer.email,
      address: customer.address,
      companyName: customer.companyName,
      notes: customer.notes,
      status: customer.status,
      updatedById: customer.updatedById,
    },
    create: customer,
    select: {
      id: true,
      customerCode: true,
      fullName: true,
      mobileNumber: true,
      email: true,
      status: true,
      branch: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });
}

async function main() {
  const mainBranch = await getRequiredBranchByCode("MAIN");
  const mabBranch = await getRequiredBranchByCode("MAB");
  const superOwner = await getRequiredUserByUsername("superowner");
  const mainAdmin = await getRequiredUserByUsername("mainadmin");

  const customers = [
    {
      customerCode: "CUST-MAIN-001",
      fullName: "Juan Dela Cruz",
      mobileNumber: "09171234567",
      email: "juan.delacruz@example.com",
      address: "San Fernando, Pampanga",
      companyName: null,
      notes: "Sample walk-in customer for MAIN branch.",
      status: "ACTIVE",
      branchId: mainBranch.id,
      createdById: mainAdmin.id,
      updatedById: mainAdmin.id,
    },
    {
      customerCode: "CUST-MAIN-002",
      fullName: "Maria Santos",
      mobileNumber: "09181234567",
      email: "maria.santos@example.com",
      address: "Mexico, Pampanga",
      companyName: null,
      notes: "Sample returning customer for MAIN branch.",
      status: "ACTIVE",
      branchId: mainBranch.id,
      createdById: mainAdmin.id,
      updatedById: mainAdmin.id,
    },
    {
      customerCode: "CUST-MAIN-003",
      fullName: "Carlos Reyes",
      mobileNumber: "09191234567",
      email: null,
      address: "Angeles City, Pampanga",
      companyName: "Reyes Computer Services",
      notes: "Sample business customer for MAIN branch.",
      status: "ACTIVE",
      branchId: mainBranch.id,
      createdById: mainAdmin.id,
      updatedById: mainAdmin.id,
    },
    {
      customerCode: "CUST-MAB-001",
      fullName: "Ana Garcia",
      mobileNumber: "09201234567",
      email: "ana.garcia@example.com",
      address: "Mabalacat City, Pampanga",
      companyName: null,
      notes: "Sample walk-in customer for MAB branch.",
      status: "ACTIVE",
      branchId: mabBranch.id,
      createdById: superOwner.id,
      updatedById: superOwner.id,
    },
    {
      customerCode: "CUST-MAB-002",
      fullName: "Roberto Cruz",
      mobileNumber: "09211234567",
      email: null,
      address: "Dau, Mabalacat City",
      companyName: "Cruz IT Repair",
      notes: "Sample business customer for MAB branch.",
      status: "ACTIVE",
      branchId: mabBranch.id,
      createdById: superOwner.id,
      updatedById: superOwner.id,
    },
  ];

  console.log("");
  console.log("Seeding customers...");
  console.log("--------------------");

  for (const customer of customers) {
    const savedCustomer = await upsertCustomer(customer);

    console.log(
      `${savedCustomer.branch.code} | ${savedCustomer.customerCode} | ${savedCustomer.fullName} | ${savedCustomer.status}`
    );
  }

  const totalCustomers = await prisma.customer.count();

  const branchCounts = await prisma.branch.findMany({
    select: {
      code: true,
      name: true,
      _count: {
        select: {
          customers: true,
        },
      },
    },
    orderBy: {
      code: "asc",
    },
  });

  console.log("");
  console.log("Customer seed completed.");
  console.log("Total customers:", totalCustomers);
  console.log("");

  console.table(
    branchCounts.map((branch) => ({
      branchCode: branch.code,
      branchName: branch.name,
      customerCount: branch._count.customers,
    }))
  );
}

main()
  .catch((error) => {
    console.error("Customer seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
