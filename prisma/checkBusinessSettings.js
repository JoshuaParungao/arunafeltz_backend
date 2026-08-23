require("../src/config/env");

const prisma = require("../src/config/prisma");

async function main() {
  const rows = await prisma.businessSetting.findMany({
    select: {
      scopeKey: true,
      category: true,
      valueType: true,
      value: true,
    },
    orderBy: {
      scopeKey: "asc",
    },
  });

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
