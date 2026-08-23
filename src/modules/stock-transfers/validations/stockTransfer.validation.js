const { z } = require("zod");

const stockTransferStatusValues = [
  "DRAFT",
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "POSTED",
  "CANCELLED",
];

const updatableStockTransferStatusValues = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "POSTED",
  "CANCELLED",
];

const optionalString = z
  .string()
  .trim()
  .min(1, "Value cannot be empty")
  .optional()
  .nullable();

const transferUnitPrice = z.coerce
  .number()
  .finite("Transfer unit price must be a valid number")
  .nonnegative("Transfer unit price cannot be negative")
  .max(9999999999.99, "Transfer unit price is too large")
  .multipleOf(0.01, "Transfer unit price can have at most two decimal places");

const stockTransferItemSchema = z.object({
  itemId: z.string().trim().min(1, "Item ID is required"),
  fromBatchId: z.string().trim().min(1, "Batch ID cannot be empty").optional().nullable(),
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  proposedTransferUnitPrice: transferUnitPrice.optional().nullable(),
  serialIds: z.array(z.string().trim().min(1, "Serial ID cannot be empty")).optional(),
}).strict();

const createStockTransferSchema = z.object({
  body: z.object({
    fromBranchId: z.string().trim().min(1, "From branch ID cannot be empty").optional(),
    toBranchId: z.string().trim().min(1, "To branch ID is required"),
    transferCode: z.string().trim().min(1, "Transfer code cannot be empty").optional(),
    notes: optionalString,
    internalNotes: optionalString,
    items: z.array(stockTransferItemSchema).min(1, "At least one item is required"),
  }).strict(),
});

const stockTransferRequestItemSchema = z.object({
  itemId: z.string().trim().min(1, "Item is required"),
  description: optionalString,
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
}).strict();

const createStockTransferRequestSchema = z.object({
  body: z.object({
    fromBranchId: z.string().trim().min(1, "From branch is required"),
    toBranchId: z.string().trim().min(1, "To branch cannot be empty").optional(),
    fulfillmentMethod: z.enum(["PICKUP", "DELIVERY"]),
    deliveryCharge: transferUnitPrice.optional(),
    notes: optionalString,
    items: z.array(stockTransferRequestItemSchema).min(1, "At least one item is required"),
  }).strict(),
});

const listRequestableStockSchema = z.object({
  query: z.object({
    fromBranchId: z.string().trim().min(1, "From branch is required"),
    search: z.string().trim().optional(),
    page: z.string().trim().regex(/^[1-9][0-9]*$/, "Page must be a positive number").optional(),
    limit: z.string().trim().regex(/^[1-9][0-9]*$/, "Limit must be a positive number").optional(),
  }),
});
const listStockTransfersSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    fromBranchId: z.string().trim().min(1, "From branch ID cannot be empty").optional(),
    toBranchId: z.string().trim().min(1, "To branch ID cannot be empty").optional(),
    status: z.enum(stockTransferStatusValues).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: z.string().trim().regex(/^[1-9][0-9]*$/, "Page must be a positive number").optional(),
    limit: z.string().trim().regex(/^[1-9][0-9]*$/, "Limit must be a positive number").optional(),
  }),
});

const stockTransferIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Stock Transfer ID is required"),
  }),
});

const updateStockTransferSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Stock Transfer ID is required"),
  }),
  body: z.object({
    toBranchId: z.string().trim().min(1, "To branch ID cannot be empty").optional(),
    transferCode: z.string().trim().min(1, "Transfer code cannot be empty").optional(),
    notes: optionalString,
    internalNotes: optionalString,
    items: z.array(stockTransferItemSchema).min(1, "At least one item is required").optional(),
  }).strict(),
});

const updateStockTransferPricingSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Stock Transfer ID is required"),
  }),
  body: z.object({
    items: z.array(
      z.object({
        stockTransferItemId: z.string().trim().min(1, "Stock transfer item ID is required"),
        agreedTransferUnitPrice: transferUnitPrice,
      }).strict()
    ).min(1, "At least one agreed transfer price is required"),
  }).strict(),
});

const updateStockTransferStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Stock Transfer ID is required"),
  }),
  body: z.object({
    status: z.enum(updatableStockTransferStatusValues),
    rejectionReason: optionalString,
    cancellationReason: optionalString,
  }).strict(),
});

module.exports = {
  createStockTransferRequestSchema,
  listRequestableStockSchema,
  createStockTransferSchema,
  listStockTransfersSchema,
  stockTransferIdParamSchema,
  updateStockTransferSchema,
  updateStockTransferPricingSchema,
  updateStockTransferStatusSchema,
};

