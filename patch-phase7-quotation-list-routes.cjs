const fs = require("fs");

const filePath = "./src/modules/quotations/routes/quotation.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes('router.get("/:id"')) {
  console.log("SKIP: quotation list/view routes already exist.");
  process.exit(0);
}

const routesToAdd = `
router.get(
  "/",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  quotationController.getQuotations
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS.VIEW_QUOTATIONS),
  quotationController.getQuotationById
);

`;

content = content.replace(
  "router.post(",
  `${routesToAdd}router.post(`
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.routes.js patched with list/view routes.");
