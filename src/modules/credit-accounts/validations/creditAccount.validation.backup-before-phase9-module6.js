const { z } = require("zod");

const creditAccountStatusValues = ["ACTIVE", "PAID", "CANCELLED", "DEFAULTED"];

const installmentTermValues = [
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

const listCreditAccountsSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    customerId: z.string().trim().min(1).optional(),
    saleId: z.string().trim().min(1).optional(),
    status: z.enum(creditAccountStatusValues).optional(),
    term: z.enum(installmentTermValues).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

const creditAccountIdParamSchema = z.object({
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

module.exports = {
  listCreditAccountsSchema,
  creditAccountIdParamSchema,
  createCreditCollectionSchema,
};
