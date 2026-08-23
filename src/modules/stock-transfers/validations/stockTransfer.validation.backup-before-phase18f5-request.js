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

const stockTransferItemSchema = z.object({
  itemId: z.string().trim().min(1, "Item ID is required"),
  fromBatchId: z.string().trim().min(1, "Batch ID cannot be empty").optional().nullable(),
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be greater than zero"),
  serialIds: z.array(z.string().trim().min(1, "Serial ID cannot be empty")).optional(),
});

const createStockTransferSchema = z.object({
  body: z.object({
    fromBranchId: z.string().trim().min(1, "From branch ID cannot be empty").optional(),
    toBranchId: z.string().trim().min(1, "To branch ID is required"),
    transferCode: z.string().trim().min(1, "Transfer code cannot be empty").optional(),
    notes: optionalString,
    internalNotes: optionalString,
    items: z.array(stockTransferItemSchema).min(1, "At least one item is required"),
  }),
});

const listStockTransfersSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
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
  }),
});

const updateStockTransferStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Stock Transfer ID is required"),
  }),
  body: z.object({
    status: z.enum(updatableStockTransferStatusValues),
    rejectionReason: optionalString,
    cancellationReason: optionalString,
  }),
});

module.exports = {
  createStockTransferSchema,
  listStockTransfersSchema,
  stockTransferIdParamSchema,
  updateStockTransferSchema,
  updateStockTransferStatusSchema,
};
