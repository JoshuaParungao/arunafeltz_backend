const fs = require("fs");

const validationPath = "./src/modules/service-jobs/validations/serviceJob.validation.js";
const servicePath = "./src/modules/service-jobs/services/serviceJob.service.js";
const controllerPath = "./src/modules/service-jobs/controllers/serviceJob.controller.js";
const routePath = "./src/modules/service-jobs/routes/serviceJob.routes.js";

/* =========================
   VALIDATION PATCH
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("updateServiceJobStatusSchema")) {
  const schemaBlock = `
const serviceJobIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Service job ID is required"),
  }),
});

const updateServiceJobStatusSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Service job ID is required"),
  }),
  body: z.object({
    status: z.enum([
      "IN_PROGRESS",
      "READY_FOR_RELEASE",
      "COMPLETED",
      "CANCELLED",
    ]),
    diagnosis: optionalString,
    serviceNotes: optionalString,
    finalServiceCharge: nonNegativeMoney.optional(),
    cancellationReason: optionalString,
  }),
});

`;

  validation = validation.replace(
    "module.exports = {",
    `${schemaBlock}module.exports = {`
  );

  validation = validation.replace(
    "  createServiceJobSchema,",
    "  createServiceJobSchema,\n  serviceJobIdParamSchema,\n  updateServiceJobStatusSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE PATCH
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const STATUS_TRANSITIONS")) {
  const constantsBlock = `
const UPDATE_SERVICE_JOB_STATUS_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
]);

const STATUS_TRANSITIONS = {
  PENDING: new Set(["IN_PROGRESS", "CANCELLED"]),
  IN_PROGRESS: new Set(["READY_FOR_RELEASE", "CANCELLED"]),
  READY_FOR_RELEASE: new Set(["COMPLETED", "CANCELLED"]),
  COMPLETED: new Set([]),
  CANCELLED: new Set([]),
};

const ensureCanUpdateServiceJobStatus = (actor) => {
  if (!UPDATE_SERVICE_JOB_STATUS_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_STATUS_UPDATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const ensureCanAccessServiceJobBranch = (actor, serviceJob) => {
  if (!isSuperOwner(actor) && serviceJob.branchId !== actor.branchId) {
    const error = new Error("SERVICE_JOB_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }
};

`;

  service = service.replace(
    "const SERVICE_JOB_INCLUDE = {",
    `${constantsBlock}const SERVICE_JOB_INCLUDE = {`
  );
}

if (!service.includes("const updateServiceJobStatus")) {
  const updateBlock = `
const updateServiceJobStatus = async (actor, serviceJobId, payload) => {
  ensureCanUpdateServiceJobStatus(actor);

  return prisma.$transaction(async (tx) => {
    const serviceJob = await tx.serviceJob.findUnique({
      where: {
        id: serviceJobId,
      },
      include: {
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!serviceJob) {
      const error = new Error("SERVICE_JOB_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessServiceJobBranch(actor, serviceJob);

    const allowedNextStatuses = STATUS_TRANSITIONS[serviceJob.status] || new Set();

    if (!allowedNextStatuses.has(payload.status)) {
      const error = new Error("INVALID_SERVICE_JOB_STATUS_TRANSITION");
      error.statusCode = 400;
      throw error;
    }

    const updateData = {
      status: payload.status,
      updatedById: actor.id,
    };

    if (payload.diagnosis !== undefined) {
      updateData.diagnosis = payload.diagnosis || null;
    }

    if (payload.serviceNotes !== undefined) {
      updateData.serviceNotes = payload.serviceNotes || null;
    }

    if (payload.status === "IN_PROGRESS") {
      updateData.startedAt = new Date();
    }

    if (payload.status === "READY_FOR_RELEASE") {
      updateData.readyAt = new Date();
    }

    if (payload.status === "COMPLETED") {
      if (payload.finalServiceCharge === undefined) {
        const error = new Error("FINAL_SERVICE_CHARGE_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      updateData.finalServiceCharge = toMoneyString(payload.finalServiceCharge);
      updateData.completedAt = new Date();
    }

    if (payload.status === "CANCELLED") {
      if (!payload.cancellationReason) {
        const error = new Error("CANCELLATION_REASON_REQUIRED");
        error.statusCode = 400;
        throw error;
      }

      updateData.cancellationReason = payload.cancellationReason;
      updateData.cancelledAt = new Date();
      updateData.cancelledById = actor.id;
    }

    const updatedServiceJob = await tx.serviceJob.update({
      where: {
        id: serviceJob.id,
      },
      data: updateData,
      include: SERVICE_JOB_INCLUDE,
    });

    return updatedServiceJob;
  });
};

`;

  service = service.replace(
    "module.exports = {",
    `${updateBlock}module.exports = {`
  );
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createServiceJob,
  updateServiceJobStatus,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER PATCH
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("SERVICE_JOB_STATUS_UPDATE_FORBIDDEN")) {
  controller = controller.replace(
    `    ASSIGNED_TECHNICIAN_NOT_FOUND: [404, "Assigned technician not found."],`,
    `    ASSIGNED_TECHNICIAN_NOT_FOUND: [404, "Assigned technician not found."],
    SERVICE_JOB_STATUS_UPDATE_FORBIDDEN: [403, "You are not allowed to update service job status."],
    SERVICE_JOB_NOT_FOUND: [404, "Service job not found."],
    INVALID_SERVICE_JOB_STATUS_TRANSITION: [400, "Invalid service job status transition."],
    FINAL_SERVICE_CHARGE_REQUIRED: [400, "Final service charge is required when completing a service job."],
    CANCELLATION_REASON_REQUIRED: [400, "Cancellation reason is required when cancelling a service job."],`
  );
}

if (!controller.includes("const updateServiceJobStatus")) {
  const controllerBlock = `
const updateServiceJobStatus = async (req, res, next) => {
  try {
    const serviceJob = await serviceJobService.updateServiceJobStatus(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Service job status updated successfully",
      data: serviceJob,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

`;

  controller = controller.replace(
    "module.exports = {",
    `${controllerBlock}module.exports = {`
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createServiceJob,
  updateServiceJobStatus,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE PATCH
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("updateServiceJobStatusSchema")) {
  route = route.replace(
    `  createServiceJobSchema,`,
    `  createServiceJobSchema,
  updateServiceJobStatusSchema,`
  );
}

if (!route.includes('"/:id/status"')) {
  route = route.replace(
    `router.post(
  "/",
  validate(createServiceJobSchema),
  serviceJobController.createServiceJob
);`,
    `router.patch(
  "/:id/status",
  validate(updateServiceJobStatusSchema),
  serviceJobController.updateServiceJobStatus
);

router.post(
  "/",
  validate(createServiceJobSchema),
  serviceJobController.createServiceJob
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 11 Module 11C update service job status patched.");
