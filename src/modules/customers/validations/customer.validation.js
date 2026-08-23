const { z } = require("zod");

const customerStatusValues = ["ACTIVE", "INACTIVE"];

const createCustomerSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch ID is required").optional(),
    customerCode: z
      .string()
      .trim()
      .min(1, "Customer code cannot be empty")
      .optional(),
    fullName: z.string().trim().min(1, "Full name is required"),
    mobileNumber: z
      .string()
      .trim()
      .min(1, "Mobile number cannot be empty")
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .min(1, "Address cannot be empty")
      .optional()
      .nullable(),
    companyName: z
      .string()
      .trim()
      .min(1, "Company name cannot be empty")
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .min(1, "Notes cannot be empty")
      .optional()
      .nullable(),
  }),
});

const listCustomersSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(customerStatusValues).optional(),
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

const customerIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Customer ID is required"),
  }),
});

const customerHistorySchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Customer ID is required"),
  }),
  query: z.object({
    limit: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]*$/, "Limit must be a positive number")
      .optional(),
  }),
});

const updateCustomerSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Customer ID is required"),
  }),
  body: z.object({
    customerCode: z
      .string()
      .trim()
      .min(1, "Customer code cannot be empty")
      .optional(),
    fullName: z
      .string()
      .trim()
      .min(1, "Full name cannot be empty")
      .optional(),
    mobileNumber: z
      .string()
      .trim()
      .min(1, "Mobile number cannot be empty")
      .optional()
      .nullable(),
    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .optional()
      .nullable(),
    address: z
      .string()
      .trim()
      .min(1, "Address cannot be empty")
      .optional()
      .nullable(),
    companyName: z
      .string()
      .trim()
      .min(1, "Company name cannot be empty")
      .optional()
      .nullable(),
    notes: z
      .string()
      .trim()
      .min(1, "Notes cannot be empty")
      .optional()
      .nullable(),
    status: z.enum(customerStatusValues).optional(),
  }),
});

module.exports = {
  createCustomerSchema,
  listCustomersSchema,
  customerIdParamSchema,
  customerHistorySchema,
  updateCustomerSchema,
};
