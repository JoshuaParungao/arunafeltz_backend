const { z } = require("zod");

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

module.exports = {
  createItemSchema,
};
