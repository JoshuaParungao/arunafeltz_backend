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

module.exports = {
  createServiceJobSchema,
};
