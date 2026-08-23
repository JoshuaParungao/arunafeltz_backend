const { z } = require("zod");
const { USER_ROLES } = require("../../../constants/roles");

const userRoleValues = Object.values(USER_ROLES);

const assignableUserRoleValues = [
  USER_ROLES.SUPER_OWNER,
  USER_ROLES.ADMIN,
  USER_ROLES.CASHIER,
  USER_ROLES.TECHNICIAN,
];
const incentiveClassificationValues = [
  "NONE",
  "SALES_AGENT",
  "SENIOR_SALES_AGENT",
  "TECHNICIAN",
  "SENIOR_TECHNICIAN",
];

const userStatusValues = ["PENDING", "ACTIVE", "REJECTED", "DISABLED"];

const optionalNullableText = (maxLength, label) =>
  z
    .string()
    .trim()
    .max(maxLength, `${label} must not exceed ${maxLength} characters`)
    .optional()
    .nullable();

const createUserSchema = z.object({
  body: z
    .object({
      employeeCode: optionalNullableText(50, "Employee code"),
      username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .max(50, "Username must not exceed 50 characters"),
      email: z
        .string()
        .trim()
        .email("Invalid email")
        .max(254, "Email must not exceed 254 characters")
        .optional()
        .nullable(),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password must not exceed 128 characters"),
      firstName: z
        .string()
        .trim()
        .min(1, "First name is required")
        .max(100, "First name must not exceed 100 characters"),
      middleName: optionalNullableText(100, "Middle name"),
      lastName: z
        .string()
        .trim()
        .min(1, "Last name is required")
        .max(100, "Last name must not exceed 100 characters"),
      role: z.enum(assignableUserRoleValues),
      incentiveClassification: z
        .enum(incentiveClassificationValues)
        .optional()
        .default("NONE"),
      branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional().nullable(),
    })
    .strict(),
});

const updateUserSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "User ID is required"),
  }),
  body: z
    .object({
      employeeCode: optionalNullableText(50, "Employee code"),
      username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .max(50, "Username must not exceed 50 characters")
        .optional(),
      email: z
        .string()
        .trim()
        .email("Invalid email")
        .max(254, "Email must not exceed 254 characters")
        .optional()
        .nullable(),
      firstName: z
        .string()
        .trim()
        .min(1, "First name is required")
        .max(100, "First name must not exceed 100 characters")
        .optional(),
      middleName: optionalNullableText(100, "Middle name"),
      lastName: z
        .string()
        .trim()
        .min(1, "Last name is required")
        .max(100, "Last name must not exceed 100 characters")
        .optional(),
      role: z.enum(assignableUserRoleValues).optional(),
      incentiveClassification: z.enum(incentiveClassificationValues).optional(),
      branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional().nullable(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one user field is required",
    }),
});

const listUsersSchema = z.object({
  query: z
    .object({
      search: z.string().trim().max(100).optional(),
      status: z.enum(userStatusValues).optional(),
      role: z.enum(userRoleValues).optional(),
      incentiveClassification: z.enum(incentiveClassificationValues).optional(),
      branchId: z.string().trim().min(1).optional(),
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .strict(),
});

const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "User ID is required"),
  }),
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  listUsersSchema,
  userIdParamSchema,
};
