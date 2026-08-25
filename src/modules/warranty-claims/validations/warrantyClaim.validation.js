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



const listWarrantyClaimsSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    status: z
      .enum([
        "IN",
        "CHECKING",
        "SENT_TO_SUPPLIER",
        "APPROVED",
        "REJECTED",
        "REPAIRED",
        "REPLACED",
        "OUT",
      ])
      .optional(),
    customerId: z.string().trim().min(1).optional(),
    itemId: z.string().trim().min(1).optional(),
    serialId: z.string().trim().min(1).optional(),
    saleId: z.string().trim().min(1).optional(),
    saleItemId: z.string().trim().min(1).optional(),
    supplierName: z.string().trim().optional(),
    search: z.string().trim().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
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

const immediateReplacementSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Warranty claim ID is required"),
  }),
  body: z.object({
    replacementItemId: optionalString,
    replacementBatchId: optionalString,
    replacementSerialId: optionalString,
    replacementSerialNumber: optionalString,
    replacementWarrantyType: optionalString,
    replacementWarrantyDuration: optionalString,
    actionTaken: optionalString,
    remarks: optionalString,
  }),
});

const dispatchSupplierSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Warranty claim ID is required"),
  }),
  body: z.object({
    supplierName: z.string().trim().min(1, "Supplier name is required"),
    supplierReferenceNo: optionalString,
    remarks: optionalString,
  }),
});

const resolveSupplierRmaSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Warranty claim ID is required"),
  }),
  body: z.object({
    outcome: z.enum(["REPLACED_BY_SUPPLIER", "REPAIRED", "REJECTED"]),
    rejectionReason: optionalString,
    newSerial: optionalString,
    actionTaken: optionalString,
    remarks: optionalString,
  }),
});

const rejectCustomerClaimSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Warranty claim ID is required"),
  }),
  body: z.object({
    rejectionReason: z.string().trim().min(1, "Rejection reason is required"),
    remarks: optionalString,
  }),
});

module.exports = {
  createWarrantyClaimSchema,
  listWarrantyClaimsSchema,
  releaseWarrantyClaimSchema,
  updateWarrantyClaimStatusSchema,
  warrantyClaimIdParamSchema,
  immediateReplacementSchema,
  dispatchSupplierSchema,
  resolveSupplierRmaSchema,
  rejectCustomerClaimSchema,
};
