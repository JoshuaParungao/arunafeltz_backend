const { z } = require("zod");

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));

const positiveNumber = z.coerce
  .number()
  .positive("Value must be greater than zero");

const nonNegativeNumber = z.coerce
  .number()
  .min(0, "Value cannot be negative");

const quotationItemSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  priceTier: z.coerce.number().int().min(1).max(5),
  quantity: positiveNumber,
  unitPrice: nonNegativeNumber.optional(),
  discountAmount: nonNegativeNumber.optional().default(0),
  isPcBuildPart: z.boolean().optional().default(false),
  remarks: optionalString,
});

const createQuotationSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1).optional(),
    customerId: z.string().trim().min(1).optional(),
    preparedById: z.string().trim().min(1).optional(),
    title: optionalString,
    notes: optionalString,
    internalNotes: optionalString,
    isPcBuild: z.boolean().optional().default(false),
    validUntil: z.string().datetime().optional(),
    items: z.array(quotationItemSchema).min(1, "At least one quotation item is required"),
  }),
});


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

module.exports = {
  createQuotationSchema,
  updateQuotationSchema,
};
