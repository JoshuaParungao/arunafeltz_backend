const fs = require("fs");

const filePath = "./src/routes/api.routes.js";

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("cashBoxRoutes")) {
  console.log("SKIP: cash box route already registered.");
  process.exit(0);
}

content = content.replace(
  `const creditAccountRoutes = require("../modules/credit-accounts/routes/creditAccount.routes");`,
  `const creditAccountRoutes = require("../modules/credit-accounts/routes/creditAccount.routes");
const cashBoxRoutes = require("../modules/cash-boxes/routes/cashBox.routes");`
);

content = content.replace(
  `router.use("/credit-accounts", creditAccountRoutes);`,
  `router.use("/credit-accounts", creditAccountRoutes);
router.use("/cash-boxes", cashBoxRoutes);`
);

fs.writeFileSync(filePath, content);

console.log("DONE: cash box routes registered.");
