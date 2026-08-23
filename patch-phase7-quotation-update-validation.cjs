const fs = require("fs");

const filePath = "./src/modules/quotations/validations/quotation.validation.js";

if (!fs.existsSync(filePath)) {
  console.error("quotation.validation.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("updateQuotationSchema")) {
  console.log("SKIP: updateQuotationSchema already exists.");
  process.exit(0);
}

const schemaToAdd = `
const updateQuotationSchema = z.object({
  body: z.object({
    customerId: z.string().trim().min(1).optional().or(z.literal("")),
    preparedById: z.string().trim().min(1).optional().or(z.literal("")),
    title: optionalString,
    notes: optionalString,
    internalNotes: optionalString,
    isPcBuild: z.boolean().optional(),
    validUntil: z.string().datetime().optional().or(z.literal("")),
    items: z.array(quotationItemSchema).min(1, "At least one quotation item is required").optional(),
  }),
});
`;

content = content.replace(
  "module.exports = {",
  `${schemaToAdd}\nmodule.exports = {`
);

content = content.replace(
  "createQuotationSchema,",
  "createQuotationSchema,\n  updateQuotationSchema,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: quotation.validation.js patched with updateQuotationSchema.");
