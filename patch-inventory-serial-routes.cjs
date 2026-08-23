const fs = require("fs");

const filePath = "./src/modules/inventory/routes/inventory.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes('router.patch("/serials/:id/status"')) {
  console.log("SKIP: serial status route already exists.");
  process.exit(0);
}

content = content.replace(
  'const { stockInSchema, adjustmentSchema } = require("../validations/inventory.validation");',
  'const { stockInSchema, adjustmentSchema, serialStatusUpdateSchema } = require("../validations/inventory.validation");'
);

content = content.replace(
  'router.get("/serials", inventoryController.getSerials);',
  'router.get("/serials", inventoryController.getSerials);\n\nrouter.patch(\n  "/serials/:id/status",\n  requirePermission(PERMISSIONS.MANAGE_INVENTORY),\n  validate(serialStatusUpdateSchema),\n  inventoryController.updateSerialStatus\n);'
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.routes.js patched with serial status route.");
