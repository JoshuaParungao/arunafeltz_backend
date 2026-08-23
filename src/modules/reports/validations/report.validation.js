const { z } = require("zod");

const optionalPositiveIntegerString = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]*$/, "Value must be a positive number")
  .optional();

const strictBusinessDateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    );
  }, "Date must be a valid calendar date");

const financialSummarySchema = z
  .object({
    query: z.object({
      branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
      dateFrom: strictBusinessDateString.optional(),
      dateTo: strictBusinessDateString.optional(),
      page: optionalPositiveIntegerString,
      limit: optionalPositiveIntegerString,
    }),
  })
  .superRefine(({ query }, context) => {
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      context.addIssue({
        code: "custom",
        path: ["query", "dateTo"],
        message: "dateTo cannot be earlier than dateFrom",
      });
    }
  });

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
    isQuickService: z.enum(["true", "false"]).optional(),
    releasedOnly: z.enum(["true", "false"]).optional(),
    releaseOutcome: z.enum([
      "REPAIRED",
      "SERVICE_COMPLETED",
      "UNREPAIRED",
      "CUSTOMER_PULL_OUT",
      "NO_FAULT_FOUND",
      "DECLINED",
      "OTHER",
    ]).optional(),
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

const stockTransferSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    fromBranchId: z.string().trim().min(1, "From branch ID cannot be empty").optional(),
    toBranchId: z.string().trim().min(1, "To branch ID cannot be empty").optional(),
    status: z.enum(["DRAFT", "REQUESTED", "APPROVED", "REJECTED", "POSTED", "CANCELLED"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const alertSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    limit: optionalPositiveIntegerString,
  }),
});

const creditSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    customerId: z.string().trim().min(1, "Customer ID cannot be empty").optional(),
    status: z.enum(["ACTIVE", "PAID", "CANCELLED", "DEFAULTED"]).optional(),
    search: z.string().trim().optional(),
    overdueOnly: z.enum(["true", "false"]).optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

const staffPerformanceSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    staffId: z.string().trim().min(1, "Staff ID cannot be empty").optional(),
    role: z.enum(["SUPER_OWNER", "BRANCH_OWNER", "ADMIN", "CASHIER", "TECHNICIAN", "CASH_CUSTODIAN"]).optional(),
    status: z.enum(["PENDING", "ACTIVE", "REJECTED", "DISABLED"]).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});

module.exports = {
  financialSummarySchema,
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
  cashSummarySchema,
  supplierSummarySchema,
  purchaseOrderSummarySchema,
  purchaseReceivingSummarySchema,
  stockTransferSummarySchema,
  creditSummarySchema,
  staffPerformanceSummarySchema,
  alertSummarySchema,
};
