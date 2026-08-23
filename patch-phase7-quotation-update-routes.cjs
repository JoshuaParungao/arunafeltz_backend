const fs = require("fs");

const filePath = "./src/modules/quotations/routes/quotation.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes('router.patch("/:id"')) {
  console.log("SKIP: quotation update route already exists.");
  process.exit(0);
}

content = content.replace(
  'const { createQuotationSchema } = require("../validations/quotation.validation");',
  'const { createQuotationSchema, updateQuotationSchema } = require("../validations/quotation.validation");'
);

const routeToAdd = `
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.MANAGE_QUOTATIONS),
  validate(updateQuotationSchema),
  quotationController.updateQuotation
);

`;

content = content.replace(
  "router.post(",
  `${routeToAdd}router.post(`
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.routes.js patched with update route.");
