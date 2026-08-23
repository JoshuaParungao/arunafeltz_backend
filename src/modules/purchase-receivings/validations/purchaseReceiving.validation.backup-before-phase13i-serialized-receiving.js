const { z } = require("zod");

const purchaseReceivingStatusValues = ["DRAFT", "POSTED", "CANCELLED"];

const updatablePurchaseReceivingStatusValues = ["CANCELLED", "POSTED"];

const optionalString = z
  .string()
  .trim()
  .min(1, "Value cannot be empty")
  .optional()
  .nullable();

const purchaseReceivingItemSchema = z.object({
  itemId: z.string().trim().min(1, "Item ID is required"),
  purchaseOrderItemId: z
    .string()
    .trim()
    .min(1, "Purchase order item ID cannot be empty")
    .optional()
    .nullable(),
  description: z.string().trim().min(1, "Description is required"),
  quantityReceived: z.coerce
    .number()
    .positive("Quantity received must be greater than zero"),
  unitCost: z.coerce.number().min(0, "Unit cost cannot be negative"),
  discountAmount: z.coerce
    .number()
    .min(0, "Discount amount cannot be negative")
    .optional()
    .default(0),
  batchCode: z
    .string()
    .trim()
    .min(1, "Batch code cannot be empty")
    .optional()
    .nullable(),
  expiryDate: z
    .string()
    .trim()
    .min(1, "Expiry date cannot be empty")
    .optional()
    .nullable(),
});

const createPurchaseReceivingSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    receivingCode: z
      .string()
      .trim()
      .min(1, "Receiving code cannot be empty")
      .optional(),
    supplierId: z.string().trim().min(1, "Supplier ID is required"),
    purchaseOrderId: z
      .string()
      .trim()
      .min(1, "Purchase order ID cannot be empty")
      .optional()
      .nullable(),
    supplierDeliveryNo: optionalString,
    supplierInvoiceNo: optionalString,
    referenceNo: optionalString,
    notes: optionalString,
    internalNotes: optionalString,
    items: z
      .array(purchaseReceivingItemSchema)
      .min(1, "At least one item is required"),
  }),
});

const listPurchaseReceivingsSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    supplierId: z.string().trim().min(1, "Supplier ID cannot be empty").optional(),
    purchaseOrderId: z
      .string()
      .trim()
      .min(1, "Purchase order ID cannot be empty")
      .optional(),
    status: z.enum(purchaseReceivingStatusValues).optional(),
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

const purchaseReceivingIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Purchase Receiving ID is required"),
  }),
});

const updatePurchaseReceivingSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Purchase Receiving ID is required"),
  }),
  body: z.object({
    receivingCode: z
      .string()
      .trim()
      .min(1, "Receiving code cannot be empty")
      .optional(),
    supplierDeliveryNo: optionalString,
    supplierInvoiceNo: optionalString,
    referenceNo: optionalString,
    notes: optionalString,
    internalNotes: optionalString,
    items: z
      .array(purchaseReceivingItemSchema)
      .min(1, "At least one item is required")
      .optional(),
  }),
});

const updatePurchaseReceivingStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Purchase Receiving ID is required"),
  }),
  body: z.object({
    status: z.enum(updatablePurchaseReceivingStatusValues),
    cancellationReason: z
      .string()
      .trim()
      .min(1, "Cancellation reason cannot be empty")
      .optional()
      .nullable(),
  }),
});

module.exports = {
  createPurchaseReceivingSchema,
  listPurchaseReceivingsSchema,
  purchaseReceivingIdParamSchema,
  updatePurchaseReceivingSchema,
  updatePurchaseReceivingStatusSchema,
};
