const fs = require("fs");

const filePath = "./src/routes/api.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("api.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (!content.includes('require("../modules/inventory/routes/inventory.routes")')) {
  content = content.replace(
    'const itemRoutes = require("../modules/items/routes/item.routes");',
    'const itemRoutes = require("../modules/items/routes/item.routes");\nconst inventoryRoutes = require("../modules/inventory/routes/inventory.routes");'
  );

  console.log("ADDED: inventory route import.");
} else {
  console.log("SKIP: inventory route import already exists.");
}

if (!content.includes('router.use("/inventory", inventoryRoutes);')) {
  content = content.replace(
    'router.use("/items", itemRoutes);',
    'router.use("/items", itemRoutes);\nrouter.use("/inventory", inventoryRoutes);'
  );

  console.log("ADDED: /api/inventory route registration.");
} else {
  console.log("SKIP: /api/inventory route already registered.");
}

fs.writeFileSync(filePath, content);
console.log("DONE: api.routes.js patched for inventory.");
