const { z } = require("zod");

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) return undefined;
    return value;
  });

const supplierReturnStatusEnum = z.enum([
  "DRAFT",
  "APPROVED",
  "OUT_TO_SUPPLIER",
  "PARTIALLY_RESOLVED",
  "RESOLVED",
  "CANCELLED",
]);

const supplierReturnSourceTypeEnum = z.enum([
  "STORE_DEFECT",
  "CUSTOMER_WARRANTY",
  "CUSTOMER_RETURN",
  "MIXED",
]);

const supplierReturnItemSourceTypeEnum = z.enum([
  "STORE_DEFECT",
  "CUSTOMER_WARRANTY",
  "CUSTOMER_RETURN",
]);

const supplierReturnResolutionTypeEnum = z.enum([
  "PENDING",
  "REPLACEMENT",
  "REPAIRED",
  "CREDIT_MEMO",
  "REFUND",
  "RETURN_TO_CUSTOMER_DEFECTIVE",
  "SCRAP_SHRINKAGE",
  "MIXED",
]);

const supplierReturnItemResolutionStatusEnum = z.enum([
  "PENDING",
  "REPLACED",
  "REPAIRED",
  "CREDIT_MEMO",
  "REFUND",
  "RETURNED_DEFECTIVE",
  "SCRAPPED",
]);

const supplierReturnItemInputSchema = z.object({
  id: optionalString,
  itemId: z.string().trim().min(1, "Item ID is required"),
  itemSerialId: optionalString,
  quantity: z.coerce.number().positive("Quantity must be greater than 0").default(1),
  unitCost: z.coerce.number().min(0, "Unit cost must be at least 0").optional().default(0),
  defectReason: z.string().trim().min(1, "Defect reason / problem description is required"),
  defectCategory: optionalString,
  sourceType: supplierReturnItemSourceTypeEnum.default("STORE_DEFECT"),
  warrantyClaimId: optionalString,
  returnRequestId: optionalString,
});

const createSupplierReturnSchema = z.object({
  body: z.object({
    branchId: optionalString,
    supplierId: z.string().trim().min(1, "Supplier ID is required"),
    supplierRmaNumber: optionalString,
    sourceType: supplierReturnSourceTypeEnum.default("STORE_DEFECT"),
    notes: optionalString,
    internalNotes: optionalString,
    expectedResolutionDate: optionalString,
    driverName: optionalString,
    driverContact: optionalString,
    vehiclePlate: optionalString,
    courierName: optionalString,
    trackingNumber: optionalString,
    items: z
      .array(supplierReturnItemInputSchema)
      .min(1, "At least one defective / bad order item is required"),
  }),
});

const updateSupplierReturnSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier return ID is required"),
  }),
  body: z.object({
    supplierId: z.string().trim().min(1, "Supplier ID is required").optional(),
    supplierRmaNumber: optionalString,
    sourceType: supplierReturnSourceTypeEnum.optional(),
    notes: optionalString,
    internalNotes: optionalString,
    expectedResolutionDate: optionalString,
    driverName: optionalString,
    driverContact: optionalString,
    vehiclePlate: optionalString,
    courierName: optionalString,
    trackingNumber: optionalString,
    items: z.array(supplierReturnItemInputSchema).min(1, "At least one item is required").optional(),
  }),
});

const supplierReturnIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier return ID is required"),
  }),
});

const approveSupplierReturnSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier return ID is required"),
  }),
  body: z
    .object({
      notes: optionalString,
    })
    .optional(),
});

const dispatchSupplierReturnSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier return ID is required"),
  }),
  body: z.object({
    driverName: optionalString,
    driverContact: optionalString,
    vehiclePlate: optionalString,
    courierName: optionalString,
    trackingNumber: optionalString,
    dispatchDate: optionalString,
    notes: optionalString,
  }),
});

const resolveItemOutcomeSchema = z.object({
  supplierReturnItemId: z.string().trim().min(1, "Supplier return item ID is required"),
  resolutionStatus: supplierReturnItemResolutionStatusEnum,
  resolutionNotes: optionalString,
  replacementItemId: optionalString,
  replacementSerialId: optionalString,
  replacementSerialNumber: optionalString,
});

const resolveSupplierReturnSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier return ID is required"),
  }),
  body: z.object({
    resolutionType: supplierReturnResolutionTypeEnum,
    creditMemoNumber: optionalString,
    creditMemoAmount: z.coerce.number().min(0).optional().default(0),
    refundAmount: z.coerce.number().min(0).optional().default(0),
    resolutionNotes: optionalString,
    rejectionReason: optionalString,
    items: z.array(resolveItemOutcomeSchema).optional(),
  }),
});

const cancelSupplierReturnSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Supplier return ID is required"),
  }),
  body: z.object({
    reason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});

const listSupplierReturnsSchema = z.object({
  query: z.object({
    search: optionalString,
    status: optionalString,
    sourceType: optionalString,
    resolutionType: optionalString,
    supplierId: optionalString,
    branchId: optionalString,
    startDate: optionalString,
    endDate: optionalString,
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().optional().default(10),
  }),
});

const getEligibleDefectsSchema = z.object({
  query: z.object({
    sourceType: optionalString,
    supplierId: optionalString,
    branchId: optionalString,
    search: optionalString,
  }),
});

module.exports = {
  createSupplierReturnSchema,
  updateSupplierReturnSchema,
  supplierReturnIdParamSchema,
  approveSupplierReturnSchema,
  dispatchSupplierReturnSchema,
  resolveSupplierReturnSchema,
  cancelSupplierReturnSchema,
  listSupplierReturnsSchema,
  getEligibleDefectsSchema,
};
