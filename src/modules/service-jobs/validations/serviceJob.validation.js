const { z } = require("zod");

const optionalString = (maxLength = 2000) =>
  z
    .string()
    .trim()
    .max(maxLength, `Value must not exceed ${maxLength} characters`)
    .optional()
    .transform((value) => value || undefined);

const nonNegativeMoney = z.coerce
  .number()
  .finite("Amount must be a finite number")
  .min(0, "Amount must not be negative")
  .max(9999999999.99, "Amount exceeds the supported limit");

const repairType = z.enum(["ORDINARY_REPAIR", "BOARD_LEVEL_REPAIR"]);
const immediatePaymentMethod = z.enum([
  "CASH",
  "GCASH",
  "BANK_TRANSFER",
  "OTHER",
]);
const receivableProvider = z.enum([
  "CREDIT_CARD",
  "DEBIT_CARD",
  "HOMECREDIT",
  "SALMON",
  "SKYRO",
  "KYRO",
  "OTHER_FINANCING",
  "IN_HOUSE_INSTALLMENT",
]);
const installmentTerm = z.enum([
  "CASH_PROMO",
  "STRAIGHT",
  "MONTH_3",
  "MONTH_6",
  "MONTH_9",
  "MONTH_12",
  "MONTH_18",
  "MONTH_24",
]);

const receivableSchema = z
  .object({
    provider: receivableProvider,
    providerReferenceNo: optionalString(180),
    term: installmentTerm.optional(),
    dueDay: z.coerce.number().int().min(1).max(31).optional(),
    firstDueDate: z.coerce.date().optional(),
    remarks: optionalString(1000),
  })
  .superRefine((receivable, context) => {
    const isInHouse = receivable.provider === "IN_HOUSE_INSTALLMENT";

    if (isInHouse && !receivable.term) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Installment term is required for in-house receivables",
        path: ["term"],
      });
    }
  });

const optionalMarkupPercent = z.coerce
  .number()
  .finite("Mark up percentage must be a finite number")
  .min(0, "Mark up percentage cannot be negative")
  .lt(100, "Mark up percentage must be less than 100")
  .optional();

const serviceJobIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Service job ID is required"),
  }),
});

const createServiceJobSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1).optional(),
    customerId: z.string().trim().min(1).optional(),
    assignedTechnicianId: z.string().trim().min(1).optional(),
    repairType,

    jobTitle: z
      .string()
      .trim()
      .min(1, "Job title is required")
      .max(180, "Job title must not exceed 180 characters"),
    deviceDescription: optionalString(500),
    problemDescription: optionalString(2000),
    diagnosis: optionalString(2000),
    serviceNotes: optionalString(3000),
    customerNameSnapshot: optionalString(180),
    customerContactSnapshot: optionalString(250),
    serialNumber: optionalString(180),
    accessoriesReceived: optionalString(1200),
    receivingRemarks: optionalString(2000),
    isQuickService: z.boolean().optional().default(false),

    estimatedServiceCharge: nonNegativeMoney.optional().default(0),
    baseServiceCharge: nonNegativeMoney.optional(),
    markupPercent: optionalMarkupPercent,
  }),
});

const updateServiceJobStatusSchema = z.object({
  params: serviceJobIdParamSchema.shape.params,
  body: z.object({
    status: z
      .enum([
        "PENDING",
        "IN_PROGRESS",
        "READY_FOR_RELEASE",
        "COMPLETED",
        "CANCELLED",
      ])
      .optional(),
    diagnosis: optionalString(2000),
    serviceNotes: optionalString(3000),
    repairType: repairType.optional(),
    serviceDoneById: z.string().trim().min(1).optional(),
    baseServiceCharge: nonNegativeMoney.optional(),
    markupPercent: optionalMarkupPercent,
    finalServiceCharge: nonNegativeMoney.optional(),
    cancellationReason: optionalString(2000),
    releaseOutcome: z.enum(["REPAIRED", "SERVICE_COMPLETED"]).optional(),
    releaseNotes: optionalString(2000),
  }),
});

const updateServiceJobAssignmentSchema = z.object({
  params: serviceJobIdParamSchema.shape.params,
  body: z.object({
    assignedTechnicianId: z
      .union([z.string().trim().min(1, "Assigned technician ID is required"), z.null()]),
  }),
});

