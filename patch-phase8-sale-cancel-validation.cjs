const fs = require("fs");

const filePath = "./src/modules/sales/validations/sale.validation.js";

if (!fs.existsSync(filePath)) {
  console.error("sale.validation.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("cancelSaleSchema")) {
  console.log("SKIP: cancelSaleSchema already exists.");
  process.exit(0);
}

const schemaToAdd = `
const cancelSaleSchema = z.object({
  body: z.object({
    cancellationReason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});
`;

content = content.replace(
  "module.exports = {",
  `${schemaToAdd}\nmodule.exports = {`
);

content = content.replace(
  "createSaleSchema,",
  "createSaleSchema,\n  cancelSaleSchema,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: sale.validation.js patched with cancelSaleSchema.");
