const fs = require("fs");

const validationPath = "./src/modules/warranty-claims/validations/warrantyClaim.validation.js";
const servicePath = "./src/modules/warranty-claims/services/warrantyClaim.service.js";
const controllerPath = "./src/modules/warranty-claims/controllers/warrantyClaim.controller.js";
const routePath = "./src/modules/warranty-claims/routes/warrantyClaim.routes.js";

/* =========================
   VALIDATION
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("releaseWarrantyClaimSchema")) {
  const schemaBlock = `
const releaseWarrantyClaimSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Warranty claim ID is required"),
  }),
  body: z.object({
    actionTaken: optionalString,
    remarks: optionalString,
  }),
});

`;

  validation = validation.replace(
    "module.exports = {",
    schemaBlock + "module.exports = {"
  );

  validation = validation.replace(
    "  createWarrantyClaimSchema,",
    "  createWarrantyClaimSchema,\n  releaseWarrantyClaimSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const RELEASE_WARRANTY_STATUS_ROLES")) {
  const roleBlock = `
const RELEASE_WARRANTY_STATUS_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
]);

const RELEASE_ALLOWED_STATUSES = new Set([
  "REPAIRED",
  "REPLACED",
  "REJECTED",
]);

const ensureCanReleaseWarrantyClaim = (actor) => {
  if (!RELEASE_WARRANTY_STATUS_ROLES.has(actor.role)) {
    const error = new Error("WARRANTY_RELEASE_FORBIDDEN");
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
    "const WARRANTY_STATUS_TRANSITIONS = {",
    roleBlock + "const WARRANTY_STATUS_TRANSITIONS = {"
  );
}

if (!service.includes("const releaseWarrantyClaim = async")) {
  const releaseBlock = `
const releaseWarrantyClaim = async (actor, warrantyClaimId, payload) => {
  ensureCanReleaseWarrantyClaim(actor);

  return prisma.$transaction(async (tx) => {
    const warrantyClaim = await tx.warrantyClaim.findUnique({
      where: {
        id: warrantyClaimId,
      },
    });

    if (!warrantyClaim) {
      const error = new Error("WARRANTY_CLAIM_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessWarrantyClaimBranch(actor, warrantyClaim);

    if (warrantyClaim.status === "OUT") {
      const error = new Error("WARRANTY_CLAIM_ALREADY_RELEASED");
      error.statusCode = 400;
      throw error;
    }

    if (!RELEASE_ALLOWED_STATUSES.has(warrantyClaim.status)) {
      const error = new Error("WARRANTY_CLAIM_NOT_READY_FOR_RELEASE");
      error.statusCode = 400;
      throw error;
    }

    return tx.warrantyClaim.update({
      where: {
        id: warrantyClaim.id,
      },
      data: {
        status: "OUT",
        actionTaken: payload.actionTaken ?? warrantyClaim.actionTaken,
        remarks: payload.remarks ?? warrantyClaim.remarks,
        releasedAt: warrantyClaim.releasedAt || new Date(),
        releasedById: actor.id,
        updatedById: actor.id,
        statusUpdatedById: actor.id,
      },
      include: WARRANTY_CLAIM_INCLUDE,
    });
  });
};

`;

  service = service.replace(
    "module.exports = {",
    releaseBlock + "module.exports = {"
  );
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createWarrantyClaim,
  releaseWarrantyClaim,
  updateWarrantyClaimStatus,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("WARRANTY_RELEASE_FORBIDDEN")) {
  controller = controller.replace(
    `    WARRANTY_STATUS_UPDATE_FORBIDDEN: [403, "You are not allowed to update warranty status."],`,
    `    WARRANTY_STATUS_UPDATE_FORBIDDEN: [403, "You are not allowed to update warranty status."],
    WARRANTY_RELEASE_FORBIDDEN: [403, "You are not allowed to release warranty claims."],
    WARRANTY_CLAIM_ALREADY_RELEASED: [400, "Warranty claim is already released."],
    WARRANTY_CLAIM_NOT_READY_FOR_RELEASE: [400, "Warranty claim is not ready for release."],`
  );
}

if (!controller.includes("const releaseWarrantyClaim = async")) {
  const controllerBlock = `
const releaseWarrantyClaim = async (req, res, next) => {
  try {
    const warrantyClaim = await warrantyClaimService.releaseWarrantyClaim(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Warranty claim released successfully",
      data: warrantyClaim,
    });
  } catch (error) {
    return handleWarrantyClaimError(error, res, next);
  }
};

`;

  controller = controller.replace(
    "const updateWarrantyClaimStatus = async",
    controllerBlock + "const updateWarrantyClaimStatus = async"
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createWarrantyClaim,
  releaseWarrantyClaim,
  updateWarrantyClaimStatus,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("releaseWarrantyClaimSchema")) {
  route = route.replace(
    "  createWarrantyClaimSchema,",
    "  createWarrantyClaimSchema,\n  releaseWarrantyClaimSchema,"
  );
}

if (!route.includes('"/:id/release"')) {
  route = route.replace(
    `router.patch(
  "/:id/status",
  validate(updateWarrantyClaimStatusSchema),
  warrantyClaimController.updateWarrantyClaimStatus
);`,
    `router.post(
  "/:id/release",
  validate(releaseWarrantyClaimSchema),
  warrantyClaimController.releaseWarrantyClaim
);

router.patch(
  "/:id/status",
  validate(updateWarrantyClaimStatusSchema),
  warrantyClaimController.updateWarrantyClaimStatus
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 12D warranty release endpoint patched.");
