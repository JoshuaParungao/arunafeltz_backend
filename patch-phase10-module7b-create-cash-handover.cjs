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

if (!validation.includes("createCashHandoverSchema")) {
  const schemaBlock = `
const createCashHandoverSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Cash box ID is required"),
  }),
  body: z.object({
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    toUserId: z.string().trim().min(1).optional(),
    remarks: optionalString,
  }),
});

`;

  validation = validation.replace(
    "module.exports = {",
    `${schemaBlock}module.exports = {`
  );

  validation = validation.replace(
    "  cancelCashTransactionSchema,",
    "  cancelCashTransactionSchema,\n  createCashHandoverSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE PATCH
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const generateCashHandoverCode")) {
  const helperBlock = `
const generateCashHandoverCode = async (tx, branchCode, branchId) => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const datePart = \`\${yyyy}\${mm}\${dd}\`;
  const prefix = \`HANDOVER-\${branchCode}-\${datePart}-\`;

  const startOfDay = new Date(yyyy, date.getMonth(), date.getDate());
  const endOfDay = new Date(yyyy, date.getMonth(), date.getDate() + 1);

  const count = await tx.cashHandover.count({
    where: {
      branchId,
      createdAt: {
        gte: startOfDay,
        lt: endOfDay,
      },
    },
  });

  return \`\${prefix}\${String(count + 1).padStart(4, "0")}\`;
};

`;

  service = service.replace(
    "const CASH_BOX_LIST_INCLUDE = {",
    `${helperBlock}const CASH_BOX_LIST_INCLUDE = {`
  );
}

if (!service.includes("const CASH_HANDOVER_INCLUDE")) {
  const includeBlock = `
const CASH_HANDOVER_INCLUDE = {
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
  fromUser: {
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
    },
  },
  toUser: {
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
  receivedBy: {
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

`;

  service = service.replace(
    "const CASH_TRANSACTION_INCLUDE = {",
    `${includeBlock}const CASH_TRANSACTION_INCLUDE = {`
  );
}

if (!service.includes("const createCashHandover")) {
  const createHandoverBlock = `
const createCashHandover = async (actor, cashBoxId, payload) => {
  ensureOwnerAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const cashBox = await tx.cashBox.findUnique({
      where: {
        id: cashBoxId,
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

    if (cashBox.status !== "ACTIVE") {
      const error = new Error("CASH_BOX_NOT_ACTIVE");
      error.statusCode = 400;
      throw error;
    }

    let toUser = null;

    if (payload.toUserId) {
      toUser = await tx.user.findUnique({
        where: {
          id: payload.toUserId,
        },
        select: {
          id: true,
          branchId: true,
          status: true,
        },
      });

      if (!toUser || toUser.status !== "ACTIVE" || toUser.branchId !== cashBox.branchId) {
        const error = new Error("CASH_HANDOVER_TO_USER_NOT_FOUND");
        error.statusCode = 404;
        throw error;
      }
    }

    const amount = toMoney(payload.amount);
    const handoverCode = await generateCashHandoverCode(
      tx,
      cashBox.branch.code,
      cashBox.branchId
    );

    const handover = await tx.cashHandover.create({
      data: {
        handoverCode,
        status: "PENDING",
        amount: toMoneyString(amount),
        remarks: payload.remarks || null,
        cashBoxId: cashBox.id,
        branchId: cashBox.branchId,
        fromUserId: actor.id,
        toUserId: toUser ? toUser.id : null,
        createdById: actor.id,
      },
      include: CASH_HANDOVER_INCLUDE,
    });

    return handover;
  });
};

`;

  const createTxBlock = findFunctionBlock(service, "createCashTransaction");
  service = service.slice(0, createTxBlock.start) + createHandoverBlock + service.slice(createTxBlock.start);
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  createCashHandover,
  createCashTransaction,
  cancelCashTransaction,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER PATCH
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("CASH_HANDOVER_TO_USER_NOT_FOUND")) {
  controller = controller.replace(
    `    CASH_REVERSAL_NEGATIVE_BALANCE: [400, "Cash reversal would make cash box balance negative."],`,
    `    CASH_REVERSAL_NEGATIVE_BALANCE: [400, "Cash reversal would make cash box balance negative."],
    CASH_HANDOVER_TO_USER_NOT_FOUND: [404, "Cash handover receiving user not found."],`
  );
}

if (!controller.includes("const createCashHandover")) {
  const controllerBlock = `
const createCashHandover = async (req, res, next) => {
  try {
    const handover = await cashBoxService.createCashHandover(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(201).json({
      success: true,
      message: "Cash handover request created successfully",
      data: handover,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

`;

  controller = controller.replace(
    "const createCashTransaction = async",
    `${controllerBlock}const createCashTransaction = async`
  );
}

controller = controller.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  createCashHandover,
  createCashTransaction,
  cancelCashTransaction,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE PATCH
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("createCashHandoverSchema")) {
  route = route.replace(
    `  cancelCashTransactionSchema,`,
    `  cancelCashTransactionSchema,
  createCashHandoverSchema,`
  );
}

if (!route.includes('"/:id/handovers"')) {
  route = route.replace(
    `router.post(
  "/:id/transactions",
  validate(createCashTransactionSchema),
  cashBoxController.createCashTransaction
);`,
    `router.post(
  "/:id/handovers",
  validate(createCashHandoverSchema),
  cashBoxController.createCashHandover
);

router.post(
  "/:id/transactions",
  validate(createCashTransactionSchema),
  cashBoxController.createCashTransaction
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 10 Module 7B create cash handover patched.");
