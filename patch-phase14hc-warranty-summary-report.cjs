const fs = require("fs");
const path = require("path");

const root = process.cwd();

const validationPath = path.join(root, "src/modules/reports/validations/report.validation.js");
const servicePath = path.join(root, "src/modules/reports/services/report.service.js");
const controllerPath = path.join(root, "src/modules/reports/controllers/report.controller.js");
const routePath = path.join(root, "src/modules/reports/routes/report.routes.js");

let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("const warrantySummarySchema")) {
  const marker = `const serviceSummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["PENDING", "IN_PROGRESS", "READY_FOR_RELEASE", "COMPLETED", "CANCELLED"]).optional(),
    paymentMethod: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(),
    assignedTechnicianId: z.string().trim().min(1, "Assigned technician ID cannot be empty").optional(),
    customerId: z.string().trim().min(1, "Customer ID cannot be empty").optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  const addition = `${marker}

const warrantySummarySchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1, "Branch ID cannot be empty").optional(),
    status: z.enum(["IN", "CHECKING", "SENT_TO_SUPPLIER", "APPROVED", "REJECTED", "REPAIRED", "REPLACED", "OUT"]).optional(),
    customerId: z.string().trim().min(1, "Customer ID cannot be empty").optional(),
    itemId: z.string().trim().min(1, "Item ID cannot be empty").optional(),
    serialId: z.string().trim().min(1, "Serial ID cannot be empty").optional(),
    supplierName: z.string().trim().optional(),
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: optionalPositiveIntegerString,
    limit: optionalPositiveIntegerString,
  }),
});`;

  if (!validation.includes(marker)) {
    throw new Error("serviceSummarySchema block not found. Patch stopped.");
  }

  validation = validation.replace(marker, addition);
}

if (!validation.includes("warrantySummarySchema,")) {
  validation = validation.replace(
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
};`,
    `module.exports = {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
};`
  );
}

fs.writeFileSync(validationPath, validation);

let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const buildWarrantySummaryRecord =")) {
  const warrantySummaryCode = `
const buildWarrantySummaryRecord = (claim) => {
  return {
    id: claim.id,
    claimCode: claim.claimCode,
    status: claim.status,
    issueDescription: claim.issueDescription,
    customerComplaint: claim.customerComplaint,
    diagnosis: claim.diagnosis,
    actionTaken: claim.actionTaken,
    supplierName: claim.supplierName,
    supplierReferenceNo: claim.supplierReferenceNo,
    receivedAt: claim.receivedAt,
    checkingAt: claim.checkingAt,
    sentToSupplierAt: claim.sentToSupplierAt,
    approvedAt: claim.approvedAt,
    rejectedAt: claim.rejectedAt,
    repairedAt: claim.repairedAt,
    replacedAt: claim.replacedAt,
    releasedAt: claim.releasedAt,
    isReleased: Boolean(claim.releasedAt) || claim.status === "OUT",
    branch: claim.branch,
    customer: claim.customer,
    item: claim.item,
    serial: claim.serial,
    sale: claim.sale,
  };
};

const getWarrantySummary = async (actor, query = {}) => {
  const branchId = resolveBranchFilter(actor, query.branchId);
  const { page, limit, skip } = parsePagination(query);
  const receivedAt = parseDateRange(query);

  const where = {
    ...(branchId ? { branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.itemId ? { itemId: query.itemId } : {}),
    ...(query.serialId ? { serialId: query.serialId } : {}),
    ...(receivedAt ? { receivedAt } : {}),
    ...(query.supplierName
      ? {
          supplierName: {
            contains: String(query.supplierName).trim(),
            mode: "insensitive",
          },
        }
      : {}),
  };

  const allClaims = await prisma.warrantyClaim.findMany({
    where,
    orderBy: [
      {
        receivedAt: "desc",
      },
      {
        claimCode: "desc",
      },
    ],
    select: {
      id: true,
      claimCode: true,
      status: true,
      issueDescription: true,
      customerComplaint: true,
      diagnosis: true,
      actionTaken: true,
      supplierName: true,
      supplierReferenceNo: true,
      receivedAt: true,
      checkingAt: true,
      sentToSupplierAt: true,
      approvedAt: true,
      rejectedAt: true,
      repairedAt: true,
      replacedAt: true,
      releasedAt: true,
      branch: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      customer: {
        select: {
          id: true,
          customerCode: true,
          fullName: true,
          mobileNumber: true,
        },
      },
      item: {
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          brand: true,
          modelName: true,
        },
      },
      serial: {
        select: {
          id: true,
          serialNumber: true,
          status: true,
        },
      },
      sale: {
        select: {
          id: true,
          receiptCode: true,
          status: true,
          saleDate: true,
        },
      },
    },
  });

  const records = allClaims.map(buildWarrantySummaryRecord);

  const totals = records.reduce(
    (acc, claim) => {
      acc.totalClaims += 1;

      if (claim.isReleased) {
        acc.totalReleased += 1;
      } else {
        acc.totalOpen += 1;
      }

      if (claim.supplierName) {
        acc.totalWithSupplier += 1;
        acc.supplierCounts[claim.supplierName] =
          (acc.supplierCounts[claim.supplierName] || 0) + 1;
      }

      acc.statusCounts[claim.status] = (acc.statusCounts[claim.status] || 0) + 1;

      return acc;
    },
    {
      totalClaims: 0,
      totalOpen: 0,
      totalReleased: 0,
      totalWithSupplier: 0,
      statusCounts: {},
      supplierCounts: {},
    }
  );

  const paginatedRecords = records.slice(skip, skip + limit);
  const totalItems = records.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;

  return {
    report: {
      name: "Warranty Summary",
      generatedAt: new Date(),
      filters: {
        branchId: branchId || null,
        status: query.status || null,
        customerId: query.customerId || null,
        itemId: query.itemId || null,
        serialId: query.serialId || null,
        supplierName: query.supplierName || null,
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
      },
      totals,
    },
    records: paginatedRecords,
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};
`;

  const marker = `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
};`;

  if (!service.includes(marker)) {
    throw new Error("Current module.exports block not found. Patch stopped.");
  }

  service = service.replace(
    marker,
    `${warrantySummaryCode}
module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
};`
  );
}

