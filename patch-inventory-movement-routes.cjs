const fs = require("fs");

const filePath = "./src/modules/inventory/routes/inventory.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes('router.get("/movements"')) {
  console.log("SKIP: movement route already exists.");
  process.exit(0);
}

content = content.replace(
  'router.get("/serials", inventoryController.getSerials);',
  'router.get("/serials", inventoryController.getSerials);\nrouter.get("/movements", inventoryController.getMovements);'
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.routes.js patched with movement history route.");
