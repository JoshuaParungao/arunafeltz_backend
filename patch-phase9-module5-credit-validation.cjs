const fs = require("fs");

const filePath = "./src/modules/credit-accounts/validations/creditAccount.validation.js";

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("createCreditCollectionSchema")) {
  console.log("SKIP: createCreditCollectionSchema already exists.");
  process.exit(0);
}

content = content.replace(
  `const installmentTermValues = [
  "STRAIGHT",
  "MONTH_3",
  "MONTH_6",
  "MONTH_9",
  "MONTH_12",
  "MONTH_18",
  "MONTH_24",
];
`,
  `const installmentTermValues = [
  "STRAIGHT",
  "MONTH_3",
  "MONTH_6",
  "MONTH_9",
  "MONTH_12",
  "MONTH_18",
  "MONTH_24",
];

const collectionPaymentMethodValues = [
  "CASH",
  "GCASH",
  "BANK_TRANSFER",
  "CARD",
  "OTHER",
];

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));
`
);

content = content.replace(
  `const creditAccountIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Credit account ID is required"),
  }),
});
`,
  `const creditAccountIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Credit account ID is required"),
  }),
});

const createCreditCollectionSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Credit account ID is required"),
  }),
  body: z.object({
    amount: z.coerce.number().positive("Collection amount must be greater than zero"),
    paymentMethod: z.enum(collectionPaymentMethodValues).default("CASH"),
    referenceNo: optionalString,
    remarks: optionalString,
    paidAt: z.string().trim().min(1).optional(),
  }),
});
`
);

content = content.replace(
  `module.exports = {
  listCreditAccountsSchema,
  creditAccountIdParamSchema,
};
`,
  `module.exports = {
  listCreditAccountsSchema,
  creditAccountIdParamSchema,
  createCreditCollectionSchema,
};
`
);

fs.writeFileSync(filePath, content);

console.log("DONE: creditAccount.validation.js patched for collection posting.");
