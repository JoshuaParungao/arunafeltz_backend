const { z } = require("zod");

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));

const positiveNumber = z.coerce
  .number()
  .positive("Quantity must be greater than zero");

const nonNegativeNumber = z.coerce
  .number()
  .min(0, "Value cannot be negative");

const stockInSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch is required").optional(),
    itemId: z.string().trim().min(1, "Item is required"),
    batchCode: z.string().trim().min(1, "Batch code is required"),
    quantity: positiveNumber,
    unitCost: nonNegativeNumber.optional(),
    sellingPrice1: nonNegativeNumber.optional(),
    sellingPrice2: nonNegativeNumber.optional(),
    sellingPrice3: nonNegativeNumber.optional(),
    sellingPrice4: nonNegativeNumber.optional(),
    sellingPrice5: nonNegativeNumber.optional(),
    supplierName: optionalString,
    referenceNo: optionalString,
    remarks: optionalString,
    expiryDate: z.string().datetime().optional(),
    serialNumbers: z.array(z.string().trim().min(1)).optional(),
  }),
});

const adjustmentSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch is required").optional(),
    batchId: z.string().trim().min(1, "Batch is required"),
    type: z.enum(["INCREASE", "DECREASE"]),
    quantity: positiveNumber,
    referenceNo: optionalString,
    remarks: optionalString,
  }),
});

module.exports = {
  stockInSchema,
  adjustmentSchema,
};
