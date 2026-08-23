require("dotenv").config();

const prisma = require("./src/config/prisma");

const main = async () => {
  console.log("\nCurrent Settings Check");
  console.log("----------------------");

  const modelNames = Object.keys(prisma).filter((key) =>
    key.toLowerCase().includes("setting")
  );

  console.log("Detected Prisma setting models:", modelNames);

  for (const modelName of modelNames) {
    if (typeof prisma[modelName]?.findMany === "function") {
      const rows = await prisma[modelName].findMany({
        take: 50,
        orderBy: {
          createdAt: "asc",
        },
      });

      console.log(`\nModel: ${modelName}`);
      console.log("Count shown:", rows.length);
      console.dir(rows, { depth: null });
    }
  }
};

main()
  .catch((error) => {
    console.error("\nCURRENT SETTINGS CHECK FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
