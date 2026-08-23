const { z } = require("zod");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    return value;
  });

const warrantyStatusEnum = z.enum([
  "CHECKING",
  "SENT_TO_SUPPLIER",
  "APPROVED",
  "REJECTED",
  "REPAIRED",
  "REPLACED",
  "OUT",
]);

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

const warrantyClaimIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Warranty claim ID is required"),
  }),
});

const updateWarrantyClaimStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Warranty claim ID is required"),
  }),
  body: z.object({
    status: warrantyStatusEnum,
    diagnosis: optionalString,
    actionTaken: optionalString,
    supplierName: optionalString,
    supplierReferenceNo: optionalString,
    remarks: optionalString,
  }),
});


const releaseWarrantyClaimSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Warranty claim ID is required"),
  }),
  body: z.object({
    actionTaken: optionalString,
    remarks: optionalString,
  }),
});

module.exports = {
  createWarrantyClaimSchema,
  releaseWarrantyClaimSchema,
  updateWarrantyClaimStatusSchema,
  warrantyClaimIdParamSchema,
};
