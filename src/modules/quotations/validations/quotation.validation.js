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

const optionalMarkupPercent = z.coerce
  .number()
  .min(0, "Mark up percentage cannot be negative")
  .lt(100, "Mark up percentage must be less than 100")
  .optional();

const optionalNullableId = z
  .string()
  .trim()
  .min(1)
  .optional()
  .nullable()
  .or(z.literal(""));

const quotationItemSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  priceTier: z.coerce.number().int().min(1).max(5),
  markupPercent: optionalMarkupPercent,
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
    serviceDoneById: optionalNullableId,
    title: optionalString,
    notes: optionalString,
    internalNotes: optionalString,
    isPcBuild: z.boolean().optional().default(false),
    validUntil: z.string().datetime().optional(),
    items: z.array(quotationItemSchema).min(1, "At least one quotation item is required"),
  }),
});


const updateQuotationSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Quotation ID is required").max(191),
  }),
  body: z.object({
    customerId: z.string().trim().min(1).optional().or(z.literal("")),
    serviceDoneById: optionalNullableId,
    title: optionalString,
    notes: optionalString,
    internalNotes: optionalString,
    isPcBuild: z.boolean().optional(),
    validUntil: z.string().datetime().optional().or(z.literal("")),
    items: z.array(quotationItemSchema).min(1, "At least one quotation item is required").optional(),
  }),
});

const listServiceStaffSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
  }),
});


const updateQuotationStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Quotation ID is required").max(191),
  }),
  body: z.object({
    status: z.enum(["SENT", "APPROVED", "CANCELLED"]),
    remarks: optionalString,
  }),
});

const listQuotationsSchema = z.object({
  query: z
    .object({
      branchId: z.string().trim().min(1).max(191).optional(),
      status: z.enum(["DRAFT", "SENT", "APPROVED", "CONVERTED", "CANCELLED"]).optional(),
      customerId: z.string().trim().min(1).max(191).optional(),
      preparedById: z.string().trim().min(1).max(191).optional(),
      search: z.string().trim().max(100).optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .strict(),
});

const quotationIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Quotation ID is required").max(191),
  }),
});

module.exports = {
  createQuotationSchema,
  updateQuotationSchema,
  updateQuotationStatusSchema,
  listServiceStaffSchema,
  listQuotationsSchema,
  quotationIdParamSchema,
};
