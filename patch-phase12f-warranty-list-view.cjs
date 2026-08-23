const fs = require("fs");

const validationPath = "./src/modules/warranty-claims/validations/warrantyClaim.validation.js";
const servicePath = "./src/modules/warranty-claims/services/warrantyClaim.service.js";
const controllerPath = "./src/modules/warranty-claims/controllers/warrantyClaim.controller.js";
const routePath = "./src/modules/warranty-claims/routes/warrantyClaim.routes.js";

/* =========================
   VALIDATION
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("listWarrantyClaimsSchema")) {
  const listSchemaBlock = `
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
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
});

`;

  validation = validation.replace(
    "const releaseWarrantyClaimSchema = z.object({",
    listSchemaBlock + "const releaseWarrantyClaimSchema = z.object({"
  );
}

if (!validation.includes("  listWarrantyClaimsSchema,")) {
  validation = validation.replace(
    "  createWarrantyClaimSchema,",
    "  createWarrantyClaimSchema,\n  listWarrantyClaimsSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const VIEW_WARRANTY_CLAIM_ROLES")) {
  const viewRoleBlock = `
const VIEW_WARRANTY_CLAIM_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
  "TECHNICIAN",
]);

const ensureCanViewWarrantyClaim = (actor) => {
  if (!VIEW_WARRANTY_CLAIM_ROLES.has(actor.role)) {
    const error = new Error("WARRANTY_CLAIM_VIEW_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

`;

  service = service.replace(
    "const RELEASE_WARRANTY_STATUS_ROLES = new Set([",
    viewRoleBlock + "const RELEASE_WARRANTY_STATUS_ROLES = new Set(["
  );
}

if (!service.includes("const buildWarrantyClaimWhere")) {
  const listServiceBlock = `
const buildWarrantyClaimWhere = (actor, query) => {
  const where = {};

  if (isSuperOwner(actor)) {
    if (query.branchId) {
      where.branchId = query.branchId;
    }
  } else {
    where.branchId = actor.branchId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.customerId) {
    where.customerId = query.customerId;
  }

  if (query.itemId) {
    where.itemId = query.itemId;
  }

  if (query.serialId) {
    where.serialId = query.serialId;
  }

  if (query.saleId) {
    where.saleId = query.saleId;
  }

  if (query.saleItemId) {
    where.saleItemId = query.saleItemId;
  }

  if (query.supplierName) {
    where.supplierName = {
      contains: query.supplierName,
      mode: "insensitive",
    };
  }

  if (query.search) {
    where.OR = [
      {
        claimCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        issueDescription: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        customerComplaint: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        diagnosis: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        actionTaken: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        supplierName: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        supplierReferenceNo: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        remarks: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    where.receivedAt = {};

    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);
      dateFrom.setHours(0, 0, 0, 0);
      where.receivedAt.gte = dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      where.receivedAt.lte = dateTo;
    }
  }

  return where;
};

const getWarrantyClaims = async (actor, query) => {
  ensureCanViewWarrantyClaim(actor);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const where = buildWarrantyClaimWhere(actor, query);

  const [data, total] = await prisma.$transaction([
    prisma.warrantyClaim.findMany({
      where,
      include: WARRANTY_CLAIM_INCLUDE,
      orderBy: {
        receivedAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.warrantyClaim.count({
      where,
    }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getWarrantyClaimById = async (actor, warrantyClaimId) => {
  ensureCanViewWarrantyClaim(actor);

  const warrantyClaim = await prisma.warrantyClaim.findUnique({
    where: {
      id: warrantyClaimId,
    },
    include: WARRANTY_CLAIM_INCLUDE,
  });

  if (!warrantyClaim) {
    const error = new Error("WARRANTY_CLAIM_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  ensureCanAccessWarrantyClaimBranch(actor, warrantyClaim);

  return warrantyClaim;
};

`;

  service = service.replace(
    "const releaseWarrantyClaim = async",
    listServiceBlock + "const releaseWarrantyClaim = async"
  );
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createWarrantyClaim,
  getWarrantyClaimById,
  getWarrantyClaims,
  releaseWarrantyClaim,
  updateWarrantyClaimStatus,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("WARRANTY_CLAIM_VIEW_FORBIDDEN")) {
  controller = controller.replace(
    `    WARRANTY_CLAIM_CREATE_FORBIDDEN: [403, "You are not allowed to create warranty claims."],`,
    `    WARRANTY_CLAIM_CREATE_FORBIDDEN: [403, "You are not allowed to create warranty claims."],
    WARRANTY_CLAIM_VIEW_FORBIDDEN: [403, "You are not allowed to view warranty claims."],`
  );
}

if (!controller.includes("const getWarrantyClaims = async")) {
  const controllerBlock = `
const getWarrantyClaims = async (req, res, next) => {
  try {
    const result = await warrantyClaimService.getWarrantyClaims(
      req.user,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Warranty claims fetched successfully",
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

const getWarrantyClaimById = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.getWarrantyClaimById(
      req.user,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Warranty claim fetched successfully",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

`;

  controller = controller.replace(
    "const releaseWarrantyClaim = async",
    controllerBlock + "const releaseWarrantyClaim = async"
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createWarrantyClaim,
  getWarrantyClaimById,
  getWarrantyClaims,
  releaseWarrantyClaim,
  updateWarrantyClaimStatus,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("listWarrantyClaimsSchema")) {
  route = route.replace(
    "  createWarrantyClaimSchema,",
    "  createWarrantyClaimSchema,\n  listWarrantyClaimsSchema,"
  );
}

if (!route.includes("warrantyClaimIdParamSchema")) {
  route = route.replace(
    "  releaseWarrantyClaimSchema,",
    "  releaseWarrantyClaimSchema,\n  warrantyClaimIdParamSchema,"
  );
}

if (!route.includes('router.get(')) {
  route = route.replace(
    "router.use(protect);",
    `router.use(protect);

router.get(
  "/",
  validate(listWarrantyClaimsSchema),
  warrantyClaimController.getWarrantyClaims
);

router.get(
  "/:id",
  validate(warrantyClaimIdParamSchema),
  warrantyClaimController.getWarrantyClaimById
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 12F warranty list/view patched.");
