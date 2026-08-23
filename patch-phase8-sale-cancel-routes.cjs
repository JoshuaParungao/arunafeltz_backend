const fs = require("fs");

const filePath = "./src/modules/sales/routes/sale.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes('router.patch(\n  "/:id/cancel"')) {
  console.log("SKIP: cancel sale route already exists.");
  process.exit(0);
}

content = content.replace(
  'const { createSaleSchema } = require("../validations/sale.validation");',
  'const { createSaleSchema, cancelSaleSchema } = require("../validations/sale.validation");'
);

const routeToAdd = `
router.patch(
  "/:id/cancel",
  requirePermission(PERMISSIONS.MANAGE_SALES),
  validate(cancelSaleSchema),
  saleController.cancelSale
);

`;

content = content.replace(
  "router.post(",
  `${routeToAdd}router.post(`
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.routes.js patched with cancel route.");
