const fs = require("fs");

const filePath = "./src/routes/api.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("api.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (!content.includes('require("../modules/quotations/routes/quotation.routes")')) {
  content = content.replace(
    'const inventoryRoutes = require("../modules/inventory/routes/inventory.routes");',
    'const inventoryRoutes = require("../modules/inventory/routes/inventory.routes");\nconst quotationRoutes = require("../modules/quotations/routes/quotation.routes");'
  );

  console.log("ADDED: quotation route import.");
} else {
  console.log("SKIP: quotation route import already exists.");
}

if (!content.includes('router.use("/quotations", quotationRoutes);')) {
  content = content.replace(
    'router.use("/inventory", inventoryRoutes);',
    'router.use("/inventory", inventoryRoutes);\nrouter.use("/quotations", quotationRoutes);'
  );

  console.log("ADDED: /quotations route.");
} else {
  console.log("SKIP: /quotations route already exists.");
}

fs.writeFileSync(filePath, content);
console.log("DONE: api.routes.js patched for quotations.");
