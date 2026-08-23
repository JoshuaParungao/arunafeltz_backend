const { z } = require("zod");

const catalogStatusValues = ["ACTIVE", "INACTIVE"];

const createUnitSchema = z.object({
  body: z.object({
    unitCode: z.string().trim().min(1, "Unit code is required"),
    name: z.string().trim().min(1, "Unit name is required"),
    description: z
      .string()
      .trim()
      .min(1, "Description cannot be empty")
      .optional()
      .nullable(),
  }),
});

const listUnitsSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    status: z.enum(catalogStatusValues).optional(),
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

const unitIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Unit ID is required"),
  }),
});

const updateUnitSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Unit ID is required"),
  }),
  body: z.object({
    unitCode: z
      .string()
      .trim()
      .min(1, "Unit code cannot be empty")
      .optional(),
    name: z.string().trim().min(1, "Unit name cannot be empty").optional(),
    description: z
      .string()
      .trim()
      .min(1, "Description cannot be empty")
      .optional()
      .nullable(),
    status: z.enum(catalogStatusValues).optional(),
  }),
});

module.exports = {
  createUnitSchema,
  listUnitsSchema,
  unitIdParamSchema,
  updateUnitSchema,
};
