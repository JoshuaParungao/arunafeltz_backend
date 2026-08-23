const fs = require("fs");

const filePath = "./src/modules/quotations/routes/quotation.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes('router.patch("/:id/status"')) {
  console.log("SKIP: quotation status route already exists.");
  process.exit(0);
}

content = content.replace(
  'const { createQuotationSchema, updateQuotationSchema } = require("../validations/quotation.validation");',
  'const { createQuotationSchema, updateQuotationSchema, updateQuotationStatusSchema } = require("../validations/quotation.validation");'
);

const routeToAdd = `
router.patch(
  "/:id/status",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(updateQuotationStatusSchema),
  quotationController.updateQuotationStatus
);

`;

content = content.replace(
  'router.patch(\n  "/:id",',
  `${routeToAdd}router.patch(\n  "/:id",`
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.routes.js patched with status route.");
