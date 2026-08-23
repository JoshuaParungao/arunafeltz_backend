const fs = require("fs");

const filePath = "./src/routes/api.routes.js";

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("creditAccountRoutes")) {
  console.log("SKIP: credit accounts route already registered.");
  process.exit(0);
}

content = content.replace(
  `const saleRoutes = require("../modules/sales/routes/sale.routes");`,
  `const saleRoutes = require("../modules/sales/routes/sale.routes");
const creditAccountRoutes = require("../modules/credit-accounts/routes/creditAccount.routes");`
);

content = content.replace(
  `router.use("/sales", saleRoutes);`,
  `router.use("/sales", saleRoutes);
router.use("/credit-accounts", creditAccountRoutes);`
);

fs.writeFileSync(filePath, content);

console.log("DONE: credit accounts route registered.");
