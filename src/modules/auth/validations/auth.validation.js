const { z } = require("zod");

const loginSchema = z.object({
  body: z.object({
    identifier: z
      .string()
      .trim()
      .min(1, "Username or email is required")
      .max(254, "Username or email is too long"),
    password: z
      .string()
      .min(1, "Password is required")
      .max(128, "Password is too long"),
  }).strict(),
});

const updateProfileSchema = z.object({
  body: z
    .object({
      firstName: z
        .string()
        .trim()
        .min(1, "First name is required")
        .max(100, "First name must not exceed 100 characters")
        .optional(),
      middleName: z
        .string()
        .trim()
        .max(100, "Middle name must not exceed 100 characters")
        .optional()
        .nullable(),
      lastName: z
        .string()
        .trim()
        .min(1, "Last name is required")
        .max(100, "Last name must not exceed 100 characters")
        .optional(),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(254, "Username is too long")
        .optional(),
      email: z
        .string()
        .trim()
        .email("Please provide a valid email address")
        .max(254, "Email is too long")
        .optional()
        .nullable(),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password is too long")
        .optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one profile field is required",
    }),
});

module.exports = {
  loginSchema,
  updateProfileSchema,
};
