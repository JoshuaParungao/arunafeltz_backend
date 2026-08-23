const fs = require("fs");

const filePath = "./src/modules/quotations/validations/quotation.validation.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.validation.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("updateQuotationStatusSchema")) {
  console.log("SKIP: updateQuotationStatusSchema already exists.");
  process.exit(0);
}

const schemaToAdd = `
const updateQuotationStatusSchema = z.object({
  body: z.object({
    status: z.enum(["SENT", "APPROVED", "CANCELLED"]),
    remarks: optionalString,
  }),
});
`;

content = content.replace(
  "module.exports = {",
  `${schemaToAdd}\nmodule.exports = {`
);

content = content.replace(
  "updateQuotationSchema,",
  "updateQuotationSchema,\n  updateQuotationStatusSchema,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.validation.js patched with updateQuotationStatusSchema.");
