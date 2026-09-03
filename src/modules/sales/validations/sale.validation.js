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

const installmentTermValues = [
  "CASH_PROMO",
  "STRAIGHT",
  "MONTH_3",
  "MONTH_6",
  "MONTH_9",
  "MONTH_12",
  "MONTH_18",
  "MONTH_24",
];

const receivableProviderValues = [
  "CREDIT_CARD",
  "DEBIT_CARD",
  "HOMECREDIT",
  "SALMON",
  "SKYRO",
  "KYRO",
  "OTHER_FINANCING",
  "IN_HOUSE_INSTALLMENT",
];

const saleItemSchema = z.object({
  itemId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  priceTier: z.coerce.number().int().min(1).max(5).optional(),
  markupPercent: optionalMarkupPercent,
  quantity: positiveNumber,
  unitPrice: nonNegativeNumber.optional(),
  batchId: z.string().trim().min(1).optional(),
  serialId: z.string().trim().min(1).optional(),
  serialNumber: optionalString,
  warrantyType: optionalString,
  warrantyDuration: optionalString,
  warrantyDays: z.coerce.number().nonnegative().optional(),
  warrantyMonths: z.coerce.number().nonnegative().optional(),
});

const salePaymentSchema = z.object({
  paymentMethod: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "OTHER"]),
  amount: positiveNumber,
  referenceNo: optionalString,
  remarks: optionalString,
});

const receivableSchema = z
  .object({
    provider: z.enum(receivableProviderValues),
    providerReferenceNo: optionalString,
    term: z.enum(installmentTermValues).optional(),
    dueDay: z.coerce.number().int().min(1).max(31).optional(),
    firstDueDate: z.string().trim().min(1).optional(),
    remarks: optionalString,
  })
  .superRefine((receivable, context) => {
    const isInHouse = receivable.provider === "IN_HOUSE_INSTALLMENT";

    if (isInHouse && !receivable.term) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Installment term is required for in-house receivables",
        path: ["term"],
      });
    }
  });

const createSaleSchema = z.object({
  body: z
    .object({
      branchId: z.string().trim().min(1).optional(),
      idempotencyKey: z.string().uuid().optional(),
      customerId: z.string().trim().min(1).optional(),
      quotationId: z.string().trim().min(1).optional(),
      serviceCharge: nonNegativeNumber.optional().default(0),
      remarks: optionalString,
      items: z.array(saleItemSchema).min(1, "At least one sale item is required"),
      payments: z.array(salePaymentSchema).optional().default([]),
      receivable: receivableSchema.optional(),
    })
    .superRefine((body, context) => {
      if (body.payments.length === 0 && !body.receivable) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one settlement or a receivable is required",
          path: ["payments"],
        });
      }
    }),
});


const cancelSaleSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Sale ID is required").max(191),
  }),
  body: z.object({
    cancellationReason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});

const createCreditAccountSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Sale ID is required").max(191),
  }),
  body: z.object({
    term: z.enum(installmentTermValues),
    dueDay: z.coerce.number().int().min(1).max(31).optional(),
    firstDueDate: z.string().trim().min(1).optional(),
    remarks: optionalString,
  }),
});

const saleReturnItemSchema = z.object({
  saleItemId: z.string().trim().min(1, "Sale item is required").max(191),
  quantity: z.coerce
    .number()
    .positive("Return quantity must be greater than zero")
    .multipleOf(0.01, "Return quantity supports at most two decimal places"),
  serialId: z.string().trim().min(1).max(191).optional(),
  reason: optionalString,
});

const createSaleReturnSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Sale ID is required").max(191),
  }),
  body: z
    .object({
      reason: z.string().trim().min(1, "Return reason is required"),
      notes: optionalString,
      internalNotes: optionalString,
      refundMethod: z.enum([
        "CASH",
        "GCASH",
        "BANK_TRANSFER",
        "CARD",
        "STORE_CREDIT",
        "NONE",
      ]),
      refundAmount: nonNegativeNumber,
      items: z
        .array(saleReturnItemSchema)
        .min(1, "At least one inventory sale item is required"),
    })
    .superRefine((body, context) => {
      const seen = new Set();
      body.items.forEach((item, index) => {
        if (seen.has(item.saleItemId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A sale item can only appear once in a return",
            path: ["items", index, "saleItemId"],
          });
        }
        seen.add(item.saleItemId);
      });
    }),
});

const listSalesSchema = z.object({
  query: z
    .object({
      branchId: z.string().trim().min(1).max(191).optional(),
      status: z.enum(["COMPLETED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
      paymentStatus: z.enum(["PAID", "PARTIALLY_PAID", "UNPAID", "REFUNDED"]).optional(),
      customerId: z.string().trim().min(1).max(191).optional(),
      cashierId: z.string().trim().min(1).max(191).optional(),
      search: z.string().trim().max(100).optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .strict(),
});

const saleIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Sale ID is required").max(191),
  }),
});

module.exports = {
  createSaleSchema,
  cancelSaleSchema,
  createCreditAccountSchema,
  createSaleReturnSchema,
  listSalesSchema,
  saleIdParamSchema,
};
