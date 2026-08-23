const { z } = require("zod");

const positiveNumberString = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]*$/, "Value must be a positive number")
  .optional();

const optionalString = z.string().trim().min(1, "Value cannot be empty").optional();

const optionalDateString = z
  .string()
  .trim()
  .datetime("Invalid date format")
  .optional();

const listAuditLogsSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    branchId: optionalString,
    actorId: optionalString,
    action: optionalString,
    entityType: optionalString,
    entityId: optionalString,
    dateFrom: optionalDateString,
    dateTo: optionalDateString,
    page: positiveNumberString,
    limit: positiveNumberString,
  }),
});

const auditLogIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Audit log ID is required"),
  }),
});

module.exports = {
  listAuditLogsSchema,
  auditLogIdParamSchema,
};
