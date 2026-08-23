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

if (!validation.includes(`"HANDOVER_OUT"`)) {
  validation = validation.replace(
    `  "CREDIT_COLLECTION",
  "ADJUSTMENT_IN",`,
    `  "CREDIT_COLLECTION",
  "HANDOVER_OUT",
  "ADJUSTMENT_IN",`
  );
}

if (!validation.includes("receiveCashHandoverSchema")) {
  const schemaBlock = `
const receiveCashHandoverSchema = z.object({
  params: z.object({
    handoverId: z.string().trim().min(1, "Cash handover ID is required"),
  }),
  body: z.object({
    remarks: optionalString,
  }),
});

`;

  validation = validation.replace(
    "module.exports = {",
    `${schemaBlock}module.exports = {`
  );

  validation = validation.replace(
    "  createCashHandoverSchema,",
    "  createCashHandoverSchema,\n  receiveCashHandoverSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE PATCH
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const receiveCashHandover")) {
  const receiveBlock = `
const receiveCashHandover = async (actor, handoverId, payload = {}) => {
  ensureOwnerAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const handover = await tx.cashHandover.findUnique({
      where: {
        id: handoverId,
      },
      include: {
        cashBox: {
          include: {
            branch: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        branch: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
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

    if (handover.status !== "PENDING") {
      const error = new Error("CASH_HANDOVER_NOT_RECEIVABLE");
      error.statusCode = 400;
      throw error;
    }

    const cashBox = handover.cashBox;

    if (cashBox.status !== "ACTIVE") {
      const error = new Error("CASH_BOX_NOT_ACTIVE");
      error.statusCode = 400;
      throw error;
    }

    const amount = toMoney(Number(handover.amount));
    const balanceBefore = toMoney(Number(cashBox.currentBalance));

    if (amount > balanceBefore) {
      const error = new Error("INSUFFICIENT_CASH_BALANCE");
      error.statusCode = 400;
      throw error;
    }

    const balanceAfter = toMoney(balanceBefore - amount);
    const transactionCode = await generateCashTransactionCode(
      tx,
      handover.branch.code,
      handover.branchId
    );

    const transaction = await tx.cashTransaction.create({
      data: {
        transactionCode,
        type: "HANDOVER_OUT",
        status: "POSTED",
        source: "SYSTEM_ADJUSTMENT",
        amount: toMoneyString(amount),
        balanceBefore: toMoneyString(balanceBefore),
        balanceAfter: toMoneyString(balanceAfter),
        description: \`Cash handover received: \${handover.handoverCode}.\`,
        referenceNo: null,
        sourceId: handover.id,
        sourceCode: handover.handoverCode,
        transactionDate: new Date(),
        cashBoxId: cashBox.id,
        branchId: handover.branchId,
        createdById: actor.id,
      },
      include: CASH_TRANSACTION_INCLUDE,
    });

    await tx.cashBox.update({
      where: {
        id: cashBox.id,
      },
      data: {
        currentBalance: toMoneyString(balanceAfter),
        updatedById: actor.id,
      },
    });

    const receivedHandover = await tx.cashHandover.update({
      where: {
        id: handover.id,
      },
      data: {
        status: "RECEIVED",
        receivedAt: new Date(),
        receivedById: actor.id,
        remarks: payload.remarks || handover.remarks,
      },
      include: CASH_HANDOVER_INCLUDE,
    });

    return {
      handover: receivedHandover,
      transaction,
    };
  });
};

`;

  const createTxBlock = findFunctionBlock(service, "createCashTransaction");
  service = service.slice(0, createTxBlock.start) + receiveBlock + service.slice(createTxBlock.start);
}

service = service.replace(
  /module\.exports\s*=\s*{[\s\S]*?};/,
  `module.exports = {
  getCashBoxes,
  getCashBoxById,
  getCashTransactions,
  getCashTransactionById,
  createCashHandover,
  receiveCashHandover,
  createCashTransaction,
  cancelCashTransaction,
};`
);

fs.writeFileSync(servicePath, service);

/* =========================
   CONTROLLER PATCH
========================= */
let controller = fs.readFileSync(controllerPath, "utf8");

if (!controller.includes("CASH_HANDOVER_NOT_FOUND")) {
  controller = controller.replace(
    `    CASH_HANDOVER_TO_USER_NOT_FOUND: [404, "Cash handover receiving user not found."],`,
    `    CASH_HANDOVER_TO_USER_NOT_FOUND: [404, "Cash handover receiving user not found."],
    CASH_HANDOVER_NOT_FOUND: [404, "Cash handover not found."],
    CASH_HANDOVER_NOT_RECEIVABLE: [400, "Only pending cash handovers can be received."],`
  );
}

if (!controller.includes("const receiveCashHandover")) {
  const controllerBlock = `
const receiveCashHandover = async (req, res, next) => {
  try {
    const result = await cashBoxService.receiveCashHandover(
      req.user,
      req.params.handoverId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Cash handover received successfully",
      data: result,
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
  createCashHandover,
  receiveCashHandover,
  createCashTransaction,
  cancelCashTransaction,
};`
);

fs.writeFileSync(controllerPath, controller);

/* =========================
   ROUTE PATCH
========================= */
let route = fs.readFileSync(routePath, "utf8");

if (!route.includes("receiveCashHandoverSchema")) {
  route = route.replace(
    `  createCashHandoverSchema,`,
    `  createCashHandoverSchema,
  receiveCashHandoverSchema,`
  );
}

if (!route.includes('"/handovers/:handoverId/receive"')) {
  route = route.replace(
    `router.post(
  "/:id/handovers",
  validate(createCashHandoverSchema),
  cashBoxController.createCashHandover
);`,
    `router.post(
  "/handovers/:handoverId/receive",
  validate(receiveCashHandoverSchema),
  cashBoxController.receiveCashHandover
);

router.post(
  "/:id/handovers",
  validate(createCashHandoverSchema),
  cashBoxController.createCashHandover
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 10 Module 7C receive cash handover patched.");