const releaseServiceJobSchema = z.object({
  params: serviceJobIdParamSchema.shape.params,
  body: z
    .object({
      releaseOutcome: z.enum([
        "REPAIRED",
        "SERVICE_COMPLETED",
        "UNREPAIRED",
        "CUSTOMER_PULL_OUT",
        "NO_FAULT_FOUND",
        "DECLINED",
        "OTHER",
      ]),
      releaseNotes: optionalString(2000),
      repairType: repairType.optional(),
      serviceDoneById: z.string().trim().min(1).optional(),
      baseServiceCharge: nonNegativeMoney.optional(),
      markupPercent: optionalMarkupPercent,
      finalServiceCharge: nonNegativeMoney.optional(),
      diagnosis: optionalString(2000),
      serviceNotes: optionalString(3000),
    })
    .superRefine((body, context) => {
      if (body.releaseOutcome === "OTHER" && !body.releaseNotes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Release notes are required for an OTHER outcome",
          path: ["releaseNotes"],
        });
      }
    }),
});

const listServiceJobsSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    status: z
      .enum([
        "PENDING",
        "IN_PROGRESS",
        "READY_FOR_RELEASE",
        "COMPLETED",
        "CANCELLED",
      ])
      .optional(),
    releaseOutcome: z
      .enum([
        "REPAIRED",
        "SERVICE_COMPLETED",
        "UNREPAIRED",
        "CUSTOMER_PULL_OUT",
        "NO_FAULT_FOUND",
        "DECLINED",
        "OTHER",
      ])
      .optional(),
    isQuickService: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    customerId: z.string().trim().min(1).optional(),
    assignedTechnicianId: z.string().trim().min(1).optional(),
    serviceDoneById: z.string().trim().min(1).optional(),
    repairType: repairType.optional(),
    search: z.string().trim().max(120).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
});

const listServiceTechniciansSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    repairType: repairType.optional(),
    search: z.string().trim().max(120).optional(),
  }),
});

const createServicePaymentSchema = z.object({
  params: serviceJobIdParamSchema.shape.params,
  body: z
    .object({
      paymentMethod: immediatePaymentMethod.optional(),
      amount: nonNegativeMoney.optional(),
      referenceNo: optionalString(180),
      remarks: optionalString(1000),
      paidAt: z.coerce.date().optional(),
      receivable: receivableSchema.optional(),
      idempotencyKey: z.string().uuid().optional(),
    })
    .superRefine((body, context) => {
      const amount = Number(body.amount || 0);

      if (amount <= 0 && !body.receivable) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A payment amount or receivable is required",
          path: ["amount"],
        });
      }

      if (amount > 0 && !body.paymentMethod) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Payment method is required for an immediate settlement",
          path: ["paymentMethod"],
        });
      }
    }),
});

const cancelServicePaymentSchema = z.object({
  params: z.object({
    paymentId: z.string().trim().min(1, "Service payment ID is required"),
  }),
  body: z.object({
    cancellationReason: z
      .string()
      .trim()
      .min(3, "Cancellation reason is required")
      .max(2000),
  }),
});

const createServiceCatalogItemSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, "Service name is required").max(180),
    deviceType: z.string().trim().min(1, "Unit/Device type is required").max(100),
    repairType: z.enum(["ORDINARY_REPAIR", "BOARD_LEVEL_REPAIR"]),
    basePrice: z.coerce.number().min(0, "Base price cannot be negative").max(9999999999.99),
    markupPercent: z.coerce.number().min(0).max(1000).default(0),
    description: z.string().trim().max(2000).optional().nullable(),
    isQuickService: z.boolean().default(false),
    isActive: z.boolean().default(true),
  }),
});

const updateServiceCatalogItemSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Service catalog item ID is required"),
  }),
  body: z.object({
    name: z.string().trim().min(2, "Service name is required").max(180).optional(),
    deviceType: z.string().trim().min(1, "Unit/Device type is required").max(100).optional(),
    repairType: z.enum(["ORDINARY_REPAIR", "BOARD_LEVEL_REPAIR"]).optional(),
    basePrice: z.coerce.number().min(0, "Base price cannot be negative").max(9999999999.99).optional(),
    markupPercent: z.coerce.number().min(0).max(1000).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    isQuickService: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

const serviceCatalogIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Service catalog item ID is required"),
  }),
});

module.exports = {
  cancelServicePaymentSchema,
  createServiceCatalogItemSchema,
  createServiceJobSchema,
  createServicePaymentSchema,
  listServiceJobsSchema,
  listServiceTechniciansSchema,
  releaseServiceJobSchema,
  serviceCatalogIdParamSchema,
  serviceJobIdParamSchema,
  updateServiceCatalogItemSchema,
  updateServiceJobAssignmentSchema,
  updateServiceJobStatusSchema,
};
