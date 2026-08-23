const fs = require("fs");

const filePath = "./src/modules/sales/validations/sale.validation.js";

let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("const installmentTermValues")) {
  content = content.replace(
    `const nonNegativeNumber = z.coerce
  .number()
  .min(0, "Value cannot be negative");
`,
    `const nonNegativeNumber = z.coerce
  .number()
  .min(0, "Value cannot be negative");

const installmentTermValues = [
  "STRAIGHT",
  "MONTH_3",
  "MONTH_6",
  "MONTH_9",
  "MONTH_12",
  "MONTH_18",
  "MONTH_24",
];
`
  );
}

if (!content.includes("const createCreditAccountSchema")) {
  content = content.replace(
    `const cancelSaleSchema = z.object({
  body: z.object({
    cancellationReason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});
`,
    `const cancelSaleSchema = z.object({
  body: z.object({
    cancellationReason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});

const createCreditAccountSchema = z.object({
  body: z.object({
    term: z.enum(installmentTermValues),
    dueDay: z.coerce.number().int().min(1).max(31).optional(),
    firstDueDate: z.string().trim().min(1).optional(),
    remarks: optionalString,
  }),
});
`
  );
}

content = content.replace(
  `module.exports = {
  createSaleSchema,
  cancelSaleSchema,
};
`,
  `module.exports = {
  createSaleSchema,
  cancelSaleSchema,
  createCreditAccountSchema,
};
`
);

fs.writeFileSync(filePath, content);

console.log("DONE: validation force patched.");
