const { z } = require("zod");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    return value;
  });

const createWarrantyClaimSchema = z.object({
  body: z.object({
    branchId: z.string().trim().min(1).optional(),
    customerId: z.string().trim().min(1).optional(),
    itemId: z.string().trim().min(1).optional(),
    serialId: z.string().trim().min(1).optional(),
    saleId: z.string().trim().min(1).optional(),
    saleItemId: z.string().trim().min(1).optional(),

    issueDescription: z.string().trim().min(1, "Issue description is required"),
    customerComplaint: optionalString,
    diagnosis: optionalString,
    actionTaken: optionalString,
    supplierName: optionalString,
    supplierReferenceNo: optionalString,
    remarks: optionalString,
  }),
});

module.exports = {
  createWarrantyClaimSchema,
};
