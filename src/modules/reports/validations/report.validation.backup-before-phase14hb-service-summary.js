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

module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
};
