const fs = require("fs");

const validationPath = "./src/modules/cash-boxes/validations/cashBox.validation.js";
const servicePath = "./src/modules/cash-boxes/services/cashBox.service.js";
const controllerPath = "./src/modules/cash-boxes/controllers/cashBox.controller.js";
const routePath = "./src/modules/cash-boxes/routes/cashBox.routes.js";

/* =========================
   VALIDATION
========================= */
let validation = fs.readFileSync(validationPath, "utf8");

if (!validation.includes("listCashBoxesSchema")) {
  validation = validation.replace(
    `const createCashTransactionSchema = z.object({`,
    `const cashBoxStatusValues = ["ACTIVE", "INACTIVE"];

const cashTransactionTypeValues = [
  "CASH_IN",
  "CASH_OUT",
  "SALE_PAYMENT",
  "CREDIT_COLLECTION",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
];

const cashTransactionStatusValues = ["POSTED", "CANCELLED"];

const cashTransactionSourceValues = [
  "MANUAL",
  "SALE",
  "CREDIT_COLLECTION",
  "SYSTEM_ADJUSTMENT",
];

const listCashBoxesSchema = z.object({
  query: z.object({
    branchId: z.string().trim().min(1).optional(),
    status: z.enum(cashBoxStatusValues).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

const cashBoxIdParamSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Cash box ID is required"),
  }),
});

const listCashTransactionsSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Cash box ID is required"),
  }),
  query: z.object({
    type: z.enum(cashTransactionTypeValues).optional(),
    status: z.enum(cashTransactionStatusValues).optional(),
    source: z.enum(cashTransactionSourceValues).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});

const cashTransactionIdParamSchema = z.object({
  params: z.object({
    transactionId: z.string().trim().min(1, "Cash transaction ID is required"),
  }),
});

const createCashTransactionSchema = z.object({`
  );
}

validation = validation.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  createCashTransactionSchema,
  listCashBoxesSchema,
  cashBoxIdParamSchema,
  listCashTransactionsSchema,
  cashTransactionIdParamSchema,
};`
);

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const parsePagination")) {
  service = service.replace(
    `const parseOptionalDate = (value) => {`,
    `const parsePagination = (query = {}) => {
  const page = Number(query.page || 1);
  const limit = Math.min(Number(query.limit || 20), 100);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
  };
};

const parseOptionalDate = (value) => {`
  );
}

if (!service.includes("const getCashBoxes")) {
  service = service.replace(
    `const createCashTransaction = async (actor, cashBoxId, payload) => {`,
    `const CASH_BOX_LIST_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
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
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  _count: {
    select: {
      transactions: true,
    },
  },
};

const CASH_BOX_DETAIL_INCLUDE = {
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
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
  updatedBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  transactions: {
    orderBy: {
      transactionDate: "desc",
    },
    take: 20,
    include: {
      createdBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
      cancelledBy: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
        },
      },
    },
  },
};

const CASH_TRANSACTION_INCLUDE = {
  cashBox: {
    select: {
      id: true,
      boxCode: true,
      name: true,
      currentBalance: true,
      status: true,
    },
  },
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
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
  cancelledBy: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
};

