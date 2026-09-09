const { z } = require("zod");

const optionalString = z.string().trim().optional().or(z.literal(""));

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const optionalDateString = z
  .string()
  .trim()
  .regex(dateRegex, "Date must be in YYYY-MM-DD format")
  .optional()
  .or(z.literal(""));

const intelligenceQuerySchema = z.object({
  query: z
    .object({
      branchId: optionalString,
      dateFrom: optionalDateString,
      dateTo: optionalDateString,
      cashierId: optionalString,
      customerId: optionalString,
      provider: optionalString,
      term: optionalString,
      paymentMethod: optionalString,
      settlementType: z.enum(["ALL", "GOOD_AS_CASH", "AR_FINANCING"]).optional().or(z.literal("")),
      downpaymentMethod: optionalString,
      search: optionalString,
      category: optionalString,
      status: optionalString,
      bucket: optionalString,
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    })
    .strict(),
});

const customerArStatementSchema = z.object({
  params: z.object({
    customerId: z.string().trim().min(1, "Customer ID is required").max(191),
  }),
  query: z
    .object({
      branchId: optionalString,
      dateFrom: optionalDateString,
      dateTo: optionalDateString,
    })
    .strict(),
});

module.exports = {
  intelligenceQuerySchema,
  customerArStatementSchema,
};
