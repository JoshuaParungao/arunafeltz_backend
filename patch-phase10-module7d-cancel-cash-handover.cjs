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

if (!validation.includes("cancelCashHandoverSchema")) {
  const schemaBlock = `
const cancelCashHandoverSchema = z.object({
  params: z.object({
    handoverId: z.string().trim().min(1, "Cash handover ID is required"),
  }),
  body: z.object({
    cancellationReason: z.string().trim().min(1, "Cancellation reason is required"),
  }),
});

`;

  validation = validation.replace(
    "module.exports = {",
    `${schemaBlock}module.exports = {`
  );

  validation = validation.replace(
    "  receiveCashHandoverSchema,",
    "  receiveCashHandoverSchema,\n  cancelCashHandoverSchema,"
  );
}

fs.writeFileSync(validationPath, validation);

/* =========================
   SERVICE PATCH
========================= */
let service = fs.readFileSync(servicePath, "utf8");

if (!service.includes("const cancelCashHandover")) {
  const cancelBlock = `
const cancelCashHandover = async (actor, handoverId, payload) => {
  ensureOwnerAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const handover = await tx.cashHandover.findUnique({
      where: {
        id: handoverId,
      },
      include: {
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
      const error = new Error("CASH_HANDOVER_NOT_CANCELLABLE");
      error.statusCode = 400;
      throw error;
    }

    const cancelledHandover = await tx.cashHandover.update({
      where: {
        id: handover.id,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancellationReason: payload.cancellationReason,
      },
      include: CASH_HANDOVER_INCLUDE,
    });

    return cancelledHandover;
  });
};

`;

  const receiveBlock = findFunctionBlock(service, "receiveCashHandover");
  service = service.slice(0, receiveBlock.start) + cancelBlock + service.slice(receiveBlock.start);
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

if (!controller.includes("CASH_HANDOVER_NOT_CANCELLABLE")) {
  controller = controller.replace(
    `    CASH_HANDOVER_NOT_RECEIVABLE: [400, "Only pending cash handovers can be received."],`,
    `    CASH_HANDOVER_NOT_RECEIVABLE: [400, "Only pending cash handovers can be received."],
    CASH_HANDOVER_NOT_CANCELLABLE: [400, "Only pending cash handovers can be cancelled."],`
  );
}

if (!controller.includes("const cancelCashHandover")) {
  const controllerBlock = `
const cancelCashHandover = async (req, res, next) => {
  try {
    const handover = await cashBoxService.cancelCashHandover(
      req.user,
      req.params.handoverId,
      req.body
    );

    return res.status(200).json({
      success: true,
      message: "Cash handover cancelled successfully",
      data: handover,
    });
  } catch (error) {
    return handleCashBoxError(error, res, next);
  }
};

`;

  controller = controller.replace(
    "const receiveCashHandover = async",
    `${controllerBlock}const receiveCashHandover = async`
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

if (!route.includes("cancelCashHandoverSchema")) {
  route = route.replace(
    `  receiveCashHandoverSchema,`,
    `  receiveCashHandoverSchema,
  cancelCashHandoverSchema,`
  );
}

if (!route.includes('"/handovers/:handoverId/cancel"')) {
  route = route.replace(
    `router.post(
  "/handovers/:handoverId/receive",
  validate(receiveCashHandoverSchema),
  cashBoxController.receiveCashHandover
);`,
    `router.post(
  "/handovers/:handoverId/cancel",
  validate(cancelCashHandoverSchema),
  cashBoxController.cancelCashHandover
);

router.post(
  "/handovers/:handoverId/receive",
  validate(receiveCashHandoverSchema),
  cashBoxController.receiveCashHandover
);`
  );
}

fs.writeFileSync(routePath, route);

console.log("DONE: Phase 10 Module 7D cancel cash handover patched.");
