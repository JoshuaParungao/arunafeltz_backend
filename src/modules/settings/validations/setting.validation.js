const { z } = require("zod");

const settingCategoryValues = [
  "BUSINESS_RULE",
  "OPERATION",
  "DOCUMENT",
  "SYSTEM_ADMIN",
];

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

const warrantyProductTypeValues = [
  "MAJOR_PART",
  "ACCESSORY",
];

const cashBoxRecordedByRoleValues = [
  "CASHIER",
  "TECHNICIAN",
  "ADMIN",
  "BRANCH_OWNER",
  "SUPER_OWNER",
];

const listSettingsSchema = z.object({
  query: z
    .object({
      category: z.enum(settingCategoryValues).optional(),
      key: z.string().trim().max(100).optional(),
      branchId: z.string().trim().min(1).max(191).optional(),
      includeInactive: z
        .enum(["true", "false"])
        .optional(),
    })
    .strict(),
});

const scopeKeyParamSchema = z.object({
  params: z.object({
    scopeKey: z.string().trim().min(1, "Scope key is required").max(191),
  }),
});

const updateSettingSchema = z.object({
  params: z.object({
    scopeKey: z.string().trim().min(1, "Scope key is required").max(191),
  }),
  body: z.object({
    value: z.any().optional(),
    label: z.string().trim().min(1, "Label cannot be empty").optional(),
    description: z.string().trim().optional().nullable(),
    isEditable: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

const quotationTestComputeSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          itemCode: z.string().trim().optional().nullable(),
          description: z.string().trim().optional().nullable(),
          quantity: z.number().positive("Quantity must be greater than 0"),
          cashDiscountedPrice: z
            .number()
            .nonnegative("Cash discounted price cannot be negative"),
        })
      )
      .min(1, "At least one quotation item is required"),
  }),
});

const installmentTestComputeSchema = z.object({
  body: z.object({
    cashPromoTotalAmount: z
      .number()
      .positive("Cash promo total amount must be greater than 0"),
    cashDownpayment: z
      .number()
      .nonnegative("Cash downpayment cannot be negative")
      .optional()
      .default(0),
    term: z.enum(installmentTermValues),
  }),
});

const warrantyTestComputeSchema = z.object({
  body: z.object({
    productType: z.enum(warrantyProductTypeValues),
    purchaseDate: z
      .string()
      .trim()
      .min(1, "Purchase date is required"),
  }),
});

const cashBoxTestStatusSchema = z.object({
  body: z.object({
    paymentAmount: z
      .number()
      .positive("Payment amount must be greater than 0"),
    recordedByRole: z.enum(cashBoxRecordedByRoleValues),
    isCustodianConfirmed: z.boolean().optional().default(false),
  }),
});

module.exports = {
  listSettingsSchema,
  scopeKeyParamSchema,
  updateSettingSchema,
  quotationTestComputeSchema,
  installmentTestComputeSchema,
  warrantyTestComputeSchema,
  cashBoxTestStatusSchema,
};