const resolveBranchFilter = (actor, branchId) => {
  if (isSuperOwner(actor)) {
    return branchId || undefined;
  }

  if (!actor.branchId) {
    const error = new Error("BRANCH_REQUIRED");
    error.statusCode = 400;
    throw error;
  }

  if (branchId && branchId !== actor.branchId) {
    const error = new Error("CASH_BOX_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return actor.branchId;
};

const getCashBoxes = async (actor, query = {}) => {
  ensureOwnerAdmin(actor);

  const { page, limit, skip } = parsePagination(query);
  const branchId = resolveBranchFilter(actor, query.branchId);

  const where = {};

  if (branchId) {
    where.branchId = branchId;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      {
        boxCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        name: {
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

  const [data, total] = await Promise.all([
    prisma.cashBox.findMany({
      where,
      include: CASH_BOX_LIST_INCLUDE,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.cashBox.count({
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

const getCashBoxById = async (actor, cashBoxId) => {
  ensureOwnerAdmin(actor);

  const cashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBoxId,
    },
    include: CASH_BOX_DETAIL_INCLUDE,
  });

  if (!cashBox) {
    const error = new Error("CASH_BOX_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (!isSuperOwner(actor) && cashBox.branchId !== actor.branchId) {
    const error = new Error("CASH_BOX_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return cashBox;
};

const getCashTransactions = async (actor, cashBoxId, query = {}) => {
  ensureOwnerAdmin(actor);

  const cashBox = await prisma.cashBox.findUnique({
    where: {
      id: cashBoxId,
    },
  });

  if (!cashBox) {
    const error = new Error("CASH_BOX_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (!isSuperOwner(actor) && cashBox.branchId !== actor.branchId) {
    const error = new Error("CASH_BOX_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  const { page, limit, skip } = parsePagination(query);

  const where = {
    cashBoxId,
  };

  if (query.type) {
    where.type = query.type;
  }

  if (query.status) {
    where.status = query.status;
  }

  if (query.source) {
    where.source = query.source;
  }

  if (query.search) {
    where.OR = [
      {
        transactionCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        referenceNo: {
          contains: query.search,
          mode: "insensitive",
        },
      },
      {
        sourceCode: {
          contains: query.search,
          mode: "insensitive",
        },
      },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.cashTransaction.findMany({
      where,
      include: CASH_TRANSACTION_INCLUDE,
      orderBy: {
        transactionDate: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.cashTransaction.count({
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

const getCashTransactionById = async (actor, transactionId) => {
  ensureOwnerAdmin(actor);

  const transaction = await prisma.cashTransaction.findUnique({
    where: {
      id: transactionId,
    },
    include: CASH_TRANSACTION_INCLUDE,
  });

  if (!transaction) {
    const error = new Error("CASH_TRANSACTION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  if (!isSuperOwner(actor) && transaction.branchId !== actor.branchId) {
    const error = new Error("CASH_TRANSACTION_NOT_FOUND");
    error.statusCode = 404;
    throw error;
  }

  return transaction;
};

const createCashTransaction = async (actor, cashBoxId, payload) => {`
  );
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  createCashTransaction,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("CASH_TRANSACTION_NOT_FOUND")) {
  controller = controller.replace(
    `    CASH_BOX_NOT_FOUND: [404, "Cash box not found."],`,
    `    CASH_BOX_NOT_FOUND: [404, "Cash box not found."],
    CASH_TRANSACTION_NOT_FOUND: [404, "Cash transaction not found."],
    BRANCH_REQUIRED: [400, "Branch is required."],`
  );
}

if (!controller.includes("const getCashBoxes")) {
  controller = controller.replace(
    `const createCashTransaction = async (req, res, next) => {`,
    `const getCashBoxes = async (req, res, next) => {
  try {
    const result = await cashBoxService.getCashBoxes(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Cash boxes retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const getCashBoxById = async (req, res, next) => {
  try {
    const cashBox = await cashBoxService.getCashBoxById(req.user, req.params.id);

    return res.status(200).json({
      success: true,
      message: "Cash box retrieved successfully",
      data: cashBox,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const getCashTransactions = async (req, res, next) => {
  try {
    const result = await cashBoxService.getCashTransactions(
      req.user,
      req.params.id,
      req.query
    );

    return res.status(200).json({
      success: true,
      message: "Cash transactions retrieved successfully",
      data: result,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const getCashTransactionById = async (req, res, next) => {
  try {
    const transaction = await cashBoxService.getCashTransactionById(
      req.user,
      req.params.transactionId
    );

    return res.status(200).json({
      success: true,
      message: "Cash transaction retrieved successfully",
      data: transaction,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

const createCashTransaction = async (req, res, next) => {`
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  createCashTransaction,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE
========================= */
let route = fs.readFileSync(routePath, "utf8");

route = route.replace(
  `const {
  createCashTransactionSchema,
} = require("../validations/cashBox.validation");`,
  `const {
  createCashTransactionSchema,
  listCashBoxesSchema,
  cashBoxIdParamSchema,
  listCashTransactionsSchema,
  cashTransactionIdParamSchema,
} = require("../validations/cashBox.validation");`
);

if (!route.includes('"/transactions/:transactionId"')) {
  route = route.replace(
    `router.post(
  "/:id/transactions",
  validate(createCashTransactionSchema),
  cashBoxController.createCashTransaction
);`,
    `router.get(
  "/",
  validate(listCashBoxesSchema),
  cashBoxController.getCashBoxes
);

router.get(
  "/transactions/:transactionId",
  validate(cashTransactionIdParamSchema),
  cashBoxController.getCashTransactionById
);

router.get(
  "/:id",
  validate(cashBoxIdParamSchema),
  cashBoxController.getCashBoxById
);

router.get(
  "/:id/transactions",
  validate(listCashTransactionsSchema),
  cashBoxController.getCashTransactions
);

router.post(
  "/:id/transactions",
  validate(createCashTransactionSchema),
  cashBoxController.createCashTransaction
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 10 Module 4 cash box list/view patched.");
