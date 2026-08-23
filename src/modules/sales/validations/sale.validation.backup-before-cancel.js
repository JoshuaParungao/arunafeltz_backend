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

const saleItemSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  priceTier: z.coerce.number().int().min(1).max(5).optional(),
  quantity: positiveNumber,
  unitPrice: nonNegativeNumber.optional(),
  discountAmount: nonNegativeNumber.optional().default(0),
  batchId: z.string().trim().min(1).optional(),
  serialId: z.string().trim().min(1).optional(),
});

const salePaymentSchema = z.object({
  paymentMethod: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "CARD", "CREDIT", "OTHER"]),
  amount: nonNegativeNumber,
  referenceNo: optionalString,
  remarks: optionalString,
});

const createSaleSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1).optional(),
    customerId: z.string().trim().min(1).optional(),
    quotationId: z.string().trim().min(1).optional(),
    serviceCharge: nonNegativeNumber.optional().default(0),
    remarks: optionalString,
    items: z.array(saleItemSchema).min(1, "At least one sale item is required"),
    payments: z.array(salePaymentSchema).min(1, "At least one payment is required"),
  }),
});

module.exports = {
  createSaleSchema,
};
