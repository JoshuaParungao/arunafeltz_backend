const fs = require("fs");

const filePath = "./src/modules/sales/routes/sale.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("saleController.getSales")) {
  console.log("SKIP: sale list/view routes already exist.");
  process.exit(0);
}

const routesToAdd = `
router.get(
  "/",
  requirePermission(PERMISSIONS.VIEW_SALES),
  saleController.getSales
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.VIEW_SALES),
  saleController.getSaleById
);

`;

content = content.replace(
  "router.post(",
  `${routesToAdd}router.post(`
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.routes.js patched with list/view routes.");
