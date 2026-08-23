const fs = require("fs");

const validationPath = "./src/modules/service-jobs/validations/serviceJob.validation.js";
const servicePath = "./src/modules/service-jobs/services/serviceJob.service.js";
const controllerPath = "./src/modules/service-jobs/controllers/serviceJob.controller.js";
const routePath = "./src/modules/service-jobs/routes/serviceJob.routes.js";

/* =========================
   VALIDATION
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("createServicePaymentSchema")) {
  const schemaBlock = `
const createServicePaymentSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Service job ID is required"),
  }),
  body: z.object({
    paymentMethod: z.enum(["CASH", "GCASH", "BANK_TRANSFER", "CARD", "OTHER"]),
    amount: nonNegativeMoney,
    referenceNo: optionalString,
    remarks: optionalString,
  }),
});

`;

  validation = validation.replace(
    "module.exports = {",
    `${schemaBlock}module.exports = {`
  );

  validation = validation.replace(
    "  createServiceJobSchema,",
    "  createServiceJobSchema,\n  createServicePaymentSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes('require("../../cash-boxes/services/cashLink.service")')) {
  service = service.replace(
    'const prisma = require("../../../config/prisma");',
    'const prisma = require("../../../config/prisma");\nconst cashLinkService = require("../../cash-boxes/services/cashLink.service");'
  );
}

if (!service.includes("const CREATE_SERVICE_PAYMENT_ROLES")) {
  const constantsBlock = `
const CREATE_SERVICE_PAYMENT_ROLES = new Set([
  "SUPER_OWNER",
  "BRANCH_OWNER",
  "ADMIN",
  "CASHIER",
]);

const ensureCanCreateServicePayment = (actor) => {
  if (!CREATE_SERVICE_PAYMENT_ROLES.has(actor.role)) {
    const error = new Error("SERVICE_PAYMENT_CREATE_FORBIDDEN");
    error.statusCode = 403;
    throw error;
  }

  if (!isSuperOwner(actor) && !actor.branchId) {
    const error = new Error("USER_BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }
};

const generateServicePaymentCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = \`\${yyyy}\${mm}\${dd}\`;
  const prefix = \`SVCPAY-\${branchCode}-\${datePart}-\`;

  const latestPayment = await tx.servicePayment.findFirst({
    where: {
      branchId,
      paymentCode: {
        startsWith: prefix,
      },
    },
    orderBy: {
      paymentCode: "desc",
    },
    select: {
      paymentCode: true,
    },
  });

  let nextNumber = 1;

  if (latestPayment) {
    const latestNumberText = latestPayment.paymentCode.slice(prefix.length);
    const latestNumber = Number(latestNumberText);

    if (Number.isInteger(latestNumber) && latestNumber > 0) {
      nextNumber = latestNumber + 1;
    }
  }

  return \`\${prefix}\${String(nextNumber).padStart(4, "0")}\`;
};

`;

  service = service.replace(
    "const VIEW_SERVICE_JOB_ROLES = new Set([",
    `${constantsBlock}const VIEW_SERVICE_JOB_ROLES = new Set([`
  );
}

if (!service.includes("const SERVICE_PAYMENT_INCLUDE")) {
  const includeBlock = `
const SERVICE_PAYMENT_INCLUDE = {
  serviceJob: {
    select: {
      id: true,
      jobCode: true,
      jobTitle: true,
      status: true,
      finalServiceCharge: true,
    },
  },
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
  collectedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
};

`;

  service = service.replace(
    "const SERVICE_JOB_INCLUDE = {",
    `${includeBlock}const SERVICE_JOB_INCLUDE = {`
  );
}

if (!service.includes("const createServicePayment")) {
  const paymentBlock = `
const createServicePayment = async (actor, serviceJobId, payload) => {
  ensureCanCreateServicePayment(actor);

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
            status: true,
          },
        },
        customer: {
          select: {
            id: true,
          },
        },
        payment: true,
      },
    });

    if (!serviceJob) {
      const error = new Error("SERVICE_JOB_NOT_FOUND");
      error.statusCode = 404;
      throw error;
    }

    ensureCanAccessServiceJobBranch(actor, serviceJob);

    if (serviceJob.status !== "COMPLETED") {
      const error = new Error("SERVICE_JOB_NOT_COMPLETED");
      error.statusCode = 400;
      throw error;
    }

    if (serviceJob.payment) {
      const error = new Error("SERVICE_JOB_ALREADY_PAID");
      error.statusCode = 400;
      throw error;
    }

    const amount = toMoney(payload.amount);
    const finalServiceCharge = toMoney(Number(serviceJob.finalServiceCharge));

    if (amount !== finalServiceCharge) {
      const error = new Error("SERVICE_PAYMENT_AMOUNT_MISMATCH");
      error.statusCode = 400;
      throw error;
    }

    if (amount <= 0) {
      const error = new Error("SERVICE_PAYMENT_AMOUNT_REQUIRED");
      error.statusCode = 400;
      throw error;
    }

    const paymentCode = await generateServicePaymentCode(
      tx,
      serviceJob.branch.code,
      serviceJob.branch.id
    );

    const payment = await tx.servicePayment.create({
      data: {
        paymentCode,
        paymentMethod: payload.paymentMethod,
        status: "POSTED",
        amount: toMoneyString(amount),
        referenceNo: payload.referenceNo || null,
        remarks: payload.remarks || null,
        serviceJobId: serviceJob.id,
        branchId: serviceJob.branchId,
        customerId: serviceJob.customerId || null,
        collectedById: actor.id,
        createdById: actor.id,
      },
      include: SERVICE_PAYMENT_INCLUDE,
    });

    if (payload.paymentMethod === "CASH") {
      await cashLinkService.postSystemCashIn(tx, actor, serviceJob.branch, {
        type: "SERVICE_PAYMENT",
        source: "SERVICE_JOB",
        amount,
        description: \`Cash payment from service job \${serviceJob.jobCode}.\`,
        referenceNo: payload.referenceNo || null,
        sourceId: serviceJob.id,
        sourceCode: serviceJob.jobCode,
        transactionDate: payment.paidAt,
      });
    }

    return payment;
  });
};

`;

  service = service.replace(
    "const updateServiceJobStatus = async",
    `${paymentBlock}const updateServiceJobStatus = async`
  );
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createServiceJob,
  createServicePayment,
  getServiceJobs,
  getServiceJobById,
  updateServiceJobStatus,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("SERVICE_PAYMENT_CREATE_FORBIDDEN")) {
  controller = controller.replace(
    `    SERVICE_JOB_VIEW_FORBIDDEN: [403, "You are not allowed to view service jobs."],`,
    `    SERVICE_PAYMENT_CREATE_FORBIDDEN: [403, "You are not allowed to create service payments."],
    SERVICE_JOB_NOT_COMPLETED: [400, "Only completed service jobs can be paid."],
    SERVICE_JOB_ALREADY_PAID: [400, "Service job is already paid."],
    SERVICE_PAYMENT_AMOUNT_MISMATCH: [400, "Service payment amount must match final service charge."],
    SERVICE_PAYMENT_AMOUNT_REQUIRED: [400, "Service payment amount is required."],
    SERVICE_JOB_VIEW_FORBIDDEN: [403, "You are not allowed to view service jobs."],`
  );
}

if (!controller.includes("const createServicePayment")) {
  const controllerBlock = `
const createServicePayment = async (req, res, next) => {
  try {
    const payment = await serviceJobService.createServicePayment(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Service payment created successfully",
      data: payment,
    });
  } catch (error) {
    return handleServiceJobError(error, res, next);
  }
};

`;

  controller = controller.replace(
    "const getServiceJobs = async",
    `${controllerBlock}const getServiceJobs = async`
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createServiceJob,
  createServicePayment,
  getServiceJobs,
  getServiceJobById,
  updateServiceJobStatus,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("createServicePaymentSchema")) {
  route = route.replace(
    `  createServiceJobSchema,`,
    `  createServiceJobSchema,
  createServicePaymentSchema,`
  );
}

if (!route.includes('"/:id/payment"')) {
  route = route.replace(
    `router.patch(
  "/:id/status",
  validate(updateServiceJobStatusSchema),
  serviceJobController.updateServiceJobStatus
);`,
    `router.post(
  "/:id/payment",
  validate(createServicePaymentSchema),
  serviceJobController.createServicePayment
);

router.patch(
  "/:id/status",
  validate(updateServiceJobStatusSchema),
  serviceJobController.updateServiceJobStatus
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 11 Module 11E service payment endpoint patched.");
