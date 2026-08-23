const { z } = require("zod");

const manualCashTransactionTypes = [
  "CASH_IN",
  "CASH_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
];

const cashBoxStatusValues = ["ACTIVE", "INACTIVE"];

const cashTransactionTypeValues = [
  "CASH_IN",
  "CASH_OUT",
  "SALE_PAYMENT",
  "CREDIT_COLLECTION",
  "HANDOVER_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
];

const cashTransactionStatusValues = ["POSTED", "CANCELLED"];

const cashTransactionSourceValues = [
  "MANUAL",
  "SALE",
  "CREDIT_COLLECTION",
  "SYSTEM_ADJUSTMENT",
];

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""));

const createCashTransactionSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Cash box ID is required"),
  }),
  body: z.object({
    type: z.enum(manualCashTransactionTypes),
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    description: z.string().trim().min(3, "Description is required"),
    referenceNo: optionalString,
    transactionDate: z.string().trim().min(1).optional(),
  }),
});

const listCashBoxesSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    status: z.enum(cashBoxStatusValues).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

const cashBoxIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Cash box ID is required"),
  }),
});

const listCashTransactionsSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Cash box ID is required"),
  }),
  query: z.object({
    type: z.enum(cashTransactionTypeValues).optional(),
    status: z.enum(cashTransactionStatusValues).optional(),
    source: z.enum(cashTransactionSourceValues).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

const cashTransactionIdParamSchema = z.object({
  params: z.object({
    transactionId: z.string().trim().min(1, "Cash transaction ID is required"),
  }),
});

const cancelCashTransactionSchema = z.object({
  params: z.object({
    transactionId: z.string().trim().min(1, "Cash transaction ID is required"),
  }),
  body: z.object({
    cancellationReason: z
      .string()
      .trim()
      .min(3, "Cancellation reason is required"),
  }),
});


const createCashHandoverSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Cash box ID is required"),
  }),
  body: z.object({
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    toUserId: z.string().trim().min(1).optional(),
    remarks: optionalString,
  }),
});


const receiveCashHandoverSchema = z.object({
  params: z.object({
    handoverId: z.string().trim().min(1, "Cash handover ID is required"),
  }),
  body: z.object({
    remarks: optionalString,
  }),
});


const cancelCashHandoverSchema = z.object({
  params: z.object({
    handoverId: z.string().trim().min(1, "Cash handover ID is required"),
  }),
  body: z.object({
    cancellationReason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});


const listCashHandoversSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    cashBoxId: z.string().trim().min(1).optional(),
    fromUserId: z.string().trim().min(1).optional(),
    toUserId: z.string().trim().min(1).optional(),
    status: z.enum(["PENDING", "RECEIVED", "CANCELLED"]).optional(),
    dateFrom: z.string().trim().min(1).optional(),
    dateTo: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
});

const cashHandoverIdParamSchema = z.object({
  params: z.object({
    handoverId: z.string().trim().min(1, "Cash handover ID is required"),
  }),
});

const cashCustodianAssignmentOptionsSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
  }),
});

const assignCashCustodianSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    userId: z.string().trim().min(1, "Cash custodian user is required"),
  }),
});

const removeCashCustodianSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    reason: optionalString,
  }),
});

module.exports = {
  createCashTransactionSchema,
  listCashBoxesSchema,
  cashBoxIdParamSchema,
  listCashTransactionsSchema,
  cashTransactionIdParamSchema,
  cancelCashTransactionSchema,
  createCashHandoverSchema,
  receiveCashHandoverSchema,
  cancelCashHandoverSchema,
  listCashHandoversSchema,
  cashHandoverIdParamSchema,
  cashCustodianAssignmentOptionsSchema,
  assignCashCustodianSchema,
  removeCashCustodianSchema,
};
