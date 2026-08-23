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

module.exports = {
  loginSchema,
};
