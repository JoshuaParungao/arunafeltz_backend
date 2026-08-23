require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  const users = await prisma.user.findMany({
    orderBy: {
      username: "asc",
    },
    select: {
      username: true,
      email: true,
      role: true,
      status: true,
      branch: {
        select: {
          code: true,
          name: true,
        },
      },
      disabledAt: true,
      lastLoginAt: true,
    },
  });

  console.table(
    users.map((user) => ({
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      branch: user.branch ? user.branch.code : null,
      disabledAt: user.disabledAt,
      lastLoginAt: user.lastLoginAt,
    }))
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