fs.writeFileSync(servicePath, service);

let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("const getWarrantySummary =")) {
  const marker = `const getServiceSummary = asyncHandler(async (req, res) => {
  const result = await reportService.getServiceSummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Service summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  const addition = `${marker}

const getWarrantySummary = asyncHandler(async (req, res) => {
  const result = await reportService.getWarrantySummary(req.user, req.query);

  return sendSuccess(res, {
    message: "Warranty summary report retrieved successfully",
    data: {
      report: result.report,
      records: result.records,
    },
    meta: result.meta,
  });
});`;

  if (!controller.includes(marker)) {
    throw new Error("getServiceSummary controller block not found. Patch stopped.");
  }

  controller = controller.replace(marker, addition);
}

if (!controller.includes("getWarrantySummary,")) {
  controller = controller.replace(
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
};`,
    `module.exports = {
  getInventorySummary,
  getSalesSummary,
  getServiceSummary,
  getWarrantySummary,
};`
  );
}

fs.writeFileSync(controllerPath, controller);

let routes = fs.readFileSync(routePath, "utf8");

if (!routes.includes("warrantySummarySchema")) {
  routes = routes.replace(
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
} = require("../validations/report.validation");`,
    `const {
  inventorySummarySchema,
  salesSummarySchema,
  serviceSummarySchema,
  warrantySummarySchema,
} = require("../validations/report.validation");`
  );
}

if (!routes.includes('"/warranty-summary"')) {
  const marker = `router.get(
  "/service-summary",
  validate(serviceSummarySchema),
  reportController.getServiceSummary
);`;

  const addition = `${marker}

router.get(
  "/warranty-summary",
  validate(warrantySummarySchema),
  reportController.getWarrantySummary
);`;

  if (!routes.includes(marker)) {
    throw new Error("service-summary route block not found. Patch stopped.");
  }

  routes = routes.replace(marker, addition);
}

fs.writeFileSync(routePath, routes);

console.log("DONE: Phase 14H-C warranty summary report patched.");
