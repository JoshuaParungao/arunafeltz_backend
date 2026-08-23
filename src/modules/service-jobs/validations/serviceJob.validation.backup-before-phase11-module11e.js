const { z } = require("zod");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) {
      return undefined;
    }

    return value;
  });

const nonNegativeMoney = z.coerce
  .number()
  .min(0, "Amount must not be negative");

const createServiceJobSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1).optional(),
    customerId: z.string().trim().min(1).optional(),
    assignedTechnicianId: z.string().trim().min(1).optional(),

    jobTitle: z.string().trim().min(1, "Job title is required"),
    deviceDescription: optionalString,
    problemDescription: optionalString,
    diagnosis: optionalString,
    serviceNotes: optionalString,

    estimatedServiceCharge: nonNegativeMoney.optional().default(0),
  }),
});


const serviceJobIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Service job ID is required"),
  }),
});

const updateServiceJobStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Service job ID is required"),
  }),
  body: z.object({
    status: z.enum([
      "IN_PROGRESS",
      "READY_FOR_RELEASE",
      "COMPLETED",
      "CANCELLED",
    ]),
    diagnosis: optionalString,
    serviceNotes: optionalString,
    finalServiceCharge: nonNegativeMoney.optional(),
    cancellationReason: optionalString,
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
    customerId: z.string().trim().min(1).optional(),
    assignedTechnicianId: z.string().trim().min(1).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
});

module.exports = {
  createServiceJobSchema,
  listServiceJobsSchema,
  serviceJobIdParamSchema,
  updateServiceJobStatusSchema,
};
