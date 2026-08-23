const { z } = require("zod");

const optionalPositiveIntegerString = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]*$/, "Value must be a positive number")
  .optional();

const inventorySummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    categoryId: z.string().trim().min(1, "Category ID cannot be empty").optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
    search: z.string().trim().optional(),
    lowStockOnly: z.enum(["true", "false"]).optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const salesSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["COMPLETED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]).optional(),
    paymentStatus: z.enum(["PAID", "PARTIALLY_PAID", "UNPAID", "REFUNDED"]).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const serviceSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "READY_FOR_RELEASE", "COMPLETED", "CANCELLED"]).optional(),
    paymentMethod: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
    assignedTechnicianId: z.string().trim().min(1, "Assigned technician ID cannot be empty").optional(),
    customerId: z.string().trim().min(1, "Customer ID cannot be empty").optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const warrantySummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["IN", "CHECKING", "SENT_TO_SUPPLIER", "APPROVED", "REJECTED", "REPAIRED", "REPLACED", "OUT"]).optional(),
    customerId: z.string().trim().min(1, "Customer ID cannot be empty").optional(),
    itemId: z.string().trim().min(1, "Item ID cannot be empty").optional(),
    serialId: z.string().trim().min(1, "Serial ID cannot be empty").optional(),
    supplierName: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const cashSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    cashBoxId: z.string().trim().min(1, "Cash box ID cannot be empty").optional(),
    type: z.enum(["CASH_IN", "CASH_OUT", "SALE_PAYMENT", "CREDIT_COLLECTION", "HANDOVER_OUT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "SERVICE_PAYMENT"]).optional(),
    status: z.enum(["POSTED", "CANCELLED"]).optional(),
    source: z.enum(["MANUAL", "SALE", "CREDIT_COLLECTION", "SYSTEM_ADJUSTMENT", "SERVICE_JOB"]).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const supplierSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const purchaseOrderSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    supplierId: z.string().trim().min(1, "Supplier ID cannot be empty").optional(),
    status: z.enum(["DRAFT", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const purchaseReceivingSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    supplierId: z.string().trim().min(1, "Supplier ID cannot be empty").optional(),
    purchaseOrderId: z.string().trim().min(1, "Purchase order ID cannot be empty").optional(),
    status: z.enum(["DRAFT", "POSTED", "CANCELLED"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
  purchaseReceivingSummarySchema,
};
