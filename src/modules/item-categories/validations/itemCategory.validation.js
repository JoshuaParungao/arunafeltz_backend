const { z } = require("zod");

const catalogStatusValues = ["ACTIVE", "INACTIVE"];

const createItemCategorySchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch ID is required").optional(),
    categoryCode: z
      .string()
      .trim()
      .min(1, "Category code cannot be empty")
      .optional(),
    name: z.string().trim().min(1, "Category name is required"),
    description: z
      .string()
      .trim()
      .min(1, "Description cannot be empty")
      .optional()
      .nullable(),
  }),
});

const listItemCategoriesSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
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

const itemCategoryIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Category ID is required"),
  }),
});

const updateItemCategorySchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Category ID is required"),
  }),
  body: z.object({
    categoryCode: z
      .string()
      .trim()
      .min(1, "Category code cannot be empty")
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, "Category name cannot be empty")
      .optional(),
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
  createItemCategorySchema,
  listItemCategoriesSchema,
  itemCategoryIdParamSchema,
  updateItemCategorySchema,
};
