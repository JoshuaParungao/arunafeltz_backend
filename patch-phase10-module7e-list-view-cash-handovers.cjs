const fs = require("fs");

const validationPath = "./src/modules/cash-boxes/validations/cashBox.validation.js";
const servicePath = "./src/modules/cash-boxes/services/cashBox.service.js";
const controllerPath = "./src/modules/cash-boxes/controllers/cashBox.controller.js";
const routePath = "./src/modules/cash-boxes/routes/cashBox.routes.js";

const findFunctionBlock = (content, functionName) => {
  const start = content.indexOf(`const ${functionName} = async`);

  if (start === -1) {
    throw new Error(`Cannot find function ${functionName}`);
  }

  const firstBrace = content.indexOf("{", start);

  if (firstBrace === -1) {
    throw new Error(`Cannot find opening brace for ${functionName}`);
  }

  let depth = 0;

  for (let i = firstBrace; i < content.length; i += 1) {
    if (content[i] === "{") depth += 1;
    if (content[i] === "}") depth -= 1;

    if (depth === 0) {
      const semicolon = content.indexOf(";", i);

      if (semicolon === -1) {
        throw new Error(`Cannot find semicolon for ${functionName}`);
      }

      return {
        start,
        end: semicolon + 1,
        text: content.slice(start, semicolon + 1),
      };
    }
  }

  throw new Error(`Cannot find closing brace for ${functionName}`);
};

/* =========================
   VALIDATION PATCH
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("listCashHandoversSchema")) {
  const schemaBlock = `
const listCashHandoversSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    cashBoxId: z.string().trim().min(1).optional(),
    fromUserId: z.string().trim().min(1).optional(),
    toUserId: z.string().trim().min(1).optional(),
    status: z.enum(["PENDING", "RECEIVED", "CANCELLED"]).optional(),
    dateFrom: z.string().trim().min(1).optional(),
    dateTo: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
  }),
});

const cashHandoverIdParamSchema = z.object({
  params: z.object({
    handoverId: z.string().trim().min(1, "Cash handover ID is required"),
  }),
});

`;

  validation = validation.replace(
    "module.exports = {",
    `${schemaBlock}module.exports = {`
  );

  validation = validation.replace(
    "  cancelCashHandoverSchema,",
    "  cancelCashHandoverSchema,\n  listCashHandoversSchema,\n  cashHandoverIdParamSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE PATCH
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const buildCashHandoverWhere")) {
  const helperBlock = `
const buildCashHandoverWhere = (actor, query = {}) => {
  const where = {};

  if (isSuperOwner(actor)) {
    if (query.branchId) {
      where.branchId = query.branchId;
    }
  } else {
    where.branchId = actor.branchId;
  }

  if (query.cashBoxId) {
    where.cashBoxId = query.cashBoxId;
  }

  if (query.fromUserId) {
    where.fromUserId = query.fromUserId;
  }

  if (query.toUserId) {
    where.toUserId = query.toUserId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.dateFrom || query.dateTo) {
    where.createdAt = {};

    if (query.dateFrom) {
      const dateFrom = new Date(query.dateFrom);

      if (Number.isNaN(dateFrom.getTime())) {
        const error = new Error("INVALID_DATE_FROM");
        error.statusCode = 400;
        throw error;
      }

      where.createdAt.gte = dateFrom;
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);

      if (Number.isNaN(dateTo.getTime())) {
        const error = new Error("INVALID_DATE_TO");
        error.statusCode = 400;
        throw error;
      }

      where.createdAt.lte = dateTo;
    }
  }

  return where;
};

`;

  service = service.replace(
    "const CASH_HANDOVER_INCLUDE = {",
    `${helperBlock}const CASH_HANDOVER_INCLUDE = {`
  );
}

if (!service.includes("const getCashHandovers")) {
  const serviceBlock = `
const getCashHandovers = async (actor, query = {}) => {
  ensureOwnerAdmin(actor);

  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const skip = (page - 1) * limit;

  const where = buildCashHandoverWhere(actor, query);

  const [items, total] = await Promise.all([
    prisma.cashHandover.findMany({
      where,
      include: CASH_HANDOVER_INCLUDE,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.cashHandover.count({
      where,
    }),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getCashHandoverById = async (actor, handoverId) => {
  ensureOwnerAdmin(actor);

  const handover = await prisma.cashHandover.findUnique({
    where: {
      id: handoverId,
    },
    include: CASH_HANDOVER_INCLUDE,
  });

  if (!handover) {
    const error = new Error("CASH_HANDOVER_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (!isSuperOwner(actor) && handover.branchId !== actor.branchId) {
    const error = new Error("CASH_HANDOVER_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return handover;
};

`;

  const createHandoverBlock = findFunctionBlock(service, "createCashHandover");
  service = service.slice(0, createHandoverBlock.start) + serviceBlock + service.slice(createHandoverBlock.start);
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  getCashHandovers,
  getCashHandoverById,
  createCashHandover,
  receiveCashHandover,
  cancelCashHandover,
  createCashTransaction,
  cancelCashTransaction,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER PATCH
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("INVALID_DATE_FROM")) {
  controller = controller.replace(
    `    CASH_HANDOVER_NOT_CANCELLABLE: [400, "Only pending cash handovers can be cancelled."],`,
    `    CASH_HANDOVER_NOT_CANCELLABLE: [400, "Only pending cash handovers can be cancelled."],
    INVALID_DATE_FROM: [400, "Invalid dateFrom value."],
    INVALID_DATE_TO: [400, "Invalid dateTo value."],`
  );
}

if (!controller.includes("const getCashHandovers")) {
  const controllerBlock = `
const getCashHandovers = async (req, res, next) => {
  try {
    const result = await cashBoxService.getCashHandovers(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Cash handovers retrieved successfully",
      data: result.items,
      meta: result.meta,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const getCashHandoverById = async (req, res, next) => {
  try {
    const handover = await cashBoxService.getCashHandoverById(
      req.user,
      req.params.handoverId
    );

    return res.status(200).json({
      success: true,
      message: "Cash handover retrieved successfully",
      data: handover,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

`;

  controller = controller.replace(
    "const createCashHandover = async",
    `${controllerBlock}const createCashHandover = async`
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  getCashHandovers,
  getCashHandoverById,
  createCashHandover,
  receiveCashHandover,
  cancelCashHandover,
  createCashTransaction,
  cancelCashTransaction,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE PATCH
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("listCashHandoversSchema")) {
  route = route.replace(
    `  cancelCashHandoverSchema,`,
    `  cancelCashHandoverSchema,
  listCashHandoversSchema,
  cashHandoverIdParamSchema,`
  );
}

if (!route.includes('router.get("/handovers"')) {
  route = route.replace(
    `router.post(
  "/handovers/:handoverId/cancel",
  validate(cancelCashHandoverSchema),
  cashBoxController.cancelCashHandover
);`,
    `router.get(
  "/handovers",
  validate(listCashHandoversSchema),
  cashBoxController.getCashHandovers
);

router.get(
  "/handovers/:handoverId",
  validate(cashHandoverIdParamSchema),
  cashBoxController.getCashHandoverById
);

router.post(
  "/handovers/:handoverId/cancel",
  validate(cancelCashHandoverSchema),
  cashBoxController.cancelCashHandover
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 10 Module 7E list/view cash handovers patched.");
