const { z } = require("zod");

const supplierStatusValues = ["ACTIVE", "INACTIVE"];

const optionalString = z
  .string()
  .trim()
  .min(1, "Value cannot be empty")
  .optional()
  .nullable();

const createSupplierSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional().nullable(),
    supplierCode: z.string().trim().min(1, "Supplier code cannot be empty").optional(),
    name: z.string().trim().min(1, "Supplier name is required"),
    contactPerson: optionalString,
    contactNo: optionalString,
    email: z.string().trim().email("Invalid email address").optional().nullable(),
    address: optionalString,
    tin: optionalString,
    notes: optionalString,
  }),
});

const listSuppliersSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(supplierStatusValues).optional(),
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

const supplierIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier ID is required"),
  }),
});

const updateSupplierSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier ID is required"),
  }),
  body: z.object({
    supplierCode: z.string().trim().min(1, "Supplier code cannot be empty").optional(),
    name: z.string().trim().min(1, "Supplier name cannot be empty").optional(),
    contactPerson: optionalString,
    contactNo: optionalString,
    email: z.string().trim().email("Invalid email address").optional().nullable(),
    address: optionalString,
    tin: optionalString,
    notes: optionalString,
  }),
});

const updateSupplierStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier ID is required"),
  }),
  body: z.object({
    status: z.enum(supplierStatusValues),
  }),
});

const getSupplierHistorySchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier ID is required"),
  }),
  query: z.object({
    limit: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]*$/, "Limit must be a positive number")
      .optional(),
  }),
});

module.exports = {
  createSupplierSchema,
  listSuppliersSchema,
  supplierIdParamSchema,
  updateSupplierSchema,
  updateSupplierStatusSchema,
  getSupplierHistorySchema,
};
