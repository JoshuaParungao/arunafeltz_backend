const { z } = require("zod");

const catalogStatusValues = ["ACTIVE", "INACTIVE"];
const booleanQueryValues = ["true", "false"];

const optionalText = (fieldName) =>
  z
    .string()
    .trim()
    .min(1, `${fieldName} cannot be empty`)
    .optional()
    .nullable();

const nonNegativeMoney = (fieldName) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === "") {
        return "0.00";
      }

      return String(value).trim();
    })
    .refine((value) => Number.isFinite(Number(value)), {
      message: `${fieldName} must be a valid number`,
    })
    .refine((value) => Number(value) >= 0, {
      message: `${fieldName} cannot be negative`,
    });

const optionalNonNegativeMoney = (fieldName) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .refine(
      (value) =>
        value === undefined ||
        value === null ||
        value === "" ||
        Number.isFinite(Number(value)),
      {
        message: `${fieldName} must be a valid number`,
      }
    )
    .refine(
      (value) =>
        value === undefined ||
        value === null ||
        value === "" ||
        Number(value) >= 0,
      {
        message: `${fieldName} cannot be negative`,
      }
    );

const createItemSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1, "Branch ID is required").optional(),

    itemCode: z
      .string()
      .trim()
      .min(1, "Item code cannot be empty")
      .optional(),

    itemName: z.string().trim().min(1, "Item name is required"),

    description: optionalText("Description"),
    barcode: optionalText("Barcode"),
    brand: optionalText("Brand"),
    modelName: optionalText("Model name"),

    categoryId: z.string().trim().min(1, "Category ID is required"),
    unitId: z.string().trim().min(1, "Unit ID is required"),

    isSerialized: z.boolean().optional(),
    hasWarranty: z.boolean().optional(),

    costPrice: nonNegativeMoney("Cost price"),
    price1: nonNegativeMoney("Price 1"),
    price2: nonNegativeMoney("Price 2"),
    price3: nonNegativeMoney("Price 3"),
    price4: nonNegativeMoney("Price 4"),
    price5: nonNegativeMoney("Price 5"),

    minimumStock: nonNegativeMoney("Minimum stock"),
    reorderLevel: nonNegativeMoney("Reorder level"),
  }),
});

const listItemsSchema = z.object({
  query: z.object({
    search: z.string().trim().optional(),

    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    categoryId: z
      .string()
      .trim()
      .min(1, "Category ID cannot be empty")
      .optional(),
    unitId: z.string().trim().min(1, "Unit ID cannot be empty").optional(),

    status: z.enum(catalogStatusValues).optional(),
    isSerialized: z.enum(booleanQueryValues).optional(),
    hasWarranty: z.enum(booleanQueryValues).optional(),

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

const itemIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Item ID is required"),
  }),
});

const updateItemSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Item ID is required"),
  }),
  body: z.object({
    itemCode: z
      .string()
      .trim()
      .min(1, "Item code cannot be empty")
      .optional(),

    itemName: z.string().trim().min(1, "Item name cannot be empty").optional(),

    description: optionalText("Description"),
    barcode: optionalText("Barcode"),
    brand: optionalText("Brand"),
    modelName: optionalText("Model name"),

    categoryId: z
      .string()
      .trim()
      .min(1, "Category ID cannot be empty")
      .optional(),

    unitId: z.string().trim().min(1, "Unit ID cannot be empty").optional(),

    status: z.enum(catalogStatusValues).optional(),

    isSerialized: z.boolean().optional(),
    hasWarranty: z.boolean().optional(),

    costPrice: optionalNonNegativeMoney("Cost price"),
    price1: optionalNonNegativeMoney("Price 1"),
    price2: optionalNonNegativeMoney("Price 2"),
    price3: optionalNonNegativeMoney("Price 3"),
    price4: optionalNonNegativeMoney("Price 4"),
    price5: optionalNonNegativeMoney("Price 5"),

    minimumStock: optionalNonNegativeMoney("Minimum stock"),
    reorderLevel: optionalNonNegativeMoney("Reorder level"),
  }),
});

module.exports = {
  createItemSchema,
  listItemsSchema,
  itemIdParamSchema,
  updateItemSchema,
};
