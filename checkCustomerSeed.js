require("./src/config/env");
const prisma = require("./src/config/prisma");

async function main() {
  const customers = await prisma.customer.findMany({
    select: {
      customerCode: true,
      fullName: true,
      mobileNumber: true,
      email: true,
      companyName: true,
      status: true,
      branch: {
        select: {
          code: true,
          name: true,
        },
      },
      createdBy: {
        select: {
          username: true,
          role: true,
        },
      },
      updatedBy: {
        select: {
          username: true,
          role: true,
        },
      },
    },
    orderBy: [
      {
        branch: {
          code: "asc",
        },
      },
      {
        customerCode: "asc",
      },
    ],
  });

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
  console.log("Customer seed check");
  console.log("-------------------");
  console.log("Total customers:", customers.length);
  console.log("");

  console.log("Customers:");
  console.table(
    customers.map((customer) => ({
      branch: customer.branch.code,
      customerCode: customer.customerCode,
      fullName: customer.fullName,
      mobileNumber: customer.mobileNumber,
      email: customer.email,
      companyName: customer.companyName,
      status: customer.status,
      createdBy: customer.createdBy ? customer.createdBy.username : null,
      updatedBy: customer.updatedBy ? customer.updatedBy.username : null,
    }))
  );

  console.log("");
  console.log("Branch customer counts:");
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
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
