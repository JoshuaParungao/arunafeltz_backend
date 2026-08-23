const { z } = require("zod");

const manualCashTransactionTypes = [
  "CASH_IN",
  "CASH_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
];

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));

const createCashTransactionSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Cash box ID is required"),
  }),
  body: z.object({
    type: z.enum(manualCashTransactionTypes),
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    description: z.string().trim().min(3, "Description is required"),
    referenceNo: optionalString,
    transactionDate: z.string().trim().min(1).optional(),
  }),
});

module.exports = {
  createCashTransactionSchema,
};
