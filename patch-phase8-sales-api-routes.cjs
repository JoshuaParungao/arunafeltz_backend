const fs = require("fs");

const filePath = "./src/routes/api.routes.js";

if (!fs.existsSync(filePath)) {
  console.error("api.routes.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (!content.includes('require("../modules/sales/routes/sale.routes")')) {
  content = content.replace(
    'const quotationRoutes = require("../modules/quotations/routes/quotation.routes");',
    'const quotationRoutes = require("../modules/quotations/routes/quotation.routes");\nconst saleRoutes = require("../modules/sales/routes/sale.routes");'
  );

  console.log("ADDED: sale route import.");
} else {
  console.log("SKIP: sale route import already exists.");
}

if (!content.includes('router.use("/sales", saleRoutes);')) {
  content = content.replace(
    'router.use("/quotations", quotationRoutes);',
    'router.use("/quotations", quotationRoutes);\nrouter.use("/sales", saleRoutes);'
  );

  console.log("ADDED: /sales route.");
} else {
  console.log("SKIP: /sales route already exists.");
}

fs.writeFileSync(filePath, content);
console.log("DONE: api.routes.js patched for sales.");
