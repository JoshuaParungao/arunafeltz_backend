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

const optionalPositiveIntegerString = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]*$/, "Value must be a positive integer")
  .optional();

const commonListQuery = {
  branchId: z.string().trim().min(1, "Branch cannot be empty").optional(),
  search: z.string().trim().optional(),
  page: optionalPositiveIntegerString,
  limit: optionalPositiveIntegerString,
};

const inventoryOverviewSchema = z.object({
  query: z.object({
    ...commonListQuery,
    categoryId: z.string().trim().min(1, "Category cannot be empty").optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    lowStockOnly: z.enum(["true", "false"]).optional(),
  }),
});

const inventoryBatchesSchema = z.object({
  query: z.object({
    ...commonListQuery,
    itemId: z.string().trim().min(1, "Item cannot be empty").optional(),
    status: z.enum(["ACTIVE", "DEPLETED", "EXPIRED", "CANCELLED"]).optional(),
  }),
});

const inventorySerialsSchema = z.object({
  query: z.object({
    ...commonListQuery,
    itemId: z.string().trim().min(1, "Item cannot be empty").optional(),
    batchId: z.string().trim().min(1, "Batch cannot be empty").optional(),
    status: z.enum([
      "AVAILABLE",
      "RESERVED",
      "SOLD",
      "RETURNED",
      "WARRANTY",
      "DAMAGED",
      "LOST",
    ]).optional(),
  }),
});

const inventoryMovementsSchema = z.object({
  query: z.object({
    ...commonListQuery,
    itemId: z.string().trim().min(1, "Item cannot be empty").optional(),
    batchId: z.string().trim().min(1, "Batch cannot be empty").optional(),
    serialId: z.string().trim().min(1, "Serial cannot be empty").optional(),
    type: z.enum([
      "STOCK_IN",
      "STOCK_OUT",
      "ADJUSTMENT_IN",
      "ADJUSTMENT_OUT",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "SALE_OUT",
      "RETURN_IN",
      "WARRANTY_OUT",
      "WARRANTY_RETURN",
    ]).optional(),
    source: z.enum([
      "MANUAL",
      "PURCHASE",
      "SALE",
      "TRANSFER",
      "RETURN",
      "WARRANTY",
      "SERVICE",
      "SYSTEM",
    ]).optional(),
  }),
});

const stockInSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch is required").optional(),
    itemId: z.string().trim().min(1, "Item is required"),
    batchId: z.string().trim().min(1).optional(),
    batchCode: z.string().trim().min(1).optional(),
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
    batchId: z.string().trim().min(1).optional(),
    itemId: z.string().trim().min(1).optional(),
    type: z.enum(["INCREASE", "DECREASE"]),
    quantity: positiveNumber,
    referenceNo: optionalString,
    remarks: optionalString,
    serialNumbers: z.array(z.string().trim().min(1)).optional(),
  }),
});


const serialStatusUpdateSchema = z.object({
  body: z.object({
    status: z.enum([
      "AVAILABLE",
      "RESERVED",
      "SOLD",
      "RETURNED",
      "WARRANTY",
      "DAMAGED",
      "LOST",
    ]),
    remarks: optionalString,
  }),
});

module.exports = {
  inventoryOverviewSchema,
  inventoryBatchesSchema,
  inventorySerialsSchema,
  inventoryMovementsSchema,
  stockInSchema,
  adjustmentSchema,
  serialStatusUpdateSchema,
};
