const fs = require("fs");

const filePath = "./src/modules/inventory/validations/inventory.validation.js";

if (!fs.existsSync(filePath)) {
  console.error("inventory.validation.js not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("serialStatusUpdateSchema")) {
  console.log("SKIP: serialStatusUpdateSchema already exists.");
  process.exit(0);
}

const schemaToAdd = `
const serialStatusUpdateSchema = z.object({
  body: z.object({
    status: z.enum([
      "AVAILABLE",
      "RESERVED",
      "SOLD",
      "RETURNED",
      "WARRANTY",
      "DAMAGED",
      "LOST",
    ]),
    remarks: optionalString,
  }),
});
`;

content = content.replace(
  "module.exports = {",
  `${schemaToAdd}\nmodule.exports = {`
);

content = content.replace(
  "adjustmentSchema,",
  "adjustmentSchema,\n  serialStatusUpdateSchema,"
);

fs.writeFileSync(filePath, content);
console.log("DONE: inventory.validation.js patched with serial status validation.");
