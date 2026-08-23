const fs = require("fs");

const filePath = "./src/modules/inventory/routes/inventory.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (!content.includes('require("../../../middlewares/validate.middleware")')) {
  content = content.replace(
    'const express = require("express");',
    'const express = require("express");\n\nconst validate = require("../../../middlewares/validate.middleware");'
  );

  console.log("ADDED: validate middleware import.");
}

if (!content.includes("stockInSchema")) {
  content = content.replace(
    'const { PERMISSIONS } = require("../../../constants/permissions");',
    'const { PERMISSIONS } = require("../../../constants/permissions");\nconst { stockInSchema, adjustmentSchema } = require("../validations/inventory.validation");'
  );

  console.log("ADDED: inventory validation imports.");
}

if (!content.includes('router.post("/stock-in"')) {
  content = content.replace(
    'router.get("/serials", inventoryController.getSerials);',
    'router.get("/serials", inventoryController.getSerials);\n\nrouter.post(\n  "/stock-in",\n  requirePermission(PERMISSIONS.MANAGE_INVENTORY),\n  validate(stockInSchema),\n  inventoryController.createStockIn\n);\n\nrouter.post(\n  "/adjustments",\n  requirePermission(PERMISSIONS.MANAGE_INVENTORY),\n  validate(adjustmentSchema),\n  inventoryController.createAdjustment\n);'
  );

  console.log("ADDED: stock-in and adjustment routes.");
} else {
  console.log("SKIP: stock-in and adjustment routes already exist.");
}

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.routes.js patched for stock mutation APIs.");
