const { z } = require("zod");

const createBranchSchema = z.object({
  body: z.object({
    code: z
      .string()
      .trim()
      .min(2, "Branch code must be at least 2 characters")
      .max(30, "Branch code must not exceed 30 characters"),
    name: z
      .string()
      .trim()
      .min(2, "Branch name must be at least 2 characters")
      .max(100, "Branch name must not exceed 100 characters"),
    address: z
      .string()
      .trim()
      .max(255, "Address must not exceed 255 characters")
      .optional()
      .nullable(),
    contactNo: z
      .string()
      .trim()
      .max(50, "Contact number must not exceed 50 characters")
      .optional()
      .nullable(),
  }),
});

const updateBranchSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Branch ID is required"),
  }),
  body: z.object({
    code: z
      .string()
      .trim()
      .min(2, "Branch code must be at least 2 characters")
      .max(30, "Branch code must not exceed 30 characters")
      .optional(),
    name: z
      .string()
      .trim()
      .min(2, "Branch name must be at least 2 characters")
      .max(100, "Branch name must not exceed 100 characters")
      .optional(),
    address: z
      .string()
      .trim()
      .max(255, "Address must not exceed 255 characters")
      .optional()
      .nullable(),
    contactNo: z
      .string()
      .trim()
      .max(50, "Contact number must not exceed 50 characters")
      .optional()
      .nullable(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }),
});

const branchIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Branch ID is required"),
  }),
});

const listBranchesSchema = z.object({
  query: z
    .object({
      status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    })
    .strict(),
});

module.exports = {
  createBranchSchema,
  listBranchesSchema,
  updateBranchSchema,
  branchIdParamSchema,
};
