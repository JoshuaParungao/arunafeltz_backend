const fs = require("fs");

const filePath = "./src/modules/sales/routes/sale.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("/:id/credit-account")) {
  console.log("SKIP: credit-account route already exists.");
  process.exit(0);
}

content = content.replace(
  `const { createSaleSchema, cancelSaleSchema } = require("../validations/sale.validation");
`,
  `const {
  createSaleSchema,
  cancelSaleSchema,
  createCreditAccountSchema,
} = require("../validations/sale.validation");
`
);

content = content.replace(
  `router.patch(
  "/:id/cancel",
`,
  `router.post(
  "/:id/credit-account",
  requirePermission(PERMISSIONS.MANAGE_SALES),
  validate(createCreditAccountSchema),
  saleController.createCreditAccountFromSale
);

router.patch(
  "/:id/cancel",
`
);

fs.writeFileSync(filePath, content);

console.log("DONE: sale.routes.js patched for credit account route.");
