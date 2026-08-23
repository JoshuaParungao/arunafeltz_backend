const fs = require("fs");

const validationPath = "./src/modules/service-jobs/validations/serviceJob.validation.js";
const servicePath = "./src/modules/service-jobs/services/serviceJob.service.js";
const controllerPath = "./src/modules/service-jobs/controllers/serviceJob.controller.js";
const routePath = "./src/modules/service-jobs/routes/serviceJob.routes.js";

/* =========================
   VALIDATION PATCH
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("listServiceJobsSchema")) {
  const schemaBlock = `
const listServiceJobsSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    status: z
      .enum([
        "PENDING",
        "IN_PROGRESS",
        "READY_FOR_RELEASE",
        "COMPLETED",
        "CANCELLED",
      ])
      .optional(),
    customerId: z.string().trim().min(1).optional(),
    assignedTechnicianId: z.string().trim().min(1).optional(),
    search: z.string().trim().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  }),
});

`;

  validation = validation.replace(
    "module.exports = {",
    `${schemaBlock}module.exports = {`
  );

  validation = validation.replace(
    "  createServiceJobSchema,",
    "  createServiceJobSchema,\n  listServiceJobsSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE PATCH
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const VIEW_SERVICE_JOB_ROLES")) {
  const constantsBlock = `
const VIEW_SERVICE_JOB_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "TECHNICIAN",
  "CASHIER",
]);

const ensureCanViewServiceJobs = (actor) => {
  if (!VIEW_SERVICE_JOB_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_JOB_VIEW_FORBIDDEN");
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
    "const UPDATE_SERVICE_JOB_STATUS_ROLES = new Set([",
    `${constantsBlock}const UPDATE_SERVICE_JOB_STATUS_ROLES = new Set([`
  );
}

if (!service.includes("const buildServiceJobWhere")) {
  const listViewBlock = `
const buildServiceJobWhere = (actor, query = {}) => {
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

  if (query.assignedTechnicianId) {
    where.assignedTechnicianId = query.assignedTechnicianId;
  }

  if (query.dateFrom || query.dateTo) {
    where.receivedAt = {};

    if (query.dateFrom) {
      where.receivedAt.gte = query.dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      where.receivedAt.lte = dateTo;
    }
  }

  if (query.search) {
    where.OR = [
      {
        jobCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        jobTitle: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        deviceDescription: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        customer: {
          fullName: {
            contains: query.search,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  return where;
};

const getServiceJobs = async (actor, query = {}) => {
  ensureCanViewServiceJobs(actor);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const where = buildServiceJobWhere(actor, query);

  const [data, total] = await prisma.$transaction([
    prisma.serviceJob.findMany({
      where,
      include: SERVICE_JOB_INCLUDE,
      orderBy: {
        receivedAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.serviceJob.count({
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

const getServiceJobById = async (actor, serviceJobId) => {
  ensureCanViewServiceJobs(actor);

  const serviceJob = await prisma.serviceJob.findUnique({
    where: {
      id: serviceJobId,
    },
    include: SERVICE_JOB_INCLUDE,
  });

  if (!serviceJob) {
    const error = new Error("SERVICE_JOB_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  ensureCanAccessServiceJobBranch(actor, serviceJob);

  return serviceJob;
};

`;

  service = service.replace(
    "const updateServiceJobStatus = async",
    `${listViewBlock}const updateServiceJobStatus = async`
  );
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createServiceJob,
  getServiceJobs,
  getServiceJobById,
  updateServiceJobStatus,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER PATCH
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("SERVICE_JOB_VIEW_FORBIDDEN")) {
  controller = controller.replace(
    `    SERVICE_JOB_STATUS_UPDATE_FORBIDDEN: [403, "You are not allowed to update service job status."],`,
    `    SERVICE_JOB_VIEW_FORBIDDEN: [403, "You are not allowed to view service jobs."],
    SERVICE_JOB_STATUS_UPDATE_FORBIDDEN: [403, "You are not allowed to update service job status."],`
  );
}

if (!controller.includes("const getServiceJobs")) {
  const controllerBlock = `
const getServiceJobs = async (req, res, next) => {
  try {
    const result = await serviceJobService.getServiceJobs(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Service jobs retrieved successfully",
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

const getServiceJobById = async (req, res, next) => {
  try {
    const serviceJob = await serviceJobService.getServiceJobById(
      req.user,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Service job retrieved successfully",
      data: serviceJob,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

`;

  controller = controller.replace(
    "const updateServiceJobStatus = async",
    `${controllerBlock}const updateServiceJobStatus = async`
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createServiceJob,
  getServiceJobs,
  getServiceJobById,
  updateServiceJobStatus,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE PATCH
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("listServiceJobsSchema")) {
  route = route.replace(
    `  createServiceJobSchema,`,
    `  createServiceJobSchema,
  listServiceJobsSchema,
  serviceJobIdParamSchema,`
  );
}

if (!route.includes("serviceJobController.getServiceJobs")) {
  route = route.replace(
    "router.use(protect);",
    `router.use(protect);

router.get(
  "/",
  validate(listServiceJobsSchema),
  serviceJobController.getServiceJobs
);

router.get(
  "/:id",
  validate(serviceJobIdParamSchema),
  serviceJobController.getServiceJobById
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 11 Module 11D list/view service jobs patched.");
