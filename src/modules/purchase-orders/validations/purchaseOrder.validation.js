const { z } = require("zod");

const purchaseOrderStatusValues = [
  "DRAFT",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
];

const updatablePurchaseOrderStatusValues = ["ORDERED", "CANCELLED"];

const optionalString = z
  .string()
  .trim()
  .min(1, "Value cannot be empty")
  .optional()
  .nullable();

const hasAtMostTwoDecimalPlaces = (value) =>
  Number.isSafeInteger(Math.round(value * 100)) &&
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;

const quantitySchema = z.coerce
  .number()
  .positive("Quantity must be greater than zero")
  .max(9999999999.99, "Quantity is too large")
  .refine(hasAtMostTwoDecimalPlaces, "Quantity can have at most two decimal places");

const moneySchema = (label) =>
  z.coerce
    .number()
    .min(0, `${label} cannot be negative`)
    .max(9999999999.99, `${label} is too large`)
    .refine(
      hasAtMostTwoDecimalPlaces,
      `${label} can have at most two decimal places`
    );

const purchaseOrderItemSchema = z.object({
  itemId: z.string().trim().min(1, "Item ID cannot be empty").optional().nullable(),
  description: z.string().trim().min(1, "Description is required"),
  quantity: quantitySchema,
  unitCost: moneySchema("Unit cost"),
  discountAmount: moneySchema("Discount amount").optional().default(0),
});

const createPurchaseOrderSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    poCode: z.string().trim().min(1, "PO code cannot be empty").optional(),
    supplierId: z.string().trim().min(1, "Supplier ID is required"),
    expectedDate: z.string().trim().min(1, "Expected date cannot be empty").optional().nullable(),
    notes: optionalString,
    internalNotes: optionalString,
    items: z.array(purchaseOrderItemSchema).min(1, "At least one item is required"),
  }),
});

const listPurchaseOrdersSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    supplierId: z.string().trim().min(1, "Supplier ID cannot be empty").optional(),
    status: z.enum(purchaseOrderStatusValues).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]*$/, "Page must be a positive number")
      .optional(),
    limit: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]*$/, "Limit must be a positive number")
      .optional(),
  }),
});

const purchaseOrderIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Purchase Order ID is required"),
  }),
});

const updatePurchaseOrderSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Purchase Order ID is required"),
  }),
  body: z.object({
    poCode: z.string().trim().min(1, "PO code cannot be empty").optional(),
    expectedDate: z.string().trim().min(1, "Expected date cannot be empty").optional().nullable(),
    notes: optionalString,
    internalNotes: optionalString,
    items: z.array(purchaseOrderItemSchema).min(1, "At least one item is required").optional(),
  }),
});

const updatePurchaseOrderStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Purchase Order ID is required"),
  }),
  body: z.object({
    status: z.enum(updatablePurchaseOrderStatusValues),
    cancellationReason: z
      .string()
      .trim()
      .min(1, "Cancellation reason cannot be empty")
      .optional()
      .nullable(),
  }),
});

module.exports = {
  createPurchaseOrderSchema,
  listPurchaseOrdersSchema,
  purchaseOrderIdParamSchema,
  updatePurchaseOrderSchema,
  updatePurchaseOrderStatusSchema,
};
